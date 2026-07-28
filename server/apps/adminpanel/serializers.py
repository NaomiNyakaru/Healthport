from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.users.models import User
from apps.doctors.models import DoctorProfile
from apps.patients.models import PatientProfile, MedicalRecord, Medication, DosageLog
from apps.appointments.models import Appointment


# ─── 1. Users ──────────────────────────────────────────────────────────────────

class AdminUserListSerializer(serializers.ModelSerializer):
    """Lightweight row for the Users table."""

    full_name = serializers.ReadOnlyField()
    avatar    = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            'id', 'email', 'full_name', 'first_name', 'last_name',
            'phone', 'avatar', 'role', 'is_active', 'is_staff',
            'is_online', 'date_joined',
        ]

    def get_avatar(self, obj):
        return obj.get_avatar_url()


class AdminUserDetailSerializer(serializers.ModelSerializer):
    """
    Full detail view + the serializer used to PATCH a user from the
    admin dashboard.

    Mirrors what UserAdmin's fieldsets in apps/users/admin.py expose:
    account info, personal info, role & status, permissions. We keep
    email out of the editable set (changing login email has knock-on
    effects on auth we don't want to open up from a quick edit form) —
    everything else Django admin lets you touch here is editable.
    """

    full_name = serializers.ReadOnlyField()
    avatar    = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            'id', 'email', 'full_name', 'first_name', 'last_name',
            'phone', 'avatar', 'role', 'is_active', 'is_staff',
            'is_superuser', 'is_online', 'last_seen', 'date_joined',
            'updated_at',
        ]
        read_only_fields = [
            'id', 'email', 'is_online', 'last_seen',
            'date_joined', 'updated_at',
        ]

    def get_avatar(self, obj):
        return obj.get_avatar_url()


class AdminUserCreateSerializer(serializers.ModelSerializer):
    """
    Creates a user directly from the admin dashboard — the equivalent
    of Django admin's "Add user" form. Unlike the public registration
    endpoints, the admin can create a user of any role in one step and
    optionally grant staff access right away.
    """

    password  = serializers.CharField(write_only=True, validators=[validate_password])
    full_name = serializers.ReadOnlyField()

    class Meta:
        model  = User
        fields = [
            'id', 'email', 'password', 'first_name', 'last_name',
            'phone', 'role', 'is_active', 'is_staff', 'full_name',
        ]
        read_only_fields = ['id']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


# ─── 2. Doctors ────────────────────────────────────────────────────────────────

class AdminDoctorSerializer(serializers.ModelSerializer):
    """
    Full doctor record for the admin dashboard — every doctor
    regardless of verification status, with everything an admin needs
    to review a KMPDC application or edit a professional profile.
    """

    full_name          = serializers.CharField(source='user.full_name', read_only=True)
    email              = serializers.EmailField(source='user.email', read_only=True)
    phone              = serializers.CharField(source='user.phone', read_only=True)
    avatar             = serializers.SerializerMethodField()
    is_active          = serializers.BooleanField(source='user.is_active', read_only=True)
    is_verified        = serializers.ReadOnlyField()
    specialty_display  = serializers.CharField(source='get_specialty_display', read_only=True)
    verification_status_display = serializers.CharField(
        source='get_verification_status_display', read_only=True
    )

    class Meta:
        model  = DoctorProfile
        fields = [
            'id', 'user_id',
            'full_name', 'email', 'phone', 'avatar', 'is_active',
            'kmpdc_number', 'verification_status', 'verification_status_display',
            'is_verified', 'verification_note', 'verified_at',
            'specialty', 'specialty_display', 'years_of_experience',
            'bio', 'hospital_affiliation', 'consultation_fee',
            'is_accepting_patients', 'average_rating', 'total_reviews',
            'created_at',
        ]
        read_only_fields = [
            'id', 'user_id', 'kmpdc_number', 'verification_status',
            'is_verified', 'verified_at', 'average_rating',
            'total_reviews', 'created_at',
        ]

    def get_avatar(self, obj):
        return obj.user.get_avatar_url()


# ─── 3. Patients ───────────────────────────────────────────────────────────────

class AdminPatientSerializer(serializers.ModelSerializer):
    """Full patient profile, editable by an admin."""

    full_name = serializers.CharField(source='user.full_name', read_only=True)
    email     = serializers.EmailField(source='user.email', read_only=True)
    phone     = serializers.CharField(source='user.phone', read_only=True)
    avatar    = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(source='user.is_active', read_only=True)
    age       = serializers.ReadOnlyField()

    class Meta:
        model  = PatientProfile
        fields = [
            'id', 'user_id',
            'full_name', 'email', 'phone', 'avatar', 'is_active', 'age',
            'date_of_birth', 'gender', 'blood_group', 'national_id',
            'allergies', 'chronic_conditions',
            'emergency_contact_name', 'emergency_contact_phone',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user_id', 'created_at', 'updated_at']

    def get_avatar(self, obj):
        return obj.user.get_avatar_url()


# ─── 4. Medical records ────────────────────────────────────────────────────────

class AdminMedicalRecordSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.user.full_name', read_only=True)
    doctor_name  = serializers.CharField(source='doctor.full_name', read_only=True, default=None)
    record_type_display = serializers.CharField(source='get_record_type_display', read_only=True)

    class Meta:
        model  = MedicalRecord
        fields = [
            'id', 'patient', 'patient_name', 'doctor', 'doctor_name',
            'record_type', 'record_type_display', 'title', 'description',
            'date_of_record', 'is_private', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# ─── 5. Medications ────────────────────────────────────────────────────────────

class AdminMedicationSerializer(serializers.ModelSerializer):
    patient_name       = serializers.CharField(source='patient.user.full_name', read_only=True)
    prescribed_by_name = serializers.CharField(source='prescribed_by.full_name', read_only=True, default=None)
    frequency_unit_display = serializers.CharField(source='get_frequency_unit_display', read_only=True)

    class Meta:
        model  = Medication
        fields = [
            'id', 'patient', 'patient_name',
            'prescribed_by', 'prescribed_by_name',
            'name', 'dosage', 'instructions',
            'frequency', 'frequency_unit', 'frequency_unit_display',
            'start_date', 'end_date', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


# ─── 6. Dosage logs ─────────────────────────────────────────────────────────────

class AdminDosageLogSerializer(serializers.ModelSerializer):
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    patient_name    = serializers.CharField(source='medication.patient.user.full_name', read_only=True)
    status_display  = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model  = DosageLog
        fields = [
            'id', 'medication', 'medication_name', 'patient_name',
            'scheduled_time', 'taken_at', 'status', 'status_display',
            'notes', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


# ─── 7. Appointments ────────────────────────────────────────────────────────────

class AdminAppointmentSerializer(serializers.ModelSerializer):
    patient_name      = serializers.CharField(source='patient.full_name', read_only=True)
    doctor_name       = serializers.CharField(source='doctor.full_name', read_only=True)
    status_display    = serializers.CharField(source='get_status_display', read_only=True)
    type_display      = serializers.CharField(source='get_appointment_type_display', read_only=True)
    cancelled_by_name = serializers.CharField(source='cancelled_by.full_name', read_only=True, default=None)
    is_upcoming       = serializers.ReadOnlyField()

    class Meta:
        model  = Appointment
        fields = [
            'id', 'patient', 'patient_name', 'doctor', 'doctor_name',
            'appointment_date', 'appointment_time', 'duration_minutes',
            'appointment_type', 'type_display', 'status', 'status_display',
            'is_upcoming', 'reason', 'notes',
            'cancellation_reason', 'cancelled_by', 'cancelled_by_name',
            'reminder_24h_sent', 'reminder_1h_sent',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'patient', 'doctor', 'is_upcoming', 'cancelled_by',
            'created_at', 'updated_at',
        ]


# ─── 8. Dashboard stats ─────────────────────────────────────────────────────────

class AdminStatsSerializer(serializers.Serializer):
    """Plain serializer just to document the shape of /admin/stats/."""
    total_users         = serializers.IntegerField()
    total_patients       = serializers.IntegerField()
    total_doctors        = serializers.IntegerField()
    pending_doctors       = serializers.IntegerField()
    verified_doctors       = serializers.IntegerField()
    rejected_doctors        = serializers.IntegerField()
    active_users_today       = serializers.IntegerField()
    total_appointments        = serializers.IntegerField()
    pending_appointments       = serializers.IntegerField()
    upcoming_appointments        = serializers.IntegerField()
    total_medical_records         = serializers.IntegerField()
    total_medications              = serializers.IntegerField()