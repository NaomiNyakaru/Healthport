from datetime import date, timedelta

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User
from apps.doctors.models import DoctorProfile
from .models import PatientProfile, MedicalRecord, Medication, DosageLog


# ─── Shared helpers ───────────────────────────────────────────────────────────

def create_patient(email='patient@test.com', password='Str0ngPass!'):
    """Create a patient user and return (user, profile, tokens)."""
    user = User.objects.create_user(
        email=email,
        first_name='Jane',
        last_name='Wanjiku',
        password=password,
        role=User.Role.PATIENT,
    )
    # Signal auto-creates PatientProfile — fetch it
    profile = PatientProfile.objects.get(user=user)
    refresh = RefreshToken.for_user(user)
    tokens  = {'access': str(refresh.access_token), 'refresh': str(refresh)}
    return user, profile, tokens


def create_verified_doctor(email='doctor@test.com', password='Str0ngPass!'):
    """Create a verified doctor and return (user, profile, tokens)."""
    user = User.objects.create_user(
        email=email,
        first_name='Brian',
        last_name='Otieno',
        password=password,
        role=User.Role.DOCTOR,
    )
    doctor_profile = DoctorProfile.objects.create(
        user=user,
        kmpdc_number='KMPDC/TEST/DOC',
        specialty='paediatrics',
    )
    doctor_profile.verify(note='Verified in test setup.')
    refresh = RefreshToken.for_user(user)
    tokens  = {'access': str(refresh.access_token), 'refresh': str(refresh)}
    return user, doctor_profile, tokens


def create_unverified_doctor(email='pending@test.com', password='Str0ngPass!'):
    """Create an unverified (pending) doctor and return (user, profile, tokens)."""
    user = User.objects.create_user(
        email=email,
        first_name='Carol',
        last_name='Njoroge',
        password=password,
        role=User.Role.DOCTOR,
    )
    doctor_profile = DoctorProfile.objects.create(
        user=user,
        kmpdc_number='KMPDC/TEST/PENDING',
        specialty='surgery',
    )
    # verification_status stays 'pending' — no .verify() call
    refresh = RefreshToken.for_user(user)
    tokens  = {'access': str(refresh.access_token), 'refresh': str(refresh)}
    return user, doctor_profile, tokens


# ─── 1. Patient profile ───────────────────────────────────────────────────────

class PatientProfileTest(APITestCase):

    def setUp(self):
        self.user, self.profile, self.tokens = create_patient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.tokens["access"]}'
        )

    def test_get_own_profile_returns_200(self):
        res = self.client.get(reverse('patient-me'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_get_profile_returns_correct_name(self):
        res = self.client.get(reverse('patient-me'))
        self.assertEqual(res.data['full_name'], 'Jane Wanjiku')

    def test_patch_profile_updates_blood_group(self):
        res = self.client.patch(
            reverse('patient-me'),
            {'blood_group': 'O+'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.blood_group, 'O+')

    def test_patch_profile_updates_allergies(self):
        res = self.client.patch(
            reverse('patient-me'),
            {'allergies': 'Penicillin, Peanuts'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.allergies, 'Penicillin, Peanuts')

    def test_unauthenticated_cannot_access_profile(self):
        self.client.credentials()
        res = self.client.get(reverse('patient-me'))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_doctor_cannot_access_patient_me_endpoint(self):
        """The /me/ endpoint is for patients only — doctors use /doctors/me/."""
        _, _, doctor_tokens = create_verified_doctor()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {doctor_tokens["access"]}'
        )
        res = self.client.get(reverse('patient-me'))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ─── 2. Medical records ───────────────────────────────────────────────────────

class MedicalRecordTest(APITestCase):

    def setUp(self):
        self.user, self.profile, self.tokens = create_patient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.tokens["access"]}'
        )

    def _create_record(self, is_private=False, title='Blood test'):
        """Helper to create a medical record directly in the DB."""
        return MedicalRecord.objects.create(
            patient=self.profile,
            record_type='lab_result',
            title=title,
            description='Haemoglobin levels normal.',
            date_of_record=date.today(),
            is_private=is_private,
        )

    def test_list_records_returns_200(self):
        res = self.client.get(reverse('patient-records'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_create_record_returns_201(self):
        res = self.client.post(
            reverse('patient-records'),
            {
                'record_type':    'diagnosis',
                'title':          'Type 2 Diabetes',
                'description':    'Diagnosed with Type 2 Diabetes.',
                'date_of_record': str(date.today()),
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_created_record_belongs_to_patient(self):
        self.client.post(
            reverse('patient-records'),
            {
                'record_type':    'note',
                'title':          'Test note',
                'description':    'A test note.',
                'date_of_record': str(date.today()),
            },
            format='json',
        )
        self.assertEqual(
            MedicalRecord.objects.filter(patient=self.profile).count(), 1
        )

    def test_future_date_returns_400(self):
        """Records cannot have a future date."""
        res = self.client.post(
            reverse('patient-records'),
            {
                'record_type':    'note',
                'title':          'Future record',
                'description':    'This should fail.',
                'date_of_record': str(date.today() + timedelta(days=1)),
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patient_cannot_see_another_patients_record(self):
        """
        A patient guessing another patient's record UUID must get a 404,
        not a 403 — we don't confirm the record exists at all.
        """
        # Create a second patient with a record
        _, other_profile, _ = create_patient(email='other@test.com')
        other_record = MedicalRecord.objects.create(
            patient=other_profile,
            record_type='note',
            title='Private note',
            description='Not yours.',
            date_of_record=date.today(),
        )
        res = self.client.get(
            reverse('patient-record-detail', kwargs={'pk': other_record.id})
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_own_record(self):
        record = self._create_record()
        res = self.client.delete(
            reverse('patient-record-detail', kwargs={'pk': record.id})
        )
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(MedicalRecord.objects.filter(id=record.id).exists())


# ─── 3. Medications ──────────────────────────────────────────────────────────

class MedicationTest(APITestCase):

    def setUp(self):
        self.user, self.profile, self.tokens = create_patient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.tokens["access"]}'
        )

    def _create_medication(self, is_active=True, name='Metformin'):
        return Medication.objects.create(
            patient=self.profile,
            name=name,
            dosage='500mg',
            frequency=2,
            frequency_unit='daily',
            start_date=date.today(),
            is_active=is_active,
        )

    def test_create_medication_returns_201(self):
        res = self.client.post(
            reverse('patient-medications'),
            {
                'name':           'Aspirin',
                'dosage':         '75mg',
                'frequency':      1,
                'frequency_unit': 'daily',
                'start_date':     str(date.today()),
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_list_medications_returns_all(self):
        self._create_medication(name='Metformin')
        self._create_medication(name='Aspirin', is_active=False)
        res = self.client.get(reverse('patient-medications'))
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 2)

    def test_active_filter_returns_only_active(self):
        self._create_medication(name='Metformin', is_active=True)
        self._create_medication(name='OldDrug',   is_active=False)
        res = self.client.get(
            reverse('patient-medications'), {'active': 'true'}
        )
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['name'], 'Metformin')

    def test_end_date_before_start_date_returns_400(self):
        """end_date cannot be before start_date."""
        res = self.client.post(
            reverse('patient-medications'),
            {
                'name':           'Aspirin',
                'dosage':         '75mg',
                'frequency':      1,
                'frequency_unit': 'daily',
                'start_date':     str(date.today()),
                'end_date':       str(date.today() - timedelta(days=1)),
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_medication_deactivate(self):
        med = self._create_medication()
        res = self.client.patch(
            reverse('patient-medication-detail', kwargs={'pk': med.id}),
            {'is_active': False},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        med.refresh_from_db()
        self.assertFalse(med.is_active)


# ─── 4. Dosage logs ───────────────────────────────────────────────────────────

class DosageLogTest(APITestCase):

    def setUp(self):
        self.user, self.profile, self.tokens = create_patient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.tokens["access"]}'
        )
        self.medication = Medication.objects.create(
            patient=self.profile,
            name='Metformin',
            dosage='500mg',
            frequency=2,
            frequency_unit='daily',
            start_date=date.today(),
        )

    def test_log_dose_taken_returns_201(self):
        from django.utils import timezone
        res = self.client.post(
            reverse('patient-dosage-logs'),
            {
                'medication':    str(self.medication.id),
                'scheduled_time': timezone.now().isoformat(),
                'status':        'taken',
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_log_dose_missed_returns_201(self):
        from django.utils import timezone
        res = self.client.post(
            reverse('patient-dosage-logs'),
            {
                'medication':    str(self.medication.id),
                'scheduled_time': timezone.now().isoformat(),
                'status':        'missed',
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_cannot_log_dose_for_another_patients_medication(self):
        """
        A patient must not be able to log a dose for a medication
        that belongs to a different patient.
        """
        from django.utils import timezone
        # Create a second patient with their own medication
        _, other_profile, _ = create_patient(email='other@test.com')
        other_med = Medication.objects.create(
            patient=other_profile,
            name='Insulin',
            dosage='10mg',
            frequency=1,
            frequency_unit='daily',
            start_date=date.today(),
        )
        res = self.client.post(
            reverse('patient-dosage-logs'),
            {
                'medication':    str(other_med.id),
                'scheduled_time': timezone.now().isoformat(),
                'status':        'taken',
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_filter_logs_by_medication(self):
        """?medication=<uuid> should return only logs for that medication."""
        from django.utils import timezone
        # Create two logs for the same medication
        DosageLog.objects.create(
            medication=self.medication,
            scheduled_time=timezone.now(),
            status='taken',
        )
        res = self.client.get(
            reverse('patient-dosage-logs'),
            {'medication': str(self.medication.id)},
        )
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)


# ─── 5. Doctor accessing patient data ────────────────────────────────────────

class DoctorPatientAccessTest(APITestCase):

    def setUp(self):
        # Create a patient with a public and a private record
        self.patient_user, self.patient_profile, _ = create_patient()

        MedicalRecord.objects.create(
            patient=self.patient_profile,
            record_type='diagnosis',
            title='Public diagnosis',
            description='Visible to doctor.',
            date_of_record=date.today(),
            is_private=False,
        )
        MedicalRecord.objects.create(
            patient=self.patient_profile,
            record_type='note',
            title='Private note',
            description='Doctor cannot see this.',
            date_of_record=date.today(),
            is_private=True,
        )

        # Verified doctor
        _, _, self.doctor_tokens = create_verified_doctor()
        # Unverified doctor
        _, _, self.unverified_tokens = create_unverified_doctor()

    def test_verified_doctor_can_view_patient_profile(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.doctor_tokens["access"]}'
        )
        res = self.client.get(
            reverse('patient-profile-for-doctor',
                    kwargs={'patient_id': self.patient_user.id})
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['full_name'], 'Jane Wanjiku')

    def test_verified_doctor_can_view_public_records(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.doctor_tokens["access"]}'
        )
        res = self.client.get(
            reverse('patient-records-for-doctor',
                    kwargs={'patient_id': self.patient_user.id})
        )
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['title'], 'Public diagnosis')

    def test_doctor_cannot_see_private_records(self):
        """Private records must be invisible to doctors — only 1 public record returned."""
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.doctor_tokens["access"]}'
        )
        res = self.client.get(
            reverse('patient-records-for-doctor',
                    kwargs={'patient_id': self.patient_user.id})
        )
        results = res.data.get('results', res.data)
        titles = [r['title'] for r in results]
        self.assertNotIn('Private note', titles)

    def test_unverified_doctor_cannot_view_patient_profile(self):
        """A pending doctor must be blocked from all patient data."""
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.unverified_tokens["access"]}'
        )
        res = self.client.get(
            reverse('patient-profile-for-doctor',
                    kwargs={'patient_id': self.patient_user.id})
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unverified_doctor_cannot_view_patient_records(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.unverified_tokens["access"]}'
        )
        res = self.client.get(
            reverse('patient-records-for-doctor',
                    kwargs={'patient_id': self.patient_user.id})
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)