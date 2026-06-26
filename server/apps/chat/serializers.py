from rest_framework import serializers
from .models import ChatRoom, Message


# ─── 1. Message ───────────────────────────────────────────────────────────────

class MessageSerializer(serializers.ModelSerializer):
    """
    Formats a single chat message.

    Used on:
    - GET /api/v1/chat/rooms/<id>/messages/   fetch message history via HTTP

    The WebSocket consumer returns the same fields but as plain dicts —
    this serializer is for the REST fallback.

    sender_name and sender_avatar are included so the app can render
    the message bubble without making extra API calls.
    """

    sender_name   = serializers.CharField(source='sender.full_name', read_only=True)
    sender_avatar = serializers.ImageField(source='sender.avatar',   read_only=True)

    class Meta:
        model  = Message
        fields = [
            'id',
            'content',
            'sender', 'sender_name', 'sender_avatar',
            'is_read',
            'created_at',
        ]
        read_only_fields = ['id', 'sender', 'is_read', 'created_at']


class MessageCreateSerializer(serializers.ModelSerializer):
    """
    Used when creating a message via the REST API (fallback path).

    The sender is attached automatically in the view —
    the user never sends their own ID.
    """

    class Meta:
        model  = Message
        fields = ['content']

    def validate_content(self, value):
        if not value.strip():
            raise serializers.ValidationError('Message cannot be empty.')
        return value.strip()


# ─── 2. Chat room ─────────────────────────────────────────────────────────────

class ChatRoomSerializer(serializers.ModelSerializer):
    """
    Formats a chat room for the room list screen.

    Designed to match what chat apps like WhatsApp show in their list:
    - Other participant's name and avatar
    - Last message preview
    - Unread message count
    - Time of last activity

    Used on:
    - GET /api/v1/chat/rooms/        list all rooms for the logged-in user
    - GET /api/v1/chat/rooms/<id>/   single room detail
    """

    # The "other" participant — the one who isn't the logged-in user.
    # e.g. if the patient is viewing the list, they see the doctor's info
    other_participant_name   = serializers.SerializerMethodField()
    other_participant_avatar = serializers.SerializerMethodField()
    other_participant_id     = serializers.SerializerMethodField()

    # Last message preview — shown under the room name in the list
    last_message         = serializers.SerializerMethodField()
    last_message_time    = serializers.SerializerMethodField()

    # How many unread messages the logged-in user has in this room
    unread_count = serializers.SerializerMethodField()

    # Appointment info — useful for context on the room card
    appointment_date = serializers.DateField(
        source='appointment.appointment_date', read_only=True
    )
    appointment_status = serializers.CharField(
        source='appointment.status', read_only=True
    )

    class Meta:
        model  = ChatRoom
        fields = [
            'id',
            # Other participant
            'other_participant_id',
            'other_participant_name',
            'other_participant_avatar',
            # Last message preview
            'last_message',
            'last_message_time',
            'unread_count',
            # Appointment context
            'appointment', 'appointment_date', 'appointment_status',
            # Room state
            'is_active',
            'updated_at',
        ]
        read_only_fields = fields

    def _get_request_user(self):
        """Gets the logged-in user from the serializer context."""
        return self.context['request'].user

    def get_other_participant_id(self, obj):
        user = self._get_request_user()
        other = obj.get_other_participant(user)
        return str(other.id)

    def get_other_participant_name(self, obj):
        user  = self._get_request_user()
        other = obj.get_other_participant(user)
        # Prefix with 'Dr.' if the other participant is a doctor
        if other.is_doctor:
            return f'Dr. {other.full_name}'
        return other.full_name

    def get_other_participant_avatar(self, obj):
        user  = self._get_request_user()
        other = obj.get_other_participant(user)
        return other.get_avatar_url()

    def get_last_message(self, obj):
        """
        Returns a short preview of the last message.
        Truncated to 60 characters — same as WhatsApp's preview length.
        Returns None if there are no messages yet.
        """
        last = obj.messages.order_by('-created_at').first()
        if not last:
            return None
        content = last.content
        # Truncate long messages for the preview
        if len(content) > 60:
            content = content[:60] + '...'
        return content

    def get_last_message_time(self, obj):
        """Returns the timestamp of the last message, or None."""
        last = obj.messages.order_by('-created_at').first()
        if not last:
            return None
        return last.created_at.isoformat()

    def get_unread_count(self, obj):
        """
        Returns how many unread messages the logged-in user has
        in this room — messages sent by the OTHER participant that
        haven't been read yet.
        """
        user = self._get_request_user()
        return obj.messages.filter(
            is_read=False,
        ).exclude(
            sender=user,   # don't count your own messages
        ).count()