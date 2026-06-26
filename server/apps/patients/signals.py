from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_patient_profile(sender, instance, created, **kwargs):
    """
    Automatically creates a PatientProfile whenever a new patient User
    is saved to the database for the first time.

    Parameters Django passes to every signal handler:
    - sender   : the model class that fired the signal (User)
    - instance : the actual User object that was just saved
    - created  : True if this is a new row, False if an existing row was updated
    - kwargs   : any extra arguments (we don't need these)

    We check two things before creating the profile:
    1. created=True  → only on first save, not on every subsequent update
    2. is_patient    → only for patients, not doctors or admins
       (doctors get their DoctorProfile created in the serializer instead)
    """
    if created and instance.is_patient:
        # Import here (inside the function) to avoid circular imports.
        # If we imported at the top of this file, Python would try to import
        # PatientProfile before the app is fully loaded, which can cause errors.
        from .models import PatientProfile

        PatientProfile.objects.get_or_create(user=instance)
        # get_or_create instead of create() means if a profile already exists
        # for some reason (e.g. from a test or migration), we won't crash
        # with a duplicate key error — we just return the existing one.