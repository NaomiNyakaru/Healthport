from pathlib import Path
from datetime import timedelta
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent


# ─── Security ─────────────────────────────────────────────────────────────────
# decouple reads these from your .env file so you never hardcode secrets.
# During development your .env has DEBUG=True and a local SECRET_KEY.
# In production you set real values on the server.

SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-me-in-production')
DEBUG      = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = ['*']   # tighten this to your domain in production


# ─── Installed apps ───────────────────────────────────────────────────────────
# Order matters here — our apps come after third-party apps.

INSTALLED_APPS = [
    # Django built-ins
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party packages
    'rest_framework',                        # Django REST Framework
    'rest_framework_simplejwt',              # JWT authentication
    'rest_framework_simplejwt.token_blacklist',  # lets us blacklist tokens on logout
    'corsheaders',                           # allow React Native app to call this API
    'channels',                              # WebSockets for chat (Day 2)

    # Our apps — must match the 'name' field in each app's apps.py
    'apps.users',
    'apps.doctors',
    'apps.patients',
    'apps.appointments',
    'apps.chat',
    
]


# ─── Middleware ───────────────────────────────────────────────────────────────
# CorsMiddleware MUST be first so it can add CORS headers before any
# other middleware processes the request.

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',          # ← must be first
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# ─── URL + WSGI/ASGI ─────────────────────────────────────────────────────────
# These point to your project's url and server files.
# 'server' is the name of your Django project folder.

ROOT_URLCONF        = 'server.urls'
WSGI_APPLICATION    = 'server.wsgi.application'
ASGI_APPLICATION    = 'server.asgi.application'   # needed for Channels/WebSockets


# ─── Templates ────────────────────────────────────────────────────────────────

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]


# ─── Database ─────────────────────────────────────────────────────────────────
# We use PostgreSQL in production and can keep SQLite for quick local testing.
# Switch to PostgreSQL by setting DB_ENGINE=django.db.backends.postgresql
# and filling in the other DB_ values in your .env file.

DATABASES = {
    'default': {
        'ENGINE':   config('DB_ENGINE',   default='django.db.backends.sqlite3'),
        'NAME':     config('DB_NAME',     default=str(BASE_DIR / 'db.sqlite3')),
        'USER':     config('DB_USER',     default=''),
        'PASSWORD': config('DB_PASSWORD', default=''),
        'HOST':     config('DB_HOST',     default='localhost'),
        'PORT':     config('DB_PORT',     default='5432'),
    }
}


# ─── Custom User model ────────────────────────────────────────────────────────
# This single line tells Django to use OUR User model (apps/users/models.py)
# instead of the default one. Must be set BEFORE the first migration.
# If you ever need to change this after migrating, it is very painful —
# so we set it right now before running any migrations.

AUTH_USER_MODEL = 'users.User'


# ─── Password validation ──────────────────────────────────────────────────────

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ─── Internationalisation ─────────────────────────────────────────────────────

LANGUAGE_CODE = 'en-us'
TIME_ZONE     = 'Africa/Nairobi'   # all datetimes stored and displayed in Nairobi time
USE_I18N      = True
USE_TZ        = True


# ─── Static and media files ───────────────────────────────────────────────────
# MEDIA is for user-uploaded files — avatars, medical record attachments etc.

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL  = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ─── CORS ─────────────────────────────────────────────────────────────────────
# CORS (Cross-Origin Resource Sharing) controls which clients can call our API.
# Without this, the React Native app running on your phone/emulator would be
# blocked by the browser/OS from making requests to this server.

CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:8081,http://localhost:19006',
).split(',')

CORS_ALLOW_CREDENTIALS = True   # allows cookies and auth headers


# ─── Django REST Framework ────────────────────────────────────────────────────

REST_FRAMEWORK = {
    # Every request must include a valid JWT token unless the view
    # explicitly sets permission_classes = [AllowAny]
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    # Return JSON only — no HTML browsable API in production
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    # Our custom error handler (defined in apps/users/middleware.py)
    # Wraps all errors in { "error": true, "status": ..., "detail": ... }
    'EXCEPTION_HANDLER': 'apps.users.middleware.custom_exception_handler',

    # Pagination — list endpoints return 20 items per page by default
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}


# ─── Simple JWT ───────────────────────────────────────────────────────────────
# Access token:  expires after 60 minutes — short for security
# Refresh token: expires after 7 days — patient/doctor stays logged in for a week
#
# ROTATE_REFRESH_TOKENS: every time a refresh token is used to get a new
# access token, a brand new refresh token is also issued. This means the
# 7-day window keeps sliding as long as the user is active.
#
# BLACKLIST_AFTER_ROTATION: the old refresh token is blacklisted immediately
# after rotation so it can never be reused.

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(minutes=config('ACCESS_TOKEN_LIFETIME_MINUTES', default=60, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=config('REFRESH_TOKEN_LIFETIME_DAYS', default=7, cast=int)),
    'ROTATE_REFRESH_TOKENS':  True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    # Our custom serializer adds user info to the login response
    'TOKEN_OBTAIN_SERIALIZER': 'apps.users.serializers.CustomTokenObtainPairSerializer',
}


# ─── Django Channels (WebSockets) ─────────────────────────────────────────────
# Channels uses Redis as a "channel layer" — a message bus that lets
# different WebSocket connections talk to each other.
# When patient A sends a message, it goes into Redis.
# Doctor B's WebSocket connection reads from Redis and delivers it.
# This is what makes real-time chat work across multiple connections.

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [config('REDIS_URL', default='redis://localhost:6379/0')],
        },
    },
}


# ─── Celery (background tasks — used on Day 3 for reminders) ──────────────────
# Celery uses Redis as its task queue broker.
# Tasks like "send appointment reminder at 8am" are put into Redis,
# and the Celery worker process picks them up and executes them.

CELERY_BROKER_URL    = config('REDIS_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = config('REDIS_URL', default='redis://localhost:6379/0')
CELERY_TIMEZONE      = 'Africa/Nairobi'