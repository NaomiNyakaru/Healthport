from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import User


# ─── Shared test data ─────────────────────────────────────────────────────────
# Defined once here so every test class can reuse them.
# If you need a slightly different payload, spread it and override one key:
#   payload = {**PATIENT_PAYLOAD, 'email': 'other@test.com'}

PATIENT_PAYLOAD = {
    'email':      'jane@test.com',
    'first_name': 'Jane',
    'last_name':  'Wanjiku',
    'phone':      '+254712000001',
    'password':   'Str0ngPass!',
    'password2':  'Str0ngPass!',
}

DOCTOR_PAYLOAD = {
    'email':               'dr.brian@test.com',
    'first_name':          'Brian',
    'last_name':           'Otieno',
    'phone':               '+254723000001',
    'password':            'Str0ngPass!',
    'password2':           'Str0ngPass!',
    'kmpdc_number':        'KMPDC/TEST/001',
    'specialty':           'paediatrics',
    'years_of_experience': 5,
}


# ─── Shared helper functions ──────────────────────────────────────────────────
# Small functions that avoid repeating the same .post() call in every test.

def register_patient(client, payload=None):
    return client.post(
        reverse('register-patient'),  # 'register-patient' is the name= in urls.py
        payload or PATIENT_PAYLOAD,
        format='json',
    )

def register_doctor(client, payload=None):
    return client.post(
        reverse('register-doctor'),
        payload or DOCTOR_PAYLOAD,
        format='json',
    )

def login(client, email, password):
    return client.post(
        reverse('login'),
        {'email': email, 'password': password},
        format='json',
    )


# ─── 1. Patient registration ──────────────────────────────────────────────────

class PatientRegistrationTest(APITestCase):

    def test_register_patient_returns_201(self):
        """A valid signup should return HTTP 201 Created."""
        res = register_patient(self.client)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_register_patient_returns_tokens(self):
        """Response must contain access and refresh tokens so the app can log in immediately."""
        res = register_patient(self.client)
        self.assertIn('tokens', res.data)
        self.assertIn('access',  res.data['tokens'])
        self.assertIn('refresh', res.data['tokens'])

    def test_register_patient_returns_correct_role(self):
        """User object in the response must say role = 'patient'."""
        res = register_patient(self.client)
        self.assertEqual(res.data['user']['role'], 'patient')

    def test_register_patient_creates_user_in_database(self):
        """A User row must actually exist in the database after registration."""
        register_patient(self.client)
        self.assertTrue(User.objects.filter(email='jane@test.com').exists())

    def test_register_duplicate_email_returns_400(self):
        """Registering the same email twice must fail with 400."""
        register_patient(self.client)
        res = register_patient(self.client)  # same payload again
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_password_mismatch_returns_400(self):
        """Mismatched passwords must be rejected."""
        payload = {**PATIENT_PAYLOAD, 'password2': 'DifferentPass!'}
        res = register_patient(self.client, payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_missing_email_returns_400(self):
        """Email is required — omitting it must be rejected."""
        payload = {k: v for k, v in PATIENT_PAYLOAD.items() if k != 'email'}
        res = register_patient(self.client, payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_weak_password_returns_400(self):
        """Django's password validators must reject passwords that are too simple."""
        payload = {**PATIENT_PAYLOAD, 'password': '123', 'password2': '123'}
        res = register_patient(self.client, payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ─── 2. Doctor registration ───────────────────────────────────────────────────

class DoctorRegistrationTest(APITestCase):

    def test_register_doctor_returns_201(self):
        res = register_doctor(self.client)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_register_doctor_returns_pending_status(self):
        """
        A newly registered doctor must have verification_status='pending'
        and is_verified=False — they cannot access patient features yet.
        """
        res = register_doctor(self.client)
        self.assertEqual(res.data['user']['role'], 'doctor')
        self.assertEqual(res.data['user']['verification_status'], 'pending')
        self.assertFalse(res.data['user']['is_verified'])

    def test_register_doctor_creates_doctor_profile(self):
        """
        Registration must create a DoctorProfile row linked to the User.
        Without this, the KMPDC number would never be stored.
        """
        from apps.doctors.models import DoctorProfile
        register_doctor(self.client)
        self.assertTrue(
            DoctorProfile.objects.filter(kmpdc_number='KMPDC/TEST/001').exists()
        )

    def test_duplicate_kmpdc_number_returns_400(self):
        """
        Two doctors cannot register with the same KMPDC number.
        The second attempt must be rejected.
        """
        register_doctor(self.client)
        # Same KMPDC number, different email
        payload = {**DOCTOR_PAYLOAD, 'email': 'other.doctor@test.com'}
        res = register_doctor(self.client, payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_doctor_missing_kmpdc_returns_400(self):
        """kmpdc_number is required for doctor registration."""
        payload = {k: v for k, v in DOCTOR_PAYLOAD.items() if k != 'kmpdc_number'}
        res = register_doctor(self.client, payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ─── 3. Login ─────────────────────────────────────────────────────────────────

class LoginTest(APITestCase):

    def setUp(self):
        """
        setUp() runs before every test in this class.
        We register a patient once so every login test has a user to log in with.
        """
        register_patient(self.client)

    def test_login_correct_credentials_returns_200(self):
        res = login(self.client, 'jane@test.com', 'Str0ngPass!')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_login_returns_tokens_and_user(self):
        """Login response must contain tokens and a user object."""
        res = login(self.client, 'jane@test.com', 'Str0ngPass!')
        self.assertIn('access',  res.data)
        self.assertIn('refresh', res.data)
        self.assertIn('user',    res.data)

    def test_login_user_object_has_correct_email(self):
        res = login(self.client, 'jane@test.com', 'Str0ngPass!')
        self.assertEqual(res.data['user']['email'], 'jane@test.com')

    def test_login_wrong_password_returns_401(self):
        res = login(self.client, 'jane@test.com', 'WrongPassword!')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_unknown_email_returns_401(self):
        res = login(self.client, 'nobody@test.com', 'Str0ngPass!')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_empty_body_returns_400(self):
        res = self.client.post(reverse('login'), {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ─── 4. Logout ────────────────────────────────────────────────────────────────

class LogoutTest(APITestCase):

    def setUp(self):
        """Register and log in a patient, store their tokens for use in tests."""
        register_patient(self.client)
        res = login(self.client, 'jane@test.com', 'Str0ngPass!')
        self.access  = res.data['access']
        self.refresh = res.data['refresh']

    def test_logout_success_returns_200(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access}')
        res = self.client.post(
            reverse('logout'),
            {'refresh': self.refresh},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_logout_without_refresh_token_returns_400(self):
        """Logout requires a refresh token — empty body must fail."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access}')
        res = self.client.post(reverse('logout'), {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_unauthenticated_returns_401(self):
        """Must be logged in to log out."""
        res = self.client.post(
            reverse('logout'),
            {'refresh': self.refresh},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ─── 5. /me/ endpoint ────────────────────────────────────────────────────────

class MeViewTest(APITestCase):

    def setUp(self):
        """Register, log in, and attach the token to every request."""
        register_patient(self.client)
        res = login(self.client, 'jane@test.com', 'Str0ngPass!')
        # credentials() tells the test client to include this header automatically
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {res.data["access"]}')

    def test_get_me_returns_200(self):
        res = self.client.get(reverse('me'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_get_me_returns_correct_user(self):
        res = self.client.get(reverse('me'))
        self.assertEqual(res.data['email'], 'jane@test.com')
        self.assertEqual(res.data['role'],  'patient')

    def test_patch_me_updates_name(self):
        """Patching /me/ should update the user's name in the database."""
        res = self.client.patch(
            reverse('me'),
            {'first_name': 'Janet'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['first_name'], 'Janet')

    def test_patch_me_cannot_change_email(self):
        """Email is read-only — attempting to change it must be silently ignored."""
        self.client.patch(
            reverse('me'),
            {'email': 'newemail@test.com'},
            format='json',
        )
        # Email should still be the original
        user = User.objects.get(email='jane@test.com')
        self.assertEqual(user.email, 'jane@test.com')

    def test_get_me_unauthenticated_returns_401(self):
        """Without a token, /me/ must be inaccessible."""
        self.client.credentials()  # clears the stored token
        res = self.client.get(reverse('me'))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ─── 6. Change password ───────────────────────────────────────────────────────

class ChangePasswordTest(APITestCase):

    def setUp(self):
        register_patient(self.client)
        res = login(self.client, 'jane@test.com', 'Str0ngPass!')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {res.data["access"]}')

    def test_change_password_success_returns_200(self):
        res = self.client.post(
            reverse('change-password'),
            {
                'old_password':  'Str0ngPass!',
                'new_password':  'NewStr0ng!2',
                'new_password2': 'NewStr0ng!2',
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_can_login_with_new_password(self):
        """After a successful change, the old password must no longer work."""
        self.client.post(
            reverse('change-password'),
            {
                'old_password':  'Str0ngPass!',
                'new_password':  'NewStr0ng!2',
                'new_password2': 'NewStr0ng!2',
            },
            format='json',
        )
        # Try logging in with the new password
        res = login(self.client, 'jane@test.com', 'NewStr0ng!2')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_wrong_old_password_returns_400(self):
        res = self.client.post(
            reverse('change-password'),
            {
                'old_password':  'WrongOldPass!',
                'new_password':  'NewStr0ng!2',
                'new_password2': 'NewStr0ng!2',
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mismatched_new_passwords_returns_400(self):
        res = self.client.post(
            reverse('change-password'),
            {
                'old_password':  'Str0ngPass!',
                'new_password':  'NewStr0ng!2',
                'new_password2': 'DifferentNew!3',
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)