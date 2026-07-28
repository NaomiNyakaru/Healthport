from django.apps import AppConfig


class AiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'

    # Must match exactly what is in INSTALLED_APPS in settings.py
    name = 'apps.ai'

    verbose_name = 'AI Features'