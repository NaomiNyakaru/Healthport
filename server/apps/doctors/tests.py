from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User
from .models import DoctorProfile


# ─── Shared helpers ───────────────────────────────────────────────────────────

def create_patient(email='patient@test.com', password='Str0ngPass!'):
    """Create a patient user and return (user, tokens)."""
    from rest_framework_simplejwt.tokens import RefreshToken
    user = User.objects.create_user(
        email=email,
        first_name='Jane',
        last_name='Wanjiku',
        password=password,
        role=User.Role.PATIENT,
    )
    refresh = RefreshToken.for_user(user)
    return user, {'access': str(refresh.access_token), 'refresh': str(refresh)}


def create_doctor(
    email='doctor@test.com',
    password='Str0ngPass!',
    kmpdc_number='KMPDC/TEST/001',
    specialty='paediatrics',
    verified=False,
):
    """
    Create a doctor user + DoctorProfile and return (user, profile, tokens).
    Pass verified=True to skip the KMPDC approval step in tests that need
    a fully active doctor.
    """
    from rest_framework_simplejwt.tokens import RefreshToken
    user = User.objects.create_user(
        email=email,
        first_name='Brian',
        last_name='Otieno',
        password=password,
        role=User.Role.DOCTOR,
    )
    profile = DoctorProfile.objects.create(
        user=user,
        kmpdc_number=kmpdc_number,
        specialty=specialty,
    )
    if verified:
        profile.verify(note='Verified in test setup.')

    refresh = RefreshToken.for_user(user)
    tokens = {'access': str(refresh.access_token), 'refresh': str(refresh)}
    return user, profile, tokens


def create_admin(email='admin@test.com', password='Str0ngPass!'):
    """Create a staff/admin user and return (user, tokens)."""
    from rest_framework_simplejwt.tokens import RefreshToken
    user = User.objects.create_superuser(
        email=email,
        first_name='Admin',
        last_name='User',
        password=password,
    )
    refresh = RefreshToken.for_user(user)
    return user, {'access': str(refresh.access_token), 'refresh': str(refresh)}


# ─── 1. Browse doctors ────────────────────────────────────────────────────────

class DoctorListTest(APITestCase):

    def setUp(self):
        # Create a patient to make authenticated requests
        _, self.patient_tokens = create_patient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.patient_tokens["access"]}'
        )

        # Create a verified doctor — should appear in the list
        _, self.verified_profile, _ = create_doctor(
            email='verified@test.com',
            kmpdc_number='KMPDC/V/001',
            verified=True,
        )

        # Create a pending doctor — should NOT appear in the list
        _, self.pending_profile, _ = create_doctor(
            email='pending@test.com',
            kmpdc_number='KMPDC/P/001',
            verified=False,
        )

    def test_list_returns_200(self):
        res = self.client.get(reverse('doctor-list'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_list_only_shows_verified_doctors(self):
        """
        Unverified (pending/rejected) doctors must not appear in the
        patient-facing browse list.
        """
        res = self.client.get(reverse('doctor-list'))
        # results is the paginated list
        results = res.data.get('results', res.data)
        emails = [d['full_name'] for d in results]
        # Verified doctor appears
        self.assertIn('Brian Otieno', emails)
        # Pending doctor does NOT appear — same name so check count
        self.assertEqual(len(results), 1)

    def test_search_by_name(self):
        res = self.client.get(reverse('doctor-list'), {'search': 'Brian'})
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)

    def test_filter_by_specialty(self):
        # Create a second verified doctor with a different specialty
        create_doctor(
            email='cardio@test.com',
            kmpdc_number='KMPDC/C/001',
            specialty='cardiology',
            verified=True,
        )
        res = self.client.get(reverse('doctor-list'), {'specialty': 'cardiology'})
        results = res.data.get('results', res.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['specialty'], 'cardiology')

    def test_unauthenticated_returns_401(self):
        self.client.credentials()   # clear the token
        res = self.client.get(reverse('doctor-list'))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ─── 2. Doctor detail ─────────────────────────────────────────────────────────

class DoctorDetailTest(APITestCase):

    def setUp(self):
        _, self.patient_tokens = create_patient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.patient_tokens["access"]}'
        )
        _, self.verified_profile, _ = create_doctor(
            email='verified@test.com',
            kmpdc_number='KMPDC/V/001',
            verified=True,
        )
        _, self.pending_profile, _ = create_doctor(
            email='pending@test.com',
            kmpdc_number='KMPDC/P/001',
            verified=False,
        )

    def test_verified_doctor_detail_returns_200(self):
        res = self.client.get(
            reverse('doctor-detail', kwargs={'pk': self.verified_profile.pk})
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_detail_returns_correct_doctor(self):
        res = self.client.get(
            reverse('doctor-detail', kwargs={'pk': self.verified_profile.pk})
        )
        self.assertEqual(res.data['full_name'], 'Brian Otieno')

    def test_pending_doctor_returns_404(self):
        """
        A patient should not be able to see an unverified doctor's profile.
        """
        res = self.client.get(
            reverse('doctor-detail', kwargs={'pk': self.pending_profile.pk})
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_returns_401(self):
        self.client.credentials()
        res = self.client.get(
            reverse('doctor-detail', kwargs={'pk': self.verified_profile.pk})
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ─── 3. Doctor's own profile ──────────────────────────────────────────────────

class MyDoctorProfileTest(APITestCase):

    def setUp(self):
        _, self.profile, self.doctor_tokens = create_doctor(verified=True)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.doctor_tokens["access"]}'
        )

    def test_doctor_can_get_own_profile(self):
        res = self.client.get(reverse('doctor-me'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['kmpdc_number'], 'KMPDC/TEST/001')

    def test_doctor_can_update_bio(self):
        res = self.client.patch(
            reverse('doctor-me'),
            {'bio': 'Specialist in childhood diseases.'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.bio, 'Specialist in childhood diseases.')

    def test_doctor_can_toggle_accepting_patients(self):
        res = self.client.patch(
            reverse('doctor-me'),
            {'is_accepting_patients': False},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.is_accepting_patients)

    def test_doctor_cannot_change_verification_status(self):
        """
        A doctor must not be able to approve themselves by sending
        verification_status in the request body.
        DoctorUpdateSerializer does not include this field so it
        gets silently ignored.
        """
        # First set to pending
        self.profile.verification_status = DoctorProfile.VerificationStatus.PENDING
        self.profile.save()

        self.client.patch(
            reverse('doctor-me'),
            {'verification_status': 'verified'},
            format='json',
        )
        self.profile.refresh_from_db()
        # Must still be pending — the field was ignored
        self.assertEqual(
            self.profile.verification_status,
            DoctorProfile.VerificationStatus.PENDING,
        )

    def test_patient_cannot_access_doctor_me(self):
        """The /me/ doctor endpoint must reject patients."""
        _, patient_tokens = create_patient(email='other@test.com')
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {patient_tokens["access"]}'
        )
        res = self.client.get(reverse('doctor-me'))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ─── 4. Verification status ───────────────────────────────────────────────────

class DoctorVerificationStatusTest(APITestCase):

    def setUp(self):
        _, self.profile, self.doctor_tokens = create_doctor(verified=False)
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.doctor_tokens["access"]}'
        )

    def test_pending_doctor_sees_pending_status(self):
        res = self.client.get(reverse('doctor-verification-status'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['verification_status'], 'pending')
        self.assertFalse(res.data['is_verified'])

    def test_verified_doctor_sees_verified_status(self):
        self.profile.verify(note='Verified in test.')
        res = self.client.get(reverse('doctor-verification-status'))
        self.assertEqual(res.data['verification_status'], 'verified')
        self.assertTrue(res.data['is_verified'])

    def test_patient_cannot_access_verification_status(self):
        _, patient_tokens = create_patient(email='other@test.com')
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {patient_tokens["access"]}'
        )
        res = self.client.get(reverse('doctor-verification-status'))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ─── 5. Admin verify ──────────────────────────────────────────────────────────

class KMPDCAdminVerifyTest(APITestCase):

    def setUp(self):
        _, self.profile, _ = create_doctor(verified=False)
        _, self.admin_tokens = create_admin()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {self.admin_tokens["access"]}'
        )

    def test_admin_can_verify_doctor(self):
        res = self.client.post(
            reverse('doctor-admin-verify', kwargs={'pk': self.profile.pk}),
            {'action': 'verify', 'note': 'KMPDC confirmed.'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.is_verified)
        self.assertEqual(
            self.profile.verification_status,
            DoctorProfile.VerificationStatus.VERIFIED,
        )

    def test_admin_can_reject_doctor(self):
        res = self.client.post(
            reverse('doctor-admin-verify', kwargs={'pk': self.profile.pk}),
            {'action': 'reject', 'note': 'Number not found.'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertEqual(
            self.profile.verification_status,
            DoctorProfile.VerificationStatus.REJECTED,
        )
        self.assertEqual(self.profile.verification_note, 'Number not found.')

    def test_non_admin_cannot_verify(self):
        """A regular patient must not be able to verify doctors."""
        _, patient_tokens = create_patient(email='patient2@test.com')
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {patient_tokens["access"]}'
        )
        res = self.client.post(
            reverse('doctor-admin-verify', kwargs={'pk': self.profile.pk}),
            {'action': 'verify'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_action_returns_400(self):
        """Only 'verify' and 'reject' are valid actions."""
        res = self.client.post(
            reverse('doctor-admin-verify', kwargs={'pk': self.profile.pk}),
            {'action': 'approve'},   # invalid
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nonexistent_doctor_returns_404(self):
        res = self.client.post(
            reverse('doctor-admin-verify', kwargs={'pk': 99999}),
            {'action': 'verify'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)