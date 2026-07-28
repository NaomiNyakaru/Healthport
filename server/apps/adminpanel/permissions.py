from rest_framework.permissions import BasePermission


class IsAdminStaff(BasePermission):
    """
    Grants access only to staff/admin users.

    Everything under /api/v1/admin/ is protected by this — it's the
    entire reason this app exists: a logged-in user with is_staff=True
    (set automatically for role='admin' users, see users/models.py
    UserManager.create_superuser) gets access to the admin dashboard
    API. Regular patients and doctors get a 403 from every endpoint here.
    """
    message = 'Only admin users can access the admin dashboard.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )