from django.apps import AppConfig


class ChatConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'

    # Must match exactly what is in INSTALLED_APPS in settings.py
    name = 'apps.chat'

    verbose_name = 'Chat'

    # No signals needed for chat.
    # The WebSocket consumer handles everything in real time.