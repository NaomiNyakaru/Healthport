from django.db import models
from django.conf import settings


class DoctorProfile(models.Model):
    """
    Extended profile for doctors in HealthPort.

    Every doctor has one User record (in apps/users/models.py) which handles
    login, email, name, and push notifications.

    This model stores everything specific to being a doctor:
    - KMPDC registration and verification state
    - Medical specialty and experience
    - Profile details shown to patients when browsing
    - Availability and rating

    The relationship is:
        User (role='doctor')  ──OneToOne──►  DoctorProfile
    """

    # ── Verification states ───────────────────────────────────────────────────
    # A doctor moves through these states:
    #   1. Signs up          → pending
    #   2. Admin checks KMPDC → verified OR rejected
    # Only verified doctors can chat with patients and receive appointments.

    class VerificationStatus(models.TextChoices):
        PENDING  = 'pending',  'Pending'
        VERIFIED = 'verified', 'Verified'
        REJECTED = 'rejected', 'Rejected'

    # ── Specialties ───────────────────────────────────────────────────────────
    # Matches the specialties recognised by KMPDC in Kenya.

    class Specialty(models.TextChoices):
        GENERAL_PRACTICE = 'general_practice', 'General Practice'
        CARDIOLOGY       = 'cardiology',        'Cardiology'
        DERMATOLOGY      = 'dermatology',       'Dermatology'
        GYNAECOLOGY      = 'gynaecology',       'Gynaecology & Obstetrics'
        NEUROLOGY        = 'neurology',         'Neurology'
        ONCOLOGY         = 'oncology',          'Oncology'
        OPHTHALMOLOGY    = 'ophthalmology',     'Ophthalmology'
        ORTHOPAEDICS     = 'orthopaedics',      'Orthopaedics'
        PAEDIATRICS      = 'paediatrics',       'Paediatrics'
        PSYCHIATRY       = 'psychiatry',        'Psychiatry'
        RADIOLOGY        = 'radiology',         'Radiology'
        SURGERY          = 'surgery',           'Surgery'
        DENTISTRY        = 'dentistry',         'Dentistry'
        OTHER            = 'other',             'Other'

    # ── Relationship to User ──────────────────────────────────────────────────
    # OneToOneField means one User can have at most one DoctorProfile.
    # related_name='doctor_profile' lets us write user.doctor_profile
    # instead of user.doctorprofile (Django's default).

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,       # if the User is deleted, delete the profile too
        related_name='doctor_profile',
    )

    # ── KMPDC verification ────────────────────────────────────────────────────
    kmpdc_number = models.CharField(
        max_length=50,
        unique=True,    # no two doctors can register the same number
    )
    verification_status = models.CharField(
        max_length=10,
        choices=VerificationStatus.choices,
        default=VerificationStatus.PENDING,  # always starts as pending
        db_index=True,
    )
    # If a doctor is rejected, we store the reason here so we can notify them.
    verification_note = models.TextField(blank=True)
    # Timestamp of when the doctor was approved — useful for audit trail.
    verified_at = models.DateTimeField(null=True, blank=True)

    # ── Professional details ──────────────────────────────────────────────────
    specialty = models.CharField(
        max_length=30,
        choices=Specialty.choices,
        default=Specialty.GENERAL_PRACTICE,
        db_index=True,   # indexed because patients filter doctors by specialty
    )
    years_of_experience  = models.PositiveIntegerField(default=0)
    bio                  = models.TextField(blank=True)
    hospital_affiliation = models.CharField(max_length=200, blank=True)

    # Consultation fee in Kenyan Shillings (KES).
    # null=True means a doctor can leave this blank if they prefer to discuss fees privately.
    consultation_fee = models.DecimalField(
        max_digits=10, decimal_places=2,
        null=True, blank=True,
    )

    # ── Availability ──────────────────────────────────────────────────────────
    # Doctors can toggle this off when they are fully booked or on leave.
    # Patients only see doctors where is_accepting_patients=True in the browse screen.
    is_accepting_patients = models.BooleanField(default=True)

    # ── Rating ────────────────────────────────────────────────────────────────
    # These are updated by a signal whenever a patient leaves a review.
    # Stored here for fast reads — avoids recalculating the average on every request.
    average_rating = models.DecimalField(
        max_digits=3, decimal_places=2, default=0.00
    )
    total_reviews = models.PositiveIntegerField(default=0)

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'doctor_profiles'
        ordering = ['-average_rating']  # highest rated doctors appear first

    def __str__(self):
        return f'Dr. {self.user.full_name} — {self.get_specialty_display()}'

    # ── Computed properties ───────────────────────────────────────────────────

    @property
    def is_verified(self) -> bool:
        """Shortcut used throughout the codebase and in permissions.py."""
        return self.verification_status == self.VerificationStatus.VERIFIED

    # ── State transition methods ──────────────────────────────────────────────
    # These are called by the admin (via admin.py actions or the API endpoint).
    # Keeping the logic here means it's reusable from anywhere.

    def verify(self, note=''):
        """
        Approve a doctor after their KMPDC number has been confirmed.
        Called by:
        - Django admin bulk action
        - KMPDCAdminVerifyView (doctors/views.py)
        """
        from django.utils import timezone
        self.verification_status = self.VerificationStatus.VERIFIED
        self.verification_note   = note
        self.verified_at         = timezone.now()
        # update_fields tells Django to only UPDATE these 3 columns,
        # not the entire row — more efficient and avoids race conditions.
        self.save(update_fields=['verification_status', 'verification_note', 'verified_at'])

    def reject(self, note=''):
        """
        Reject a doctor if their KMPDC number could not be confirmed.
        The note should explain why so we can notify the doctor.
        """
        self.verification_status = self.VerificationStatus.REJECTED
        self.verification_note   = note
        self.save(update_fields=['verification_status', 'verification_note'])
