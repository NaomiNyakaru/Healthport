import uuid
from django.db import models
from django.conf import settings


# ─── 1. Patient profile ───────────────────────────────────────────────────────

class PatientProfile(models.Model):
    """
    Medical profile for a patient.

    Stores personal health information that helps a doctor understand
    a patient's background before a consultation.

    Created automatically when a patient registers (via a signal in signals.py).
    The patient fills in the details from their profile screen in the app.

    Relationship:
        User (role='patient')  ──OneToOne──►  PatientProfile
    """

    class BloodGroup(models.TextChoices):
        A_POS   = 'A+',  'A+'
        A_NEG   = 'A-',  'A-'
        B_POS   = 'B+',  'B+'
        B_NEG   = 'B-',  'B-'
        AB_POS  = 'AB+', 'AB+'
        AB_NEG  = 'AB-', 'AB-'
        O_POS   = 'O+',  'O+'
        O_NEG   = 'O-',  'O-'
        UNKNOWN = '',    'Unknown'

    class Gender(models.TextChoices):
        MALE   = 'male',   'Male'
        FEMALE = 'female', 'Female'
        OTHER  = 'other',  'Other'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='patient_profile',
    )

    # ── Personal health info ──────────────────────────────────────────────────
    date_of_birth = models.DateField(null=True, blank=True)
    gender        = models.CharField(
        max_length=10, choices=Gender.choices, blank=True
    )
    blood_group   = models.CharField(
        max_length=3, choices=BloodGroup.choices, blank=True, default=''
    )
    national_id   = models.CharField(max_length=20, blank=True)

    # Stored as free text — patient lists them comma-separated
    # e.g. "Penicillin, Peanuts, Latex"
    allergies          = models.TextField(blank=True)
    chronic_conditions = models.TextField(
        blank=True,
        help_text='e.g. Diabetes Type 2, Hypertension',
    )

    # ── Emergency contact ─────────────────────────────────────────────────────
    emergency_contact_name  = models.CharField(max_length=100, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'patient_profiles'

    def __str__(self):
        return f'Patient: {self.user.full_name}'

    @property
    def age(self):
        """Calculates age from date_of_birth. Returns None if not set."""
        if not self.date_of_birth:
            return None
        from datetime import date
        today = date.today()
        d     = self.date_of_birth
        return today.year - d.year - (
            (today.month, today.day) < (d.month, d.day)
        )


# ─── 2. Medical record ────────────────────────────────────────────────────────

class MedicalRecord(models.Model):
    """
    A single entry in a patient's medical history.

    Can be created by:
    - The patient (self-reported history, e.g. past surgeries)
    - A doctor (after a consultation, e.g. diagnosis, lab result)

    Visibility:
    - is_private=False → both patient and verified doctors can read it
    - is_private=True  → only the patient can read it (doctor cannot see it)
    """

    class RecordType(models.TextChoices):
        DIAGNOSIS    = 'diagnosis',    'Diagnosis'
        LAB_RESULT   = 'lab_result',   'Lab Result'
        PRESCRIPTION = 'prescription', 'Prescription'
        SURGERY      = 'surgery',      'Surgery'
        ALLERGY      = 'allergy',      'Allergy'
        VACCINATION  = 'vaccination',  'Vaccination'
        NOTE         = 'note',         'General Note'

    # UUID primary key — safe to expose in URLs
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    patient = models.ForeignKey(
        PatientProfile,
        on_delete=models.CASCADE,
        related_name='medical_records',
    )

    # The doctor who created this record, if any.
    # blank=True/null=True because a patient can also create records themselves.
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,   # if doctor is deleted, keep the record
        null=True, blank=True,
        related_name='written_records',
    )

    record_type    = models.CharField(
        max_length=15,
        choices=RecordType.choices,
        default=RecordType.NOTE,
    )
    title          = models.CharField(max_length=200)
    description    = models.TextField()
    date_of_record = models.DateField()

    # Optional file attachment — e.g. a scanned lab result PDF
    attachment = models.FileField(
        upload_to='medical_records/',
        null=True, blank=True,
    )

    # If True, only the patient can see this record.
    # Doctors cannot access it even if they are verified.
    is_private = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'medical_records'
        ordering = ['-date_of_record']   # most recent records first

    def __str__(self):
        return f'{self.get_record_type_display()} — {self.patient.user.full_name} ({self.date_of_record})'


# ─── 3. Medication ────────────────────────────────────────────────────────────

class Medication(models.Model):
    """
    A medication a patient is taking or has taken.

    Created by the patient after visiting a doctor, or by a verified
    doctor after prescribing during a consultation.

    Linked to DosageLog entries which track whether each scheduled
    dose was taken, missed, or skipped.

    On Day 3 a Celery task reads active medications and sends push
    notification reminders based on the frequency and schedule.
    """

    class FrequencyUnit(models.TextChoices):
        DAILY = 'daily', 'Times per day'
        HOURS = 'hours', 'Every N hours'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    patient = models.ForeignKey(
        PatientProfile,
        on_delete=models.CASCADE,
        related_name='medications',
    )

    # The doctor who prescribed this, if any.
    prescribed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='prescriptions_given',
    )

    name         = models.CharField(max_length=200)
    dosage       = models.CharField(max_length=100, help_text='e.g. 500mg')
    instructions = models.TextField(
        blank=True,
        help_text='e.g. Take with food. Avoid alcohol.',
    )

    # How often to take this medication.
    # frequency=3, frequency_unit='daily' → take 3 times a day
    # frequency=8, frequency_unit='hours' → take every 8 hours
    frequency      = models.PositiveIntegerField(
        help_text='Number of times per day or interval in hours'
    )
    frequency_unit = models.CharField(
        max_length=10,
        choices=FrequencyUnit.choices,
        default=FrequencyUnit.DAILY,
    )

    start_date = models.DateField()
    end_date   = models.DateField(
        null=True, blank=True,
        help_text='Leave blank for ongoing medications',
    )
    is_active  = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'medications'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} {self.dosage} — {self.patient.user.full_name}'


# ─── 4. Dosage log ────────────────────────────────────────────────────────────

class DosageLog(models.Model):
    """
    Records what happened with each scheduled dose.

    When the app sends a medication reminder, the patient sees a
    notification: "Time to take Metformin 500mg". They open the app
    and tap "Taken", "Missed", or "Skipped".
    That tap creates a DosageLog entry here.

    This data lets the doctor see medication adherence during a consultation:
    "You missed 4 doses of Metformin last week — let's talk about that."
    """

    class DoseStatus(models.TextChoices):
        TAKEN   = 'taken',   'Taken'
        MISSED  = 'missed',  'Missed'
        SKIPPED = 'skipped', 'Skipped'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    medication = models.ForeignKey(
        Medication,
        on_delete=models.CASCADE,
        related_name='logs',
    )

    # When this dose was scheduled to be taken (set by the reminder system)
    scheduled_time = models.DateTimeField()

    # When the patient actually took it (null if missed/skipped)
    taken_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=10,
        choices=DoseStatus.choices,
        default=DoseStatus.TAKEN,
    )

    # Optional note from the patient e.g. "Felt nauseous after"
    notes = models.CharField(max_length=200, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table  = 'dosage_logs'
        ordering  = ['-scheduled_time']

    def __str__(self):
        return f'{self.medication.name} — {self.status} @ {self.scheduled_time}'