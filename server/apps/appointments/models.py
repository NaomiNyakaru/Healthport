import uuid
from django.db import models
from django.conf import settings


class Appointment(models.Model):
    """
    A scheduled consultation between a patient and a doctor.

    Created by the patient (via POST /api/v1/appointments/).
    Confirmed or cancelled by the doctor.
    Either party can cancel after confirmation.

    Relationships:
        Patient (User)  ──ForeignKey──►  Appointment
        Doctor  (User)  ──ForeignKey──►  Appointment

    We link to User directly (not PatientProfile/DoctorProfile) because
    the appointment belongs to the person, not the profile.
    """

    class Status(models.TextChoices):
        PENDING   = 'pending',   'Pending'     # patient booked, awaiting doctor
        CONFIRMED = 'confirmed', 'Confirmed'   # doctor accepted
        COMPLETED = 'completed', 'Completed'   # consultation done
        CANCELLED = 'cancelled', 'Cancelled'   # cancelled by either party

    class AppointmentType(models.TextChoices):
        IN_PERSON = 'in_person', 'In Person'
        VIRTUAL   = 'virtual',   'Virtual'

    # ── Identity ──────────────────────────────────────────────────────────────
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ── Parties ───────────────────────────────────────────────────────────────
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='patient_appointments',
        limit_choices_to={'role': 'patient'},  # only patients can be the patient
    )
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='doctor_appointments',
        limit_choices_to={'role': 'doctor'},   # only doctors can be the doctor
    )

    # ── Scheduling ────────────────────────────────────────────────────────────
    # Stored separately so we can easily query by date
    # e.g. Appointment.objects.filter(appointment_date=today)
    appointment_date = models.DateField()
    appointment_time = models.TimeField()
    duration_minutes = models.PositiveIntegerField(
        default=30,
        help_text='Estimated duration in minutes',
    )
    appointment_type = models.CharField(
        max_length=10,
        choices=AppointmentType.choices,
        default=AppointmentType.VIRTUAL,
    )

    # ── Status ────────────────────────────────────────────────────────────────
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )

    # ── Content ───────────────────────────────────────────────────────────────
    # Patient fills this in when booking — reason for the visit
    reason = models.TextField(
        help_text='Reason for the appointment — filled in by the patient'
    )

    # Doctor fills this in after the appointment is completed
    notes = models.TextField(
        blank=True,
        help_text='Doctor\'s consultation notes — added after completion',
    )

    # Set when either party cancels — explains why
    cancellation_reason = models.TextField(blank=True)

    # Who cancelled — patient or doctor
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='cancelled_appointments',
    )

    # ── Reminders ─────────────────────────────────────────────────────────────
    # Tracks whether reminders have been sent so Celery doesn't send duplicates
    reminder_24h_sent = models.BooleanField(default=False)
    reminder_1h_sent  = models.BooleanField(default=False)

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'appointments'
        ordering = ['appointment_date', 'appointment_time']

    def __str__(self):
        return (
            f'{self.patient.full_name} → Dr. {self.doctor.full_name} '
            f'on {self.appointment_date} at {self.appointment_time} '
            f'[{self.status}]'
        )

    # ── Computed properties ───────────────────────────────────────────────────

    @property
    def is_upcoming(self):
        """True if the appointment is in the future and not cancelled."""
        from datetime import date, time, datetime
        if self.status == self.Status.CANCELLED:
            return False
        appt_datetime = datetime.combine(self.appointment_date, self.appointment_time)
        return appt_datetime > datetime.now()

    # ── State transition methods ──────────────────────────────────────────────

    def confirm(self):
        """Doctor confirms the appointment."""
        self.status = self.Status.CONFIRMED
        self.save(update_fields=['status', 'updated_at'])

    def complete(self, notes=''):
        """Mark the appointment as completed after the consultation."""
        self.status = self.Status.COMPLETED
        if notes:
            self.notes = notes
        self.save(update_fields=['status', 'notes', 'updated_at'])

    def cancel(self, cancelled_by_user, reason=''):
        """Cancel the appointment — can be called by patient or doctor."""
        self.status             = self.Status.CANCELLED
        self.cancelled_by       = cancelled_by_user
        self.cancellation_reason = reason
        self.save(update_fields=[
            'status', 'cancelled_by', 'cancellation_reason', 'updated_at'
        ])