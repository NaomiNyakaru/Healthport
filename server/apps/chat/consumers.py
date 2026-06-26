import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for real-time chat between a patient and a doctor.

    URL: ws://host/ws/chat/<room_id>/?token=<access_token>

    The room_id is the UUID of the ChatRoom object.
    The token is validated by JWTAuthMiddleware before this consumer
    is even called — so self.scope['user'] is already authenticated.

    This class is async (AsyncWebsocketConsumer) which means it can
    handle thousands of simultaneous connections efficiently without
    blocking the server.
    """

    # ── Connection ────────────────────────────────────────────────────────────

    async def connect(self):
        """
        Called when a WebSocket client tries to connect.

        Steps:
        1. Get the room_id from the URL
        2. Check the user is authenticated
        3. Check the user is a participant in this room
        4. Join the Redis channel group
        5. Accept the connection
        6. Send the last 50 messages as chat history
        """
        self.room_id    = self.scope['url_route']['kwargs']['room_id']
        self.room_group = f'chat_{self.room_id}'
        self.user       = self.scope['user']

        # Reject unauthenticated connections immediately
        if isinstance(self.user, AnonymousUser) or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        # Verify the user belongs to this chat room
        self.room = await self.get_room()
        if self.room is None:
            await self.close(code=4004)   # 4004 = room not found or not a participant
            return

        # Join the Redis channel group for this room.
        # Every consumer connected to the same room joins the same group.
        # When one consumer sends to the group, all others receive it.
        await self.channel_layer.group_add(
            self.room_group,
            self.channel_name,
        )

        # Accept the WebSocket connection — client is now connected
        await self.accept()

        # Send chat history so the user sees previous messages
        await self.send_history()

    # ── Disconnection ─────────────────────────────────────────────────────────

    async def disconnect(self, close_code):
        """
        Called when the WebSocket connection closes.
        We leave the Redis channel group so we stop receiving broadcasts.
        """
        if hasattr(self, 'room_group'):
            await self.channel_layer.group_discard(
                self.room_group,
                self.channel_name,
            )

    # ── Receiving a message ───────────────────────────────────────────────────

    async def receive(self, text_data):
        """
        Called when the client sends a message through the WebSocket.

        Expected JSON format from the app:
            { "message": "Hello Doctor, I have a question." }

        Steps:
        1. Parse the JSON
        2. Validate it's not empty
        3. Save the message to the database
        4. Broadcast it to everyone in the room group (including sender)
        """
        try:
            data    = json.loads(text_data)
            content = data.get('message', '').strip()
        except (json.JSONDecodeError, AttributeError):
            await self.send_error('Invalid message format.')
            return

        if not content:
            await self.send_error('Message cannot be empty.')
            return

        # Save to PostgreSQL — this is a sync DB operation wrapped
        # in database_sync_to_async so it doesn't block the event loop
        message = await self.save_message(content)

        # Broadcast to the Redis channel group.
        # This calls chat_message() on every consumer in the group
        # including this one (so the sender also sees their message).
        await self.channel_layer.group_send(
            self.room_group,
            {
                'type':       'chat_message',   # calls self.chat_message()
                'message_id': str(message.id),
                'content':    message.content,
                'sender_id':  str(message.sender.id),
                'sender_name': message.sender.full_name,
                'sender_avatar': message.sender.get_avatar_url(),
                'created_at': message.created_at.isoformat(),
                'is_read':    False,
            }
        )

    # ── Broadcast handler ─────────────────────────────────────────────────────

    async def chat_message(self, event):
        """
        Called by the channel layer when a message is broadcast to this group.
        Forwards the message to the WebSocket client.

        This is called on EVERY consumer in the group — both the sender's
        consumer and the recipient's consumer. The app handles showing the
        message on the correct side (sent vs received) based on sender_id.
        """
        await self.send(text_data=json.dumps({
            'type':          'message',
            'message_id':    event['message_id'],
            'content':       event['content'],
            'sender_id':     event['sender_id'],
            'sender_name':   event['sender_name'],
            'sender_avatar': event['sender_avatar'],
            'created_at':    event['created_at'],
            'is_read':       event['is_read'],
        }))

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def send_history(self):
        """
        Sends the last 50 messages when a user first connects.
        This populates the chat screen with previous messages.
        """
        messages = await self.get_recent_messages()

        # Mark unread messages as read since the user just opened the chat
        await self.mark_messages_read()

        await self.send(text_data=json.dumps({
            'type':     'history',
            'messages': messages,
        }))

    async def send_error(self, error_message):
        """Sends an error message back to the client without closing."""
        await self.send(text_data=json.dumps({
            'type':  'error',
            'error': error_message,
        }))

    # ── Database operations (sync wrapped for async) ──────────────────────────
    # These are regular Django ORM operations wrapped in database_sync_to_async
    # so they can be called from async code without blocking the event loop.

    @database_sync_to_async
    def get_room(self):
        """
        Fetches the ChatRoom and verifies the user is a participant.
        Returns None if the room doesn't exist or the user isn't in it.
        """
        from .models import ChatRoom
        try:
            room = ChatRoom.objects.select_related(
                'patient', 'doctor'
            ).get(id=self.room_id)

            # Only the patient and doctor of this room can connect
            if self.user not in [room.patient, room.doctor]:
                return None

            return room
        except ChatRoom.DoesNotExist:
            return None

    @database_sync_to_async
    def save_message(self, content):
        """Saves a new message to the database and returns it."""
        from .models import Message
        return Message.objects.create(
            room=self.room,
            sender=self.user,
            content=content,
        )

    @database_sync_to_async
    def get_recent_messages(self):
        """
        Returns the last 50 messages in this room as a list of dicts.
        We return dicts (not model instances) because they need to be
        JSON-serialisable for sending over the WebSocket.
        """
        from .models import Message
        messages = Message.objects.filter(
            room=self.room
        ).select_related('sender').order_by('-created_at')[:50]

        # Reverse so oldest messages appear first in the chat
        return [
            {
                'message_id':    str(m.id),
                'content':       m.content,
                'sender_id':     str(m.sender.id),
                'sender_name':   m.sender.full_name,
                'sender_avatar': m.sender.get_avatar_url(),
                'created_at':    m.created_at.isoformat(),
                'is_read':       m.is_read,
            }
            for m in reversed(list(messages))
        ]

    @database_sync_to_async
    def mark_messages_read(self):
        """Marks all unread messages from the other participant as read."""
        self.room.mark_all_read(reader=self.user)