from django.contrib.auth.password_validation import validate_password
from django.db import transaction

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


# ─── 1. JWT Login serializer ──────────────────────────────────────────────────

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends the default JWT login response.

    Default response is just:
        { "access": "...", "refresh": "..." }

    Our response adds a 'user' object:
        {
            "access": "...",
            "refresh": "...",
            "user": {
                "id": "...",
                "email": "...",
                "full_name": "...",
                "role": "patient",
                "avatar": null
            }
        }

    This means the React Native app knows the user's role immediately
    after login and can navigate to the correct tab stack without
    making a second API call to /me/.
    """

    def validate(self, attrs):
        # Run the default validation first — this checks email + password
        # and raises AuthenticationFailed if they are wrong.
        data = super().validate(attrs)
        user = self.user

        # Attach user info to the response
        data['user'] = {
            'id':        str(user.id),
            'email':     user.email,
            'full_name': user.full_name,
            'role':      user.role,
            'phone':     user.phone,
            'avatar':    user.get_avatar_url(),
        }

        # If the user is a doctor, also include their verification status.
        # The app uses this to decide whether to show the main doctor
        # dashboard or the "pending verification" holding screen.
        if user.is_doctor:
            try:
                profile = user.doctor_profile
                data['user']['is_verified']         = profile.is_verified
                data['user']['verification_status'] = profile.verification_status
            except Exception:
                # Profile missing — treat as pending
                data['user']['is_verified']         = False
                data['user']['verification_status'] = 'pending'

        return data


# ─── 2. Patient registration ──────────────────────────────────────────────────

class PatientRegisterSerializer(serializers.ModelSerializer):
    """
    Validates and creates a new patient account.

    Extra fields not on the User model:
    - password2: confirmation field, only used for validation, never saved.

    On success, returns the created User object.
    The view then generates JWT tokens and returns them to the app.
    """

    password = serializers.CharField(
        write_only=True,            # never included in response JSON
        validators=[validate_password],  # enforces Django's password rules
        style={'input_type': 'password'},
    )
    password2 = serializers.CharField(
        write_only=True,
        label='Confirm password',
        style={'input_type': 'password'},
    )

    class Meta:
        model  = User
        fields = ['email', 'first_name', 'last_name', 'phone', 'password', 'password2']
        extra_kwargs = {
            'phone': {'required': False},
        }

    def validate_email(self, value):
        """Check the email is not already registered."""
        if User.objects.filter(email=value.lower()).exists():
            raise serializers.ValidationError(
                'An account with this email already exists.'
            )
        return value.lower()  # normalise to lowercase before saving

    def validate(self, attrs):
        """Cross-field validation — runs after each individual field is validated."""
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password2': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        # Remove password2 — it's not a model field, just for validation
        validated_data.pop('password2')

        # create_user() hashes the password before saving
        return User.objects.create_user(role=User.Role.PATIENT, **validated_data)


# ─── 3. Doctor registration ───────────────────────────────────────────────────

class DoctorRegisterSerializer(serializers.ModelSerializer):
    """
    Validates and creates a new doctor account.

    Extra fields compared to patient registration:
    - kmpdc_number:        the KMPDC registration number to be verified
    - specialty:           medical specialty (e.g. 'cardiology')
    - years_of_experience: optional, defaults to 0

    These three fields are saved onto DoctorProfile, not onto User directly.
    We create both objects together inside a database transaction so that
    if anything fails halfway through, neither record is saved — no orphaned
    User without a DoctorProfile.
    """

    password = serializers.CharField(
        write_only=True,
        validators=[validate_password],
        style={'input_type': 'password'},
    )
    password2 = serializers.CharField(
        write_only=True,
        label='Confirm password',
        style={'input_type': 'password'},
    )
    kmpdc_number        = serializers.CharField(write_only=True, max_length=50)
    specialty           = serializers.CharField(write_only=True, max_length=30)
    years_of_experience = serializers.IntegerField(
        write_only=True, required=False, default=0, min_value=0
    )

    class Meta:
        model  = User
        fields = [
            'email', 'first_name', 'last_name', 'phone',
            'password', 'password2',
            'kmpdc_number', 'specialty', 'years_of_experience',
        ]
        extra_kwargs = {
            'phone': {'required': False},
        }

    def validate_email(self, value):
        if User.objects.filter(email=value.lower()).exists():
            raise serializers.ValidationError(
                'An account with this email already exists.'
            )
        return value.lower()

    def validate_kmpdc_number(self, value):
        """Make sure no other doctor has already registered this KMPDC number."""
        from apps.doctors.models import DoctorProfile
        normalised = value.strip().upper()
        if DoctorProfile.objects.filter(kmpdc_number=normalised).exists():
            raise serializers.ValidationError(
                'This KMPDC number is already linked to an account.'
            )
        return normalised

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password2': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        # Pull out the doctor-specific fields before passing to create_user()
        validated_data.pop('password2')
        kmpdc_number        = validated_data.pop('kmpdc_number')
        specialty           = validated_data.pop('specialty')
        years_of_experience = validated_data.pop('years_of_experience', 0)

        # transaction.atomic() means: run both database writes together.
        # If the DoctorProfile creation fails, the User creation is also
        # rolled back. No half-created accounts.
        with transaction.atomic():
            user = User.objects.create_user(role=User.Role.DOCTOR, **validated_data)

            from apps.doctors.models import DoctorProfile
            DoctorProfile.objects.create(
                user=user,
                kmpdc_number=kmpdc_number,
                specialty=specialty,
                years_of_experience=years_of_experience,
                # verification_status defaults to 'pending' on the model
            )

        return user


# ─── 4. User profile ──────────────────────────────────────────────────────────

class UserProfileSerializer(serializers.ModelSerializer):
    """
    Used by the GET /me/ and PATCH /me/ endpoints.

    Read-only fields: id, email, role, date_joined
    — these should never be changeable by the user themselves.

    Writable fields: first_name, last_name, phone, avatar
    — the user can update these from their profile screen.
    """

    # full_name is a @property on the model, not a DB column.
    # ReadOnlyField exposes it in the response without allowing writes.
    full_name = serializers.ReadOnlyField()

    class Meta:
        model  = User
        fields = [
            'id', 'email', 'first_name', 'last_name',
            'full_name', 'phone', 'role', 'avatar', 'date_joined',
        ]
        read_only_fields = ['id', 'email', 'role', 'date_joined']


# ─── 5. Change password ───────────────────────────────────────────────────────

class ChangePasswordSerializer(serializers.Serializer):
    """
    Used by the POST /change-password/ endpoint.

    We use plain Serializer (not ModelSerializer) because we are not
    saving a model directly — we are just validating three fields and
    then calling user.set_password() in the view.
    """

    old_password  = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'},
    )
    new_password  = serializers.CharField(
        write_only=True,
        validators=[validate_password],
        style={'input_type': 'password'},
    )
    new_password2 = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'},
    )

    def validate_old_password(self, value):
        """Verify the current password is correct before allowing a change."""
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password2']:
            raise serializers.ValidationError(
                {'new_password2': 'New passwords do not match.'}
            )
        return attrs


# ─── 6. Push token ────────────────────────────────────────────────────────────

class UpdatePushTokenSerializer(serializers.ModelSerializer):
    """
    Used by the PATCH /push-token/ endpoint.

    Only updates the push_token field — nothing else.
    Called once by the app after the user grants notification permission.
    """

    class Meta:
        model  = User
        fields = ['push_token']

    def validate_push_token(self, value):
        """Expo push tokens always start with 'ExponentPushToken['."""
        if value and not value.startswith('ExponentPushToken['):
            raise serializers.ValidationError(
                'Invalid format. Expected ExponentPushToken[...]'
            )
        return value