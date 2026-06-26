from datetime import date, time, timedelta

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User
from apps.doctors.models import DoctorProfile
from apps.patients.models import PatientProfile
from .models import Appointment


# ─── Shared helpers ───────────────────────────────────────────────────────────

def create_patient(email='patient@test.com'):
    user = User.objects.create_user(
        email=email, first_name='Jane', last_name='Wanjiku',
        password='Str0ngPass!', role=User.Role.PATIENT,
    )
    refresh = RefreshToken.for_user(user)
    tokens  = {'access': str(refresh.access_token)}
    return user, tokens


def create_doctor(email='doctor@test.com', verified=True):
    user = User.objects.create_user(
        email=email, first_name='Brian', last_name='Otieno',
        password='Str0ngPass!', role=User.Role.DOCTOR,
    )
    profile = DoctorProfile.objects.create(
        user=user,
        kmpdc_number=f'KMPDC/{email}',
        specialty='paediatrics',
    )
    if verified:
        profile.verify(note='Test verification.')
    refresh = RefreshToken.for_user(user)
    tokens  = {'access': str(refresh.access_token)}
    return user, profile, tokens


def create_appointment(patient, doctor, appt_date=None, appt_status='pending'):
    """Create an appointment directly in the DB."""
    return Appointment.objects.create(
        patient=patient,
        doctor=doctor,
        appointment_date=appt_date or date.today() + timedelta(days=3),
        appointment_time=time(10, 0),
        reason='Test appointment reason.',
        status=appt_status,
    )


# ─── 1. Booking ───────────────────────────────────────────────────────────────

class AppointmentBookingTest(APITestCase):

    def setUp(self):
        self.patient, self.patient_tokens = create_patient()
        self.doctor_user, self.doctor_profile, self.doctor_tokens = create_doctor()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.patient_tokens["access"]}'
        )

    def _book(self, overrides=None):
        payload = {
            'doctor':            self.doctor_user.id,
            'appointment_date':  str(date.today() + timedelta(days=3)),
            'appointment_time':  '10:00:00',
            'reason':            'Recurring headaches.',
            'appointment_type':  'virtual',
        }
        if overrides:
            payload.update(overrides)
        return self.client.post(
            reverse('appointment-list'), payload, format='json'
        )

    def test_patient_can_book_appointment(self):
        res = self._book()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_new_appointment_starts_as_pending(self):
        res = self._book()
        self.assertEqual(res.data['status'], 'pending')

    def test_appointment_links_correct_patient_and_doctor(self):
        res = self._book()
        self.assertEqual(res.data['patient'], str(self.patient.id))
        self.assertEqual(res.data['doctor'],  str(self.doctor_user.id))

    def test_past_date_returns_400(self):
        res = self._book({'appointment_date': str(date.today() - timedelta(days=1))})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unverified_doctor_returns_400(self):
        _, unverified, _ = create_doctor(email='unverified@test.com', verified=False)
        res = self._book({'doctor': unverified.user.id})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_doctor_cannot_book_appointment(self):
        """Doctors cannot book appointments — only patients can."""
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.doctor_tokens["access"]}'
        )
        res = self._book()
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_double_booking_same_slot_returns_400(self):
        """Patient cannot book the same doctor at the same time twice."""
        self._book()
        res = self._book()   # same payload again
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_cannot_book(self):
        self.client.credentials()
        res = self._book()
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ─── 2. Listing ───────────────────────────────────────────────────────────────

class AppointmentListTest(APITestCase):

    def setUp(self):
        self.patient, self.patient_tokens = create_patient()
        self.doctor_user, self.doctor_profile, self.doctor_tokens = create_doctor()

        # Create another patient to verify isolation
        self.other_patient, _ = create_patient(email='other@test.com')

        # Patient's appointment
        self.appt = create_appointment(self.patient, self.doctor_user)

        # Other patient's appointment — should NOT appear in patient's list
        self.other_appt = create_appointment(self.other_patient, self.doctor_user)

    def test_patient_sees_only_own_appointments(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.patient_tokens["access"]}'
        )
        res = self.client.get(reverse('appointment-list'))
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(self.appt.id))

    def test_doctor_sees_all_their_appointments(self):
        """Doctor sees both the patient's and other patient's appointments."""
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.doctor_tokens["access"]}'
        )
        res = self.client.get(reverse('appointment-list'))
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 2)

    def test_status_filter_works(self):
        # Create a confirmed appointment
        confirmed = create_appointment(
            self.patient, self.doctor_user,
            appt_date=date.today() + timedelta(days=5),
            appt_status='confirmed',
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.patient_tokens["access"]}'
        )
        res = self.client.get(
            reverse('appointment-list'), {'status': 'confirmed'}
        )
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(confirmed.id))


# ─── 3. Status updates ────────────────────────────────────────────────────────

class AppointmentUpdateTest(APITestCase):

    def setUp(self):
        self.patient, self.patient_tokens = create_patient()
        self.doctor_user, self.doctor_profile, self.doctor_tokens = create_doctor()
        self.appt = create_appointment(self.patient, self.doctor_user)

    def _update(self, data, tokens=None):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {(tokens or self.doctor_tokens)["access"]}'
        )
        return self.client.patch(
            reverse('appointment-update', kwargs={'pk': self.appt.id}),
            data,
            format='json',
        )

    def test_doctor_can_confirm_appointment(self):
        res = self._update({'status': 'confirmed'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.appt.refresh_from_db()
        self.assertEqual(self.appt.status, 'confirmed')

    def test_doctor_can_complete_appointment_with_notes(self):
        self.appt.confirm()   # must be confirmed before completing
        res = self._update({
            'status': 'completed',
            'notes':  'Patient responding well to treatment.',
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.appt.refresh_from_db()
        self.assertEqual(self.appt.status, 'completed')
        self.assertEqual(
            self.appt.notes, 'Patient responding well to treatment.'
        )

    def test_patient_cannot_confirm_appointment(self):
        """Patients cannot confirm — only doctors can."""
        res = self._update(
            {'status': 'confirmed'},
            tokens=self.patient_tokens,
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_update_completed_appointment(self):
        """Once completed an appointment is final."""
        self.appt.confirm()
        self.appt.complete()
        res = self._update({'status': 'confirmed'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_update_cancelled_appointment(self):
        """Once cancelled an appointment is final."""
        self.appt.cancel(self.patient, reason='Test cancel.')
        res = self._update({'status': 'confirmed'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ─── 4. Cancellation ─────────────────────────────────────────────────────────

class AppointmentCancelTest(APITestCase):

    def setUp(self):
        self.patient, self.patient_tokens = create_patient()
        self.doctor_user, self.doctor_profile, self.doctor_tokens = create_doctor()
        self.appt = create_appointment(self.patient, self.doctor_user)

    def _cancel(self, tokens, reason='Test cancellation.'):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}'
        )
        return self.client.post(
            reverse('appointment-cancel', kwargs={'pk': self.appt.id}),
            {'cancellation_reason': reason},
            format='json',
        )

    def test_patient_can_cancel_pending_appointment(self):
        res = self._cancel(self.patient_tokens)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.appt.refresh_from_db()
        self.assertEqual(self.appt.status, 'cancelled')
        self.assertEqual(self.appt.cancelled_by, self.patient)

    def test_doctor_can_cancel_appointment(self):
        res = self._cancel(self.doctor_tokens, reason='Doctor unavailable.')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.appt.refresh_from_db()
        self.assertEqual(self.appt.cancelled_by, self.doctor_user)

    def test_cancellation_reason_is_stored(self):
        self._cancel(self.patient_tokens, reason='Changed my mind.')
        self.appt.refresh_from_db()
        self.assertEqual(self.appt.cancellation_reason, 'Changed my mind.')

    def test_cannot_cancel_completed_appointment(self):
        self.appt.confirm()
        self.appt.complete()
        res = self._cancel(self.patient_tokens)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unrelated_user_cannot_cancel(self):
        """A patient cannot cancel another patient's appointment."""
        other_patient, other_tokens = create_patient(email='other@test.com')
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {other_tokens["access"]}'
        )
        res = self.client.post(
            reverse('appointment-cancel', kwargs={'pk': self.appt.id}),
            {'cancellation_reason': 'Should not work.'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


# ─── 5. Upcoming appointments ────────────────────────────────────────────────

class UpcomingAppointmentsTest(APITestCase):

    def setUp(self):
        self.patient, self.patient_tokens = create_patient()
        self.doctor_user, _, self.doctor_tokens = create_doctor()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.patient_tokens["access"]}'
        )

    def test_only_confirmed_future_appointments_appear(self):
        # Confirmed future appointment — should appear
        confirmed = create_appointment(
            self.patient, self.doctor_user,
            appt_date=date.today() + timedelta(days=2),
            appt_status='confirmed',
        )
        # Pending future appointment — should NOT appear
        create_appointment(
            self.patient, self.doctor_user,
            appt_date=date.today() + timedelta(days=3),
            appt_status='pending',
        )

        res = self.client.get(reverse('appointment-upcoming'))
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], str(confirmed.id))

    def test_past_confirmed_appointments_do_not_appear(self):
        """Confirmed appointments in the past should not show on the home screen."""
        # We can't set appointment_date in the past via the API (validation blocks it)
        # so we create it directly in the DB
        past_appt = Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor_user,
            appointment_date=date.today() - timedelta(days=1),
            appointment_time=time(10, 0),
            reason='Past appointment.',
            status='confirmed',
        )
        res = self.client.get(reverse('appointment-upcoming'))
        results = res.data.get('results', res.data)
        ids = [r['id'] for r in results]
        self.assertNotIn(str(past_appt.id), ids)