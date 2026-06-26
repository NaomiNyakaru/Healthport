from rest_framework.permissions import BasePermission


class IsDoctor(BasePermission):
    """
    Grants access only to users with role == 'doctor'.

    Does NOT check verification status — a pending doctor can still
    reach endpoints protected by this class.

    Used on:
    - GET  /api/v1/doctors/me/          (view own profile)
    - PUT  /api/v1/doctors/me/          (edit own profile)
    - GET  /api/v1/doctors/verification-status/  (poll KMPDC status)
    """
    message = 'Only doctors can perform this action.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_doctor      # property defined in users/models.py
        )


class IsVerifiedDoctor(BasePermission):
    """
    Grants access only to doctors whose KMPDC verification has been approved.

    This is the main security gate that protects patient data.
    A doctor who just registered sits at 'pending' and is blocked here
    until an admin approves them via the admin panel or the
    /api/v1/doctors/<id>/admin-verify/ endpoint.

    Used on:
    - Viewing a patient's profile
    - Viewing a patient's medical records
    - Accepting or managing appointments
    - Sending messages to a patient via chat
    """
    message = (
        'Your account is pending KMPDC verification. '
        'You will be notified once your registration number is confirmed.'
    )

    def has_permission(self, request, view):
        # Gate 1 — must be logged in as a doctor
        if not (request.user and request.user.is_authenticated and request.user.is_doctor):
            return False

        # Gate 2 — must have a verified doctor profile
        # We wrap in try/except because in rare cases the profile may not
        # exist yet (e.g. something went wrong mid-registration).
        try:
            return request.user.doctor_profile.is_verified
        except Exception:
            return False


class IsAdminUser(BasePermission):
    """
    Grants access only to staff/admin users.

    Used on:
    - POST /api/v1/doctors/<id>/admin-verify/
      (approve or reject a doctor's KMPDC number)

    Only you — the person who ran createsuperuser — should be able
    to call this endpoint. is_staff is set to True on superusers
    and on any user you manually mark as staff in the admin panel.
    """
    message = 'Only admin users can perform this action.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )