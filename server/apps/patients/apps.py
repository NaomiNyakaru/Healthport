from django.apps import AppConfig


class PatientsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.patients'
    verbose_name = 'Patients'

    def ready(self):
        """
        Called by Django once the app registry is fully loaded.
        This is the correct place to import signals so they get
        connected to the post_save event before any requests come in.

        Without this import, the signal handler in signals.py exists
        as code but is never registered — the post_save event fires
        but nothing is listening, so PatientProfiles never get created.
        """
        import apps.patients.signals  # noqa: F401
        # noqa: F401 tells the linter to ignore the "imported but unused"
        # warning — we import it purely for the side effect of registering
        # the @receiver decorator, not to use anything from it directly.