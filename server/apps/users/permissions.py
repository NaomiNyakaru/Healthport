from rest_framework.permissions import BasePermission


class IsPatient(BasePermission):
    """
    Grants access only to users with role == 'patient'.

    Used on all /api/v1/patients/me/... endpoints.
    A doctor or admin hitting these endpoints gets 403.
    """
    # This message is returned in the API response when access is denied.
    message = 'Only patients can perform this action.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_patient      # property we defined in models.py
        )


class IsDoctor(BasePermission):
    """
    Grants access only to users with role == 'doctor'.

    Does NOT check KMPDC verification status.
    A pending (unverified) doctor can still reach endpoints
    protected by this class — for example, editing their own profile
    or checking their verification status.

    For endpoints that require verification, use IsVerifiedDoctor instead.
    """
    message = 'Only doctors can perform this action.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_doctor        # property we defined in models.py
        )


class IsVerifiedDoctor(BasePermission):
    """
    Grants access only to doctors who have passed KMPDC verification.

    This is the main security gate that protects patient data.
    A doctor who just registered (verification_status='pending') will
    be blocked here until an admin approves them.

    Used on:
    - Viewing a patient's profile
    - Viewing a patient's medical records
    - Booking or managing appointments on behalf of a patient
    - Sending messages to a patient
    """
    message = (
        'Your account is pending KMPDC verification. '
        'You will be notified once your registration number is confirmed.'
    )

    def has_permission(self, request, view):
        # Step 1: must be logged in and be a doctor
        if not (request.user and request.user.is_authenticated and request.user.is_doctor):
            return False

        # Step 2: must have a verified doctor profile
        # We wrap in try/except because a doctor might not have a profile yet
        # (e.g., if something went wrong during registration)
        try:
            return request.user.doctor_profile.is_verified
        except Exception:
            return False


class IsOwnerOrVerifiedDoctor(BasePermission):
    """
    Two-sided permission used on medical records and patient profiles:

    - A PATIENT can access their own objects only.
    - A VERIFIED DOCTOR can access any patient's objects.

    This requires two methods:
    - has_permission   → called first, checks the user's role
    - has_object_permission → called second, checks ownership of the specific object

    Both must return True for access to be granted.
    """
    message = 'You do not have permission to access this resource.'

    def has_permission(self, request, view):
        """Gate 1 — is this user a patient or a verified doctor?"""
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.is_patient:
            return True

        if request.user.is_doctor:
            try:
                return request.user.doctor_profile.is_verified
            except Exception:
                return False

        return False

    def has_object_permission(self, request, view, obj):
        """
        Gate 2 — does this user own this specific object?

        obj could be a PatientProfile, MedicalRecord, or Medication.
        We find the owner by looking for a .user or .patient.user attribute.
        """
        # Verified doctors can read any patient's objects
        if request.user.is_doctor:
            try:
                return request.user.doctor_profile.is_verified
            except Exception:
                return False

        # Patient can only access objects they own
        if request.user.is_patient:
            # Try obj.user first (e.g. PatientProfile)
            owner = getattr(obj, 'user', None)

            # Then try obj.patient.user (e.g. MedicalRecord, Medication)
            if owner is None:
                patient = getattr(obj, 'patient', None)
                owner   = getattr(patient, 'user', None)

            return owner == request.user

        return False