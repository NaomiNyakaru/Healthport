from datetime import date
from rest_framework import serializers
from .models import Appointment


# ─── 1. Create appointment ────────────────────────────────────────────────────

class AppointmentCreateSerializer(serializers.ModelSerializer):
    """
    Used when a patient books a new appointment.

    POST /api/v1/appointments/

    The patient sends:
    {
        "doctor": <doctor_user_id>,
        "appointment_date": "2024-12-10",
        "appointment_time": "10:00:00",
        "reason": "Recurring headaches for 2 weeks",
        "appointment_type": "virtual"
    }

    Validations:
    - Date cannot be in the past
    - Doctor must be verified and accepting patients
    - Patient cannot book the same doctor at the same date/time twice
    """

    class Meta:
        model  = Appointment
        fields = [
            'doctor',
            'appointment_date',
            'appointment_time',
            'duration_minutes',
            'appointment_type',
            'reason',
        ]

    def validate_appointment_date(self, value):
        """Appointment cannot be booked in the past."""
        if value < date.today():
            raise serializers.ValidationError(
                'Appointment date cannot be in the past.'
            )
        return value

    def validate_doctor(self, value):
        """
        The selected doctor must:
        1. Actually have a doctor profile (is a real doctor)
        2. Be KMPDC verified
        3. Be accepting new patients
        """
        try:
            profile = value.doctor_profile
        except Exception:
            raise serializers.ValidationError(
                'This user is not a registered doctor.'
            )

        if not profile.is_verified:
            raise serializers.ValidationError(
                'This doctor is not yet verified and cannot accept appointments.'
            )

        if not profile.is_accepting_patients:
            raise serializers.ValidationError(
                'This doctor is not currently accepting new appointments.'
            )

        return value

    def validate(self, attrs):
        """
        Cross-field validation — check for double booking.
        A patient cannot book the same doctor at the same date and time twice.
        """
        doctor           = attrs.get('doctor')
        appointment_date = attrs.get('appointment_date')
        appointment_time = attrs.get('appointment_time')
        patient          = self.context['request'].user

        # Check if this exact slot is already booked and not cancelled
        already_booked = Appointment.objects.filter(
            patient=patient,
            doctor=doctor,
            appointment_date=appointment_date,
            appointment_time=appointment_time,
        ).exclude(status=Appointment.Status.CANCELLED).exists()

        if already_booked:
            raise serializers.ValidationError(
                'You already have an appointment with this doctor at this time.'
            )

        return attrs

    def create(self, validated_data):
        """
        Attach the patient from the request before saving.
        The patient never sends their own ID — it comes from the JWT token.
        """
        patient = self.context['request'].user
        return Appointment.objects.create(
            patient=patient,
            **validated_data,
        )


# ─── 2. Full appointment (read) ───────────────────────────────────────────────

class AppointmentSerializer(serializers.ModelSerializer):
    """
    Full appointment object — returned in list and detail responses.

    Includes human-readable names for both parties and status
    so the app can display everything without extra API calls.
    """

    patient = serializers.CharField(source='patient.id', read_only=True)
    doctor  = serializers.CharField(source='doctor.id', read_only=True)

    patient_name         = serializers.CharField(source='patient.full_name',  read_only=True)
    doctor_name          = serializers.CharField(source='doctor.full_name',   read_only=True)
    cancelled_by_name    = serializers.CharField(source='cancelled_by.full_name', read_only=True, default=None)
    status_display       = serializers.CharField(source='get_status_display', read_only=True)
    type_display         = serializers.CharField(source='get_appointment_type_display', read_only=True)
    is_upcoming          = serializers.ReadOnlyField()

    # Doctor's specialty — useful to show on the appointment card
    doctor_specialty = serializers.CharField(
        source='doctor.doctor_profile.specialty',
        read_only=True,
    )
    doctor_avatar = serializers.ImageField(
        source='doctor.avatar',
        read_only=True,
    )
    patient_avatar = serializers.ImageField(
        source='patient.avatar',
        read_only=True,
    )

    class Meta:
        model  = Appointment
        fields = [
            'id',
            # Parties
            'patient', 'patient_name', 'patient_avatar',
            'doctor',  'doctor_name',  'doctor_avatar', 'doctor_specialty',
            # Schedule
            'appointment_date', 'appointment_time',
            'duration_minutes', 'appointment_type', 'type_display',
            # Status
            'status', 'status_display', 'is_upcoming',
            # Content
            'reason', 'notes',
            # Cancellation
            'cancellation_reason', 'cancelled_by', 'cancelled_by_name',
            # Timestamps
            'created_at', 'updated_at',
        ]
        read_only_fields = fields   # everything is read-only here


# ─── 3. Update appointment ────────────────────────────────────────────────────

class AppointmentUpdateSerializer(serializers.ModelSerializer):
    """
    Used to change the status of an appointment.

    PATCH /api/v1/appointments/<id>/

    What each role can do:
    - Doctor: confirm, complete (with notes), cancel
    - Patient: cancel only

    The view enforces which actions are allowed per role.
    This serializer just validates the fields being sent.
    """

    class Meta:
        model  = Appointment
        fields = [
            'status',
            'notes',
            'cancellation_reason',
        ]

    def validate_status(self, value):
        """
        Validate the status transition is legal.

        Allowed transitions:
        pending   → confirmed  (doctor confirms)
        pending   → cancelled  (patient or doctor cancels)
        confirmed → completed  (doctor marks done)
        confirmed → cancelled  (patient or doctor cancels)

        Illegal transitions:
        completed → anything   (completed appointments are final)
        cancelled → anything   (cancelled appointments are final)
        """
        current_status = self.instance.status if self.instance else None

        illegal_from = [
            Appointment.Status.COMPLETED,
            Appointment.Status.CANCELLED,
        ]

        if current_status in illegal_from:
            raise serializers.ValidationError(
                f'Cannot change status of a {current_status} appointment.'
            )

        return value

    def validate(self, attrs):
        """
        If cancelling, a cancellation_reason should be provided.
        We don't hard-enforce it but we note if it's missing.
        """
        new_status = attrs.get('status')
        if new_status == Appointment.Status.CANCELLED:
            if not attrs.get('cancellation_reason'):
                # Provide a default reason rather than rejecting the request
                attrs['cancellation_reason'] = 'No reason provided.'
        return attrs