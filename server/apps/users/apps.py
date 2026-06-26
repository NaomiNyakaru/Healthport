from django.apps import AppConfig


class UsersConfig(AppConfig):
    # Tells Django to use BigAutoField for any auto-generated integer PKs.
    # Our User uses UUID so this won't affect it directly — but other models
    # we add later (like through tables) will inherit this default.
    default_auto_field = 'django.db.models.BigAutoField'
 
    # Must match the dotted path used in INSTALLED_APPS in settings.py.
    # We have 'apps.users' there, so this must be 'apps.users' here too.
    name = 'apps.users'
 
    # Human-readable name shown in the Django admin sidebar.
    verbose_name = 'Users'
