from datetime import date, time, timedelta

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User
from apps.doctors.models import DoctorProfile
from apps.patients.models import PatientProfile
from apps.appointments.models import Appointment
from .models import ChatRoom, Message


# ─── Shared helpers ───────────────────────────────────────────────────────────

def create_patient(email='patient@test.com'):
    user = User.objects.create_user(
        email=email, first_name='Jane', last_name='Wanjiku',
        password='Str0ngPass!', role=User.Role.PATIENT,
    )
    refresh = RefreshToken.for_user(user)
    return user, {'access': str(refresh.access_token)}


def create_doctor(email='doctor@test.com'):
    user = User.objects.create_user(
        email=email, first_name='Brian', last_name='Otieno',
        password='Str0ngPass!', role=User.Role.DOCTOR,
    )
    profile = DoctorProfile.objects.create(
        user=user,
        kmpdc_number=f'KMPDC/{email}',
        specialty='paediatrics',
    )
    profile.verify(note='Test.')
    refresh = RefreshToken.for_user(user)
    return user, {'access': str(refresh.access_token)}


def create_appointment(patient, doctor, appt_status='confirmed'):
    return Appointment.objects.create(
        patient=patient,
        doctor=doctor,
        appointment_date=date.today() + timedelta(days=3),
        appointment_time=time(10, 0),
        reason='Test reason.',
        status=appt_status,
    )


def create_room(appointment):
    return ChatRoom.objects.create(
        appointment=appointment,
        patient=appointment.patient,
        doctor=appointment.doctor,
    )


def create_message(room, sender, content='Test message.'):
    return Message.objects.create(
        room=room,
        sender=sender,
        content=content,
    )


# ─── 1. Create chat room ──────────────────────────────────────────────────────

class ChatRoomCreateTest(APITestCase):

    def setUp(self):
        self.patient, self.patient_tokens = create_patient()
        self.doctor,  self.doctor_tokens  = create_doctor()
        self.appointment = create_appointment(self.patient, self.doctor)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.patient_tokens["access"]}'
        )

    def test_patient_can_create_room(self):
        res = self.client.post(
            reverse('chat-room-create'),
            {'appointment_id': str(self.appointment.id)},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_room_linked_to_appointment(self):
        res = self.client.post(
            reverse('chat-room-create'),
            {'appointment_id': str(self.appointment.id)},
            format='json',
        )
        self.assertEqual(
            str(res.data['appointment']),
            str(self.appointment.id),
        )

    def test_duplicate_create_returns_existing_room(self):
        """Creating a room for the same appointment twice returns the existing one."""
        self.client.post(
            reverse('chat-room-create'),
            {'appointment_id': str(self.appointment.id)},
            format='json',
        )
        # Second request — should return 200 (not 201) with the same room
        res = self.client.post(
            reverse('chat-room-create'),
            {'appointment_id': str(self.appointment.id)},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(ChatRoom.objects.count(), 1)

    def test_cancelled_appointment_returns_400(self):
        """Cannot create a chat room for a cancelled appointment."""
        cancelled = create_appointment(
            self.patient, self.doctor, appt_status='cancelled'
        )
        res = self.client.post(
            reverse('chat-room-create'),
            {'appointment_id': str(cancelled.id)},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_participant_cannot_create_room(self):
        """A patient cannot create a chat room for someone else's appointment."""
        other_patient, other_tokens = create_patient(email='other@test.com')
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {other_tokens["access"]}'
        )
        res = self.client.post(
            reverse('chat-room-create'),
            {'appointment_id': str(self.appointment.id)},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_missing_appointment_id_returns_400(self):
        res = self.client.post(
            reverse('chat-room-create'), {}, format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ─── 2. Chat room list ────────────────────────────────────────────────────────

class ChatRoomListTest(APITestCase):

    def setUp(self):
        self.patient, self.patient_tokens = create_patient()
        self.doctor,  self.doctor_tokens  = create_doctor()

        # Create another patient with their own room
        self.other_patient, _ = create_patient(email='other@test.com')

        # Patient's room
        appt = create_appointment(self.patient, self.doctor)
        self.room = create_room(appt)

        # Other patient's room — should NOT appear in patient's list
        other_appt = create_appointment(self.other_patient, self.doctor)
        self.other_room = create_room(other_appt)

        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.patient_tokens["access"]}'
        )

    def test_patient_sees_only_own_rooms(self):
        res = self.client.get(reverse('chat-room-list'))
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.room.id))

    def test_doctor_sees_all_their_rooms(self):
        """Doctor sees rooms for both patients."""
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.doctor_tokens["access"]}'
        )
        res = self.client.get(reverse('chat-room-list'))
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 2)

    def test_unread_count_is_correct(self):
        """Unread count should reflect unread messages from the other party."""
        # Doctor sends 2 messages — patient hasn't read them
        create_message(self.room, self.doctor, 'Message 1')
        create_message(self.room, self.doctor, 'Message 2')

        res = self.client.get(reverse('chat-room-list'))
        results = res.data.get('results', res.data)
        self.assertEqual(results[0]['unread_count'], 2)

    def test_own_messages_not_counted_as_unread(self):
        """Messages the patient sent themselves should not count as unread."""
        create_message(self.room, self.patient, 'My own message')

        res = self.client.get(reverse('chat-room-list'))
        results = res.data.get('results', res.data)
        self.assertEqual(results[0]['unread_count'], 0)

    def test_last_message_preview_shown(self):
        create_message(self.room, self.doctor, 'See you tomorrow.')

        res = self.client.get(reverse('chat-room-list'))
        results = res.data.get('results', res.data)
        self.assertEqual(results[0]['last_message'], 'See you tomorrow.')

    def test_unauthenticated_returns_401(self):
        self.client.credentials()
        res = self.client.get(reverse('chat-room-list'))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ─── 3. Chat room detail ──────────────────────────────────────────────────────

class ChatRoomDetailTest(APITestCase):

    def setUp(self):
        self.patient, self.patient_tokens = create_patient()
        self.doctor,  self.doctor_tokens  = create_doctor()
        appt = create_appointment(self.patient, self.doctor)
        self.room = create_room(appt)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.patient_tokens["access"]}'
        )

    def test_room_detail_returns_200(self):
        res = self.client.get(
            reverse('chat-room-detail', kwargs={'room_id': self.room.id})
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_opening_room_marks_messages_as_read(self):
        """Fetching room detail should mark unread messages as read."""
        msg = create_message(self.room, self.doctor, 'Hello patient.')
        self.assertFalse(msg.is_read)

        self.client.get(
            reverse('chat-room-detail', kwargs={'room_id': self.room.id})
        )

        msg.refresh_from_db()
        self.assertTrue(msg.is_read)

    def test_non_participant_cannot_view_room(self):
        other_patient, other_tokens = create_patient(email='other@test.com')
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {other_tokens["access"]}'
        )
        res = self.client.get(
            reverse('chat-room-detail', kwargs={'room_id': self.room.id})
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


# ─── 4. Message history ───────────────────────────────────────────────────────

class MessageListTest(APITestCase):

    def setUp(self):
        self.patient, self.patient_tokens = create_patient()
        self.doctor,  self.doctor_tokens  = create_doctor()
        appt = create_appointment(self.patient, self.doctor)
        self.room = create_room(appt)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.patient_tokens["access"]}'
        )

    def test_message_history_returns_200(self):
        res = self.client.get(
            reverse('chat-message-list', kwargs={'room_id': self.room.id})
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_messages_ordered_oldest_first(self):
        """Chat reads top to bottom — oldest message first."""
        create_message(self.room, self.patient, 'First message')
        create_message(self.room, self.doctor,  'Second message')

        res = self.client.get(
            reverse('chat-message-list', kwargs={'room_id': self.room.id})
        )
        results = res.data.get('results', res.data)
        self.assertEqual(results[0]['content'], 'First message')
        self.assertEqual(results[1]['content'], 'Second message')

    def test_non_participant_cannot_view_messages(self):
        other_patient, other_tokens = create_patient(email='other@test.com')
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {other_tokens["access"]}'
        )
        res = self.client.get(
            reverse('chat-message-list', kwargs={'room_id': self.room.id})
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


# ─── 5. Send message via REST ─────────────────────────────────────────────────

class MessageCreateTest(APITestCase):

    def setUp(self):
        self.patient, self.patient_tokens = create_patient()
        self.doctor,  self.doctor_tokens  = create_doctor()
        appt = create_appointment(self.patient, self.doctor)
        self.room = create_room(appt)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.patient_tokens["access"]}'
        )

    def test_patient_can_send_message(self):
        res = self.client.post(
            reverse('chat-message-create', kwargs={'room_id': self.room.id}),
            {'content': 'Hello Doctor.'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_sender_is_auto_attached(self):
        """The sender field should be the logged-in user, not from the request body."""
        res = self.client.post(
            reverse('chat-message-create', kwargs={'room_id': self.room.id}),
            {'content': 'Hello Doctor.'},
            format='json',
        )
        self.assertEqual(str(res.data['sender']), str(self.patient.id))

    def test_message_saved_to_database(self):
        self.client.post(
            reverse('chat-message-create', kwargs={'room_id': self.room.id}),
            {'content': 'Saved message.'},
            format='json',
        )
        self.assertTrue(
            Message.objects.filter(
                room=self.room,
                content='Saved message.',
            ).exists()
        )

    def test_empty_message_returns_400(self):
        res = self.client.post(
            reverse('chat-message-create', kwargs={'room_id': self.room.id}),
            {'content': '   '},   # whitespace only
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_participant_cannot_send_message(self):
        other_patient, other_tokens = create_patient(email='other@test.com')
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {other_tokens["access"]}'
        )
        res = self.client.post(
            reverse('chat-message-create', kwargs={'room_id': self.room.id}),
            {'content': 'Should not work.'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)