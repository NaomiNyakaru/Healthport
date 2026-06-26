from rest_framework import serializers
from .models import DoctorProfile


# ─── 1. Full profile ──────────────────────────────────────────────────────────

class DoctorProfileSerializer(serializers.ModelSerializer):
    """
    Full doctor profile — every field.

    Used on:
    - GET /api/v1/doctors/<id>/   patient taps a doctor to see full details
    - GET /api/v1/doctors/me/     doctor views their own profile

    Read-only computed fields:
    - full_name  → from user.full_name property
    - avatar     → from user.avatar field
    - is_verified → from doctor_profile.is_verified property
    """

    # These fields live on the related User model, not on DoctorProfile.
    # source= tells DRF where to find them.
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    avatar    = serializers.ImageField(source='user.avatar',   read_only=True)
    email     = serializers.EmailField(source='user.email',    read_only=True)
    phone     = serializers.CharField(source='user.phone',     read_only=True)

    # is_verified is a @property on the model — ReadOnlyField exposes it
    # in the response without allowing it to be written.
    is_verified = serializers.ReadOnlyField()

    # get_specialty_display() returns the human-readable label e.g. 'Paediatrics'
    # instead of the stored value e.g. 'paediatrics'
    specialty_display = serializers.CharField(
        source='get_specialty_display', read_only=True
    )

    class Meta:
        model  = DoctorProfile
        fields = [
            'id',
            # User fields
            'user_id',
            'full_name', 'email', 'phone', 'avatar',
            # KMPDC
            'kmpdc_number', 'verification_status', 'is_verified', 'verification_note',
            # Professional
            'specialty', 'specialty_display', 'years_of_experience',
            'bio', 'hospital_affiliation', 'consultation_fee',
            # Availability & rating
            'is_accepting_patients', 'average_rating', 'total_reviews',
            # Timestamps
            'created_at',
        ]
        read_only_fields = [
            'id', 'kmpdc_number',
            'verification_status', 'is_verified', 'verification_note',
            'average_rating', 'total_reviews',
            'created_at',
        ]


# ─── 2. Lightweight list serializer ──────────────────────────────────────────

class DoctorListSerializer(serializers.ModelSerializer):
    """
    Lightweight version of the doctor profile for the browse/search screen.

    Only includes fields needed to render a doctor card in the list:
    - Name and avatar
    - Specialty
    - Hospital
    - Fee
    - Rating

    Sending fewer fields means smaller responses and a faster-loading list.

    Used on:
    - GET /api/v1/doctors/          browse all verified doctors
    - GET /api/v1/doctors/?search=  search results
    """
    full_name       = serializers.CharField(source='user.full_name', read_only=True)
    avatar          = serializers.ImageField(source='user.avatar',   read_only=True)
    is_verified     = serializers.ReadOnlyField()
    specialty_display = serializers.CharField(
        source='get_specialty_display', read_only=True
    )

    class Meta:
        model  = DoctorProfile
        fields = [
            'id',
            'full_name', 'avatar',
            'specialty', 'specialty_display',
            'years_of_experience', 'hospital_affiliation',
            'consultation_fee',
            'average_rating', 'total_reviews',
            'is_verified', 'is_accepting_patients',
        ]


# ─── 3. Update serializer ─────────────────────────────────────────────────────

class DoctorUpdateSerializer(serializers.ModelSerializer):
    """
    Only the fields a doctor is allowed to update themselves.

    A doctor CANNOT change:
    - kmpdc_number      (set at registration, locked)
    - verification_status (set by admin only)
    - average_rating     (calculated from patient reviews)

    A doctor CAN change:
    - bio
    - hospital_affiliation
    - consultation_fee
    - is_accepting_patients  (toggle availability)
    - specialty
    - years_of_experience

    Used on:
    - PATCH /api/v1/doctors/me/
    """

    class Meta:
        model  = DoctorProfile
        fields = [
            'bio',
            'hospital_affiliation',
            'consultation_fee',
            'is_accepting_patients',
            'specialty',
            'years_of_experience',
        ]

    def validate_consultation_fee(self, value):
        """Fee must be a positive number if provided."""
        if value is not None and value < 0:
            raise serializers.ValidationError(
                'Consultation fee cannot be negative.'
            )
        return value

    def validate_years_of_experience(self, value):
        """Experience must be a reasonable number."""
        if value > 60:
            raise serializers.ValidationError(
                'Please enter a valid number of years of experience.'
            )
        return value


# ─── 4. Admin verification serializer ────────────────────────────────────────

class KMPDCVerifySerializer(serializers.Serializer):
    """
    Used by the admin-only endpoint to approve or reject a doctor.

    Body the admin sends:
        { "action": "verify", "note": "KMPDC confirmed." }
    or
        { "action": "reject", "note": "Number not found in registry." }

    Used on:
    - POST /api/v1/doctors/<id>/admin-verify/

    We use plain Serializer (not ModelSerializer) because we are not
    saving directly to a model field — we are calling profile.verify()
    or profile.reject() in the view.
    """
    action = serializers.ChoiceField(
        choices=['verify', 'reject'],
        help_text='verify to approve the doctor, reject to decline.',
    )
    note = serializers.CharField(
        required=False,
        allow_blank=True,
        default='',
        help_text='Optional note explaining the decision. Shown to the doctor.',
    )