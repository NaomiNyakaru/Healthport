from rest_framework import serializers
from .models import PatientProfile, MedicalRecord, Medication, DosageLog


# ─── 1. Patient profile ───────────────────────────────────────────────────────

class PatientProfileSerializer(serializers.ModelSerializer):
    """
    Read and update a patient's personal health profile.

    Used on:
    - GET  /api/v1/patients/me/              patient views own profile
    - PATCH /api/v1/patients/me/             patient updates own profile
    - GET  /api/v1/patients/<id>/profile/    doctor views a patient's profile

    Computed fields (read-only, not stored in DB):
    - full_name  → from user.full_name
    - email      → from user.email
    - avatar     → from user.avatar
    - age        → calculated from date_of_birth
    """

    # These fields live on the related User model, not on PatientProfile.
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    email     = serializers.EmailField(source='user.email',    read_only=True)
    avatar    = serializers.ImageField(source='user.avatar',   read_only=True)

    # age is a @property on PatientProfile — ReadOnlyField exposes it
    age = serializers.ReadOnlyField()

    class Meta:
        model  = PatientProfile
        fields = [
            'id',
            # From User model
            'full_name', 'email', 'avatar', 'age',
            # Personal health
            'date_of_birth', 'gender', 'blood_group', 'national_id',
            'allergies', 'chronic_conditions',
            # Emergency contact
            'emergency_contact_name', 'emergency_contact_phone',
            # Timestamps
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


# ─── 2. Medical record ────────────────────────────────────────────────────────

class MedicalRecordSerializer(serializers.ModelSerializer):
    """
    Create and read medical records.

    Used on:
    - GET  /api/v1/patients/me/records/         patient's own records
    - POST /api/v1/patients/me/records/         patient adds a record
    - GET  /api/v1/patients/<id>/records/       doctor views patient records

    Smart behaviour in create():
    If the request comes from a verified doctor, they are automatically
    set as the record's author. The patient never sets the doctor field.
    """

    # Show the doctor's name in read responses without exposing their full object
    doctor_name = serializers.CharField(
        source='doctor.full_name',
        read_only=True,
    )
    record_type_display = serializers.CharField(
        source='get_record_type_display',
        read_only=True,
    )

    class Meta:
        model  = MedicalRecord
        fields = [
            'id',
            'record_type', 'record_type_display',
            'title', 'description',
            'date_of_record',
            'attachment',
            'is_private',
            # Doctor info
            'doctor', 'doctor_name',
            # Timestamps
            'created_at',
        ]
        read_only_fields = ['id', 'doctor', 'created_at']
        # doctor is read-only here because it's set automatically in create()
        # not by the user submitting the form

    def validate_date_of_record(self, value):
        """Record date cannot be in the future."""
        from datetime import date
        if value > date.today():
            raise serializers.ValidationError(
                'Date of record cannot be in the future.'
            )
        return value

    def create(self, validated_data):
        """
        If the request comes from a doctor, tag them as the author.
        The view passes request via context so we can access it here.
        """
        request = self.context.get('request')
        if request and request.user.is_doctor:
            validated_data['doctor'] = request.user
        return super().create(validated_data)


# ─── 3. Medication ────────────────────────────────────────────────────────────

class MedicationSerializer(serializers.ModelSerializer):
    """
    Create and read medication entries.

    Used on:
    - GET  /api/v1/patients/me/medications/      list medications
    - POST /api/v1/patients/me/medications/      add a medication
    - GET  /api/v1/patients/me/medications/<id>/ medication detail

    Smart behaviour:
    - If a doctor makes the request, they are tagged as prescribed_by.
    - end_date must be after start_date if provided.
    """

    prescribed_by_name = serializers.CharField(
        source='prescribed_by.full_name',
        read_only=True,
    )
    frequency_unit_display = serializers.CharField(
        source='get_frequency_unit_display',
        read_only=True,
    )

    class Meta:
        model  = Medication
        fields = [
            'id',
            'name', 'dosage', 'instructions',
            'frequency', 'frequency_unit', 'frequency_unit_display',
            'start_date', 'end_date',
            'is_active',
            # Prescriber info
            'prescribed_by', 'prescribed_by_name',
            # Timestamps
            'created_at',
        ]
        read_only_fields = ['id', 'prescribed_by', 'created_at']

    def validate(self, attrs):
        """
        Cross-field validation — runs after each individual field is validated.
        Checks that end_date is not before start_date.
        """
        start = attrs.get('start_date')
        end   = attrs.get('end_date')

        if start and end and end < start:
            raise serializers.ValidationError({
                'end_date': 'End date cannot be before start date.'
            })
        return attrs

    def validate_frequency(self, value):
        """Frequency must be a sensible number."""
        if value < 1:
            raise serializers.ValidationError(
                'Frequency must be at least 1.'
            )
        if value > 24:
            raise serializers.ValidationError(
                'Frequency cannot exceed 24 times per day.'
            )
        return value

    def create(self, validated_data):
        """Tag the prescribing doctor if the request comes from one."""
        request = self.context.get('request')
        if request and request.user.is_doctor:
            validated_data['prescribed_by'] = request.user
        return super().create(validated_data)


# ─── 4. Dosage log ────────────────────────────────────────────────────────────

class DosageLogSerializer(serializers.ModelSerializer):
    """
    Record a dose event — taken, missed, or skipped.

    Used on:
    - GET  /api/v1/patients/me/dosage-logs/   list all dose history
    - POST /api/v1/patients/me/dosage-logs/   log a new dose event

    Safety check in validate_medication():
    The medication must belong to the patient making the request.
    This prevents a patient from logging doses against another
    patient's medication by guessing a UUID.
    """

    medication_name = serializers.CharField(
        source='medication.name',
        read_only=True,
    )
    status_display = serializers.CharField(
        source='get_status_display',
        read_only=True,
    )

    class Meta:
        model  = DosageLog
        fields = [
            'id',
            'medication', 'medication_name',
            'scheduled_time', 'taken_at',
            'status', 'status_display',
            'notes',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate_medication(self, value):
        """
        Ensure the medication belongs to the patient making the request.

        value is the Medication object DRF already looked up from the
        UUID the patient sent. We just need to check ownership.
        """
        request = self.context.get('request')
        if request and hasattr(request.user, 'patient_profile'):
            if value.patient != request.user.patient_profile:
                raise serializers.ValidationError(
                    'This medication does not belong to you.'
                )
        return value

    def validate(self, attrs):
        """
        If status is 'taken', taken_at should be provided.
        We don't hard-enforce this (maybe they forgot to record the time)
        but we set it to now if missing.
        """
        from django.utils import timezone
        if attrs.get('status') == DosageLog.DoseStatus.TAKEN:
            if not attrs.get('taken_at'):
                attrs['taken_at'] = timezone.now()
        return attrs