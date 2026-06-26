from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import (
    PatientRegisterSerializer,
    DoctorRegisterSerializer,
    UserProfileSerializer,
    ChangePasswordSerializer,
    UpdatePushTokenSerializer,
    CustomTokenObtainPairSerializer,
)


# ─── 1. Patient registration ──────────────────────────────────────────────────

class PatientRegisterView(generics.CreateAPIView):
    """
    POST /api/v1/auth/register/patient/

    Who can call it: anyone (no login required).

    What it does:
    1. Passes request data to PatientRegisterSerializer for validation.
    2. If valid, creates the User (PatientProfile is auto-created by a signal).
    3. Generates JWT access + refresh tokens immediately.
    4. Returns tokens + user info so the app can log the patient in right away.

    Why return tokens at registration?
    So the patient doesn't have to fill in a login form right after signing up.
    One step instead of two.
    """
    serializer_class   = PatientRegisterSerializer
    permission_classes = [permissions.AllowAny]  # no auth needed to register

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)  # returns 400 automatically if invalid
        user = serializer.save()

        # Generate tokens for the newly created user
        refresh = RefreshToken.for_user(user)

        return Response({
            'message': 'Account created successfully.',
            'tokens': {
                'access':  str(refresh.access_token),
                'refresh': str(refresh),
            },
            'user': {
                'id':        str(user.id),
                'email':     user.email,
                'full_name': user.full_name,
                'role':      user.role,
                'avatar':    user.get_avatar_url(),
            },
        }, status=status.HTTP_201_CREATED)


# ─── 2. Doctor registration ───────────────────────────────────────────────────

class DoctorRegisterView(generics.CreateAPIView):
    """
    POST /api/v1/auth/register/doctor/

    Who can call it: anyone (no login required).

    What it does:
    1. Validates the form including kmpdc_number and specialty.
    2. Creates both the User and DoctorProfile (in one transaction).
    3. Returns tokens — but verification_status is 'pending'.

    What happens next for the doctor:
    The app checks verification_status in the response. If 'pending', it
    shows a holding screen: "Your registration is being reviewed."
    An admin approves the doctor via the Django admin panel or the
    /admin-verify/ endpoint, which changes status to 'verified'.
    The doctor's next login will return is_verified: true and they
    get routed to the full doctor dashboard.
    """
    serializer_class   = DoctorRegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)

        return Response({
            'message': (
                'Doctor account created. Your KMPDC registration number is being '
                'verified. You will receive a notification once approved.'
            ),
            'tokens': {
                'access':  str(refresh.access_token),
                'refresh': str(refresh),
            },
            'user': {
                'id':                  str(user.id),
                'email':               user.email,
                'full_name':           user.full_name,
                'role':                user.role,
                'avatar':              user.get_avatar_url(),
                'is_verified':         False,
                'verification_status': 'pending',
            },
        }, status=status.HTTP_201_CREATED)


# ─── 3. Login ─────────────────────────────────────────────────────────────────

class LoginView(TokenObtainPairView):
    """
    POST /api/v1/auth/login/

    Who can call it: anyone.

    Body:
        { "email": "...", "password": "..." }

    What it does:
    Hands off to CustomTokenObtainPairSerializer which:
    - Validates email + password
    - Returns access token, refresh token, and full user object

    We don't write any logic here — TokenObtainPairView handles everything.
    We only swap in our custom serializer so the response includes user info.
    """
    serializer_class   = CustomTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]


# ─── 4. Logout ────────────────────────────────────────────────────────────────

class LogoutView(APIView):
    """
    POST /api/v1/auth/logout/

    Who can call it: any logged-in user.

    Body:
        { "refresh": "<refresh_token>" }

    What it does:
    Adds the refresh token to Django's token blacklist table.
    Once blacklisted, that refresh token can never be used to get
    a new access token — the user is effectively logged out.

    Note: the access token is NOT invalidated here — it will expire
    naturally after 60 minutes. This is standard JWT behaviour.
    For most apps this is fine. If you need instant access token
    revocation, you'd need to store tokens in Redis and check on
    every request — overkill for HealthPort right now.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get('refresh')

        if not refresh_token:
            return Response(
                {'error': 'Refresh token is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {'message': 'Logged out successfully.'},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ─── 5. My profile ────────────────────────────────────────────────────────────

class MeView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/v1/auth/me/   → returns the logged-in user's profile
    PATCH /api/v1/auth/me/   → updates first_name, last_name, phone, avatar

    Who can call it: any logged-in user (patient or doctor).

    Why RetrieveUpdateAPIView?
    It gives us GET and PUT/PATCH for free — we just point get_object()
    at the current user and provide the serializer.

    We restrict to PATCH only (not PUT) because a full PUT would require
    sending every field including email and role — fields we don't want
    users changing. PATCH allows sending only the fields you want to update.
    """
    serializer_class   = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names  = ['get', 'patch', 'head', 'options']

    def get_object(self):
        # Always return the currently logged-in user — not from the URL.
        # This means /me/ always refers to yourself, never someone else.
        return self.request.user


# ─── 6. Change password ───────────────────────────────────────────────────────

class ChangePasswordView(APIView):
    """
    POST /api/v1/auth/change-password/

    Who can call it: any logged-in user.

    Body:
        {
            "old_password":  "current password",
            "new_password":  "new password",
            "new_password2": "new password again"
        }

    What it does:
    1. Verifies the old password is correct (done in the serializer).
    2. Validates the new password meets Django's rules.
    3. Checks new passwords match.
    4. Saves the new hashed password.

    The user stays logged in after this — existing tokens remain valid.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={'request': request},  # serializer needs request to access user
        )
        serializer.is_valid(raise_exception=True)

        # set_password() hashes the password before saving
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])

        return Response(
            {'message': 'Password changed successfully.'},
            status=status.HTTP_200_OK,
        )


# ─── 7. Save push token ───────────────────────────────────────────────────────

class UpdatePushTokenView(APIView):
    """
    PATCH /api/v1/auth/push-token/

    Who can call it: any logged-in user.

    Body:
        { "push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" }

    What it does:
    Saves the Expo push notification token to the user's record.

    When is this called?
    The React Native app calls this endpoint once, right after the user
    grants notification permission on their phone. Expo gives the app
    a unique token for that device. We save it here so that Celery tasks
    (Day 3) can look up a user's token and send them push notifications
    for appointment reminders and medication schedules.
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request):
        serializer = UpdatePushTokenSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(
            {'message': 'Push token saved.'},
            status=status.HTTP_200_OK,
        )