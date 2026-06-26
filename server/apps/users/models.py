import uuid
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    """
    Custom manager — tells Django how to create users and superusers
    """

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('An email address is required.')
        email = self.normalize_email(email)   # lowercases the domain part
        user  = self.model(email=email, **extra_fields)
        user.set_password(password)           # hashes the password
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'admin')
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    HealthPort's single user model — covers patients, doctors, and admins.

    AbstractBaseUser  → gives us password hashing, last_login, etc.
    PermissionsMixin  → gives us is_superuser, groups, user_permissions.
    """

    class Role(models.TextChoices):
        PATIENT = 'patient', 'Patient'
        DOCTOR  = 'doctor',  'Doctor'
        ADMIN   = 'admin',   'Admin'

    # ── Primary key ───────────────────────────────────────────────────────────
    # UUID instead of auto-incrementing integer.
    # Safe to expose in URLs — nobody can guess other user IDs.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ── Core identity ─────────────────────────────────────────────────────────
    email      = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=100)
    last_name  = models.CharField(max_length=100)
    phone      = models.CharField(max_length=20, blank=True)
    avatar     = models.ImageField(upload_to='avatars/', null=True, blank=True)

    # ── Role ──────────────────────────────────────────────────────────────────
    # This single field drives everything: navigation, permissions, profile type.
    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.PATIENT,
        db_index=True,
    )

    # ── Django required fields ────────────────────────────────────────────────
    is_active = models.BooleanField(default=True)   # False = account disabled
    is_staff  = models.BooleanField(default=False)  # True = can access /admin/

    # ── Timestamps ────────────────────────────────────────────────────────────
    date_joined = models.DateTimeField(auto_now_add=True)  # set once on creation
    updated_at  = models.DateTimeField(auto_now=True)      # updated on every save

    # ── Push notifications ────────────────────────────────────────────────────
    # The Expo push token is saved here when the user grants notification
    # permission on their phone. Celery tasks (Day 3) read this to send
    # appointment and medication reminders.
    push_token = models.CharField(max_length=255, blank=True)

    # ── Manager ───────────────────────────────────────────────────────────────
    objects = UserManager()

    # ── Auth config ───────────────────────────────────────────────────────────
    # These two lines tell Django: "use email as the login field"
    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name', 'role']

    class Meta:
        db_table = 'hp_users'      # actual PostgreSQL table name
        ordering = ['-date_joined']

    def __str__(self):
        return f'{self.full_name} <{self.email}> [{self.role}]'

    # ── Computed properties ───────────────────────────────────────────────────
    # These look like fields but are calculated on the fly — not stored in DB.

    @property
    def full_name(self) -> str:
        return f'{self.first_name} {self.last_name}'.strip()

    @property
    def is_doctor(self) -> bool:
        return self.role == self.Role.DOCTOR

    @property
    def is_patient(self) -> bool:
        return self.role == self.Role.PATIENT

    def get_avatar_url(self) -> str | None:
        """Returns the avatar URL safely, or None if no avatar is set."""
        try:
            return self.avatar.url if self.avatar else None
        except Exception:
            return None