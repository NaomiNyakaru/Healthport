import uuid
from django.db import models
from django.conf import settings


class ChatRoom(models.Model):
    """
    A conversation channel between a patient and a doctor.

    Tied to an appointment — you can only open a chat with a doctor
    you have an appointment with. This is enforced in the view when
    creating a room.

    The room persists after the appointment ends so both parties can
    refer back to the conversation history.

    Relationship:
        Appointment  ──OneToOne──►  ChatRoom
        Patient (User)  ──────────► ChatRoom
        Doctor  (User)  ──────────► ChatRoom
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Tied to the appointment that created this room
    appointment = models.OneToOneField(
        'appointments.Appointment',
        on_delete=models.CASCADE,
        related_name='chat_room',
    )

    # Denormalised for fast lookups — we don't want to join through
    # appointment every time we need to check who is in the room
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='patient_chat_rooms',
    )
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='doctor_chat_rooms',
    )

    # Convenience flag — room is active while appointment is pending/confirmed
    # Set to False when appointment is completed or cancelled
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'chat_rooms'
        ordering = ['-updated_at']

    def __str__(self):
        return (
            f'Chat: {self.patient.full_name} ↔ '
            f'Dr. {self.doctor.full_name} '
            f'(Appt: {self.appointment.appointment_date})'
        )

    def get_other_participant(self, user):
        """Given one participant, returns the other one."""
        if user == self.patient:
            return self.doctor
        return self.patient

    def mark_all_read(self, reader):
        """Marks all unread messages as read for the given user."""
        self.messages.filter(
            is_read=False,
        ).exclude(
            sender=reader,
        ).update(is_read=True)


class Message(models.Model):
    """
    A single message in a ChatRoom.

    Created two ways:
    1. Via WebSocket — the consumer saves it when a message is received
    2. Via REST API  — POST /api/v1/chat/rooms/<id>/messages/ (fallback)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    room = models.ForeignKey(
        ChatRoom,
        on_delete=models.CASCADE,
        related_name='messages',
    )

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sent_messages',
    )

    content = models.TextField()

    # Set to True when the recipient opens the chat room
    is_read = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chat_messages'
        ordering = ['created_at']   # oldest first — chat reads top to bottom

    def __str__(self):
        return (
            f'{self.sender.full_name}: '
            f'"{self.content[:50]}" '
            f'at {self.created_at}'
        )