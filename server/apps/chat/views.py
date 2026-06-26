from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ChatRoom, Message
from .serializers import (
    ChatRoomSerializer,
    MessageSerializer,
    MessageCreateSerializer,
)


# ─── 1. Chat room list ────────────────────────────────────────────────────────

class ChatRoomListView(generics.ListAPIView):
    """
    GET /api/v1/chat/rooms/

    Returns all chat rooms the logged-in user is part of.
    Used for the chat inbox screen — shows all conversations
    with last message preview and unread count.

    Ordered by most recently active (last message time) so the
    most recent conversation appears at the top — same as WhatsApp.

    Who can call it: any authenticated user (patient or doctor).
    """
    serializer_class   = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return ChatRoom.objects.filter(
            Q(patient=user) | Q(doctor=user)
        ).select_related(
            'patient', 'doctor', 'appointment'
        ).prefetch_related(
            'messages'
            # prefetch_related loads all messages in one query
            # so get_last_message() and get_unread_count() in the
            # serializer don't cause N+1 queries
        ).order_by('-updated_at')


# ─── 2. Chat room detail ──────────────────────────────────────────────────────

class ChatRoomDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/chat/rooms/<id>/

    Returns the full details of a single chat room.
    Called when the user opens a conversation.

    Also marks all unread messages as read since the user is
    now viewing the room.

    Who can call it: patient or doctor who is in this room.
    """
    serializer_class   = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        user = self.request.user
        room = get_object_or_404(
            ChatRoom,
            Q(patient=user) | Q(doctor=user),
            id=self.kwargs['room_id'],
        )
        # Mark messages as read since the user just opened the room
        room.mark_all_read(reader=user)
        return room

    def get_queryset(self):
        user = self.request.user
        return ChatRoom.objects.filter(
            Q(patient=user) | Q(doctor=user)
        ).select_related('patient', 'doctor', 'appointment')


# ─── 3. Create chat room ──────────────────────────────────────────────────────

class ChatRoomCreateView(APIView):
    """
    POST /api/v1/chat/rooms/

    Creates a new chat room linked to an appointment.
    If a room already exists for this appointment, returns the existing one
    instead of creating a duplicate.

    Body:
        { "appointment_id": "<uuid>" }

    Rules:
    - The appointment must exist
    - The logged-in user must be a participant in the appointment
    - The appointment must not be cancelled

    Who can call it: patient or doctor involved in the appointment.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from apps.appointments.models import Appointment

        appointment_id = request.data.get('appointment_id')
        if not appointment_id:
            return Response(
                {'error': 'appointment_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Fetch the appointment — user must be a participant
        appointment = get_object_or_404(
            Appointment,
            Q(patient=request.user) | Q(doctor=request.user),
            id=appointment_id,
        )

        # Cannot create a chat room for a cancelled appointment
        if appointment.status == Appointment.Status.CANCELLED:
            return Response(
                {'error': 'Cannot create a chat room for a cancelled appointment.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # get_or_create — if the room already exists, return it
        # If not, create it now
        room, created = ChatRoom.objects.get_or_create(
            appointment=appointment,
            defaults={
                'patient': appointment.patient,
                'doctor':  appointment.doctor,
            },
        )

        serializer = ChatRoomSerializer(room, context={'request': request})
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(serializer.data, status=response_status)


# ─── 4. Message history ───────────────────────────────────────────────────────

class MessageListView(generics.ListAPIView):
    """
    GET /api/v1/chat/rooms/<room_id>/messages/

    Returns paginated message history for a chat room.

    This is the REST fallback for loading message history.
    The primary path is the WebSocket consumer which sends history
    on connect. This endpoint is used:
    - Before the WebSocket connects (initial load)
    - When the WebSocket was unavailable
    - For pagination (loading older messages)

    Messages are ordered oldest first (how chats read).
    Use ?page=2 to load older messages.

    Who can call it: patient or doctor in this room.
    """
    serializer_class   = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user    = self.request.user
        room_id = self.kwargs['room_id']

        # Verify the user is in this room
        room = get_object_or_404(
            ChatRoom,
            Q(patient=user) | Q(doctor=user),
            id=room_id,
        )

        # Mark messages as read since the user is fetching them
        room.mark_all_read(reader=user)

        return Message.objects.filter(
            room=room
        ).select_related('sender').order_by('created_at')


# ─── 5. Send message via REST ─────────────────────────────────────────────────

class MessageCreateView(generics.CreateAPIView):
    """
    POST /api/v1/chat/rooms/<room_id>/messages/

    Sends a message via the REST API.
    This is the fallback for when the WebSocket connection drops.

    Body:
        { "content": "Hello Doctor, I have a question." }

    The sender is always the logged-in user — never sent in the body.

    Note: messages sent via this endpoint are saved to the DB but
    are NOT broadcast in real time via WebSocket. The recipient will
    see them next time they fetch message history or reconnect their
    WebSocket.

    Who can call it: patient or doctor in this room.
    """
    serializer_class   = MessageCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_room(self):
        user    = self.request.user
        room_id = self.kwargs['room_id']
        return get_object_or_404(
            ChatRoom,
            Q(patient=user) | Q(doctor=user),
            id=room_id,
            is_active=True,   # cannot send messages to inactive rooms
        )

    def create(self, request, *args, **kwargs):
        room = self.get_room()

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Save the message with the sender attached
        message = Message.objects.create(
            room=room,
            sender=request.user,
            content=serializer.validated_data['content'],
        )

        # Return the full message using the read serializer
        return Response(
            MessageSerializer(message, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )