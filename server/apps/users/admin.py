from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """
    Custom admin for our User model.

    We extend BaseUserAdmin (Django's built-in) rather than starting
    from scratch so we keep all the secure password handling behaviour
    Django provides by default.
    """

    # ── List view ─────────────────────────────────────────────────────────────
    # These are the columns shown in the table at /admin/users/user/

    list_display  = ('email', 'full_name', 'role_badge', 'is_active', 'date_joined')
    list_filter   = ('role', 'is_active', 'is_staff')
    search_fields = ('email', 'first_name', 'last_name', 'phone')
    ordering      = ('-date_joined',)   # newest users at the top


    # ── Detail / edit view ────────────────────────────────────────────────────
    # fieldsets controls the layout of the form when you click on a user.
    # Each tuple is (section heading, { fields in that section }).

    readonly_fields = ('id', 'date_joined', 'updated_at')

    fieldsets = (
        # Section 1 — login credentials
        ('Account', {
            'fields': ('id', 'email', 'password')
        }),
        # Section 2 — personal details
        ('Personal info', {
            'fields': ('first_name', 'last_name', 'phone', 'avatar')
        }),
        # Section 3 — role and account status
        ('Role & status', {
            'fields': ('role', 'is_active', 'is_staff', 'is_superuser')
        }),
        # Section 4 — push token (read-only reference, set by the app)
        ('Notifications', {
            'fields': ('push_token',)
        }),
        # Section 5 — Django's built-in permissions system
        ('Permissions', {
            'fields': ('groups', 'user_permissions'),
            'classes': ('collapse',),   # hidden by default, click to expand
        }),
        # Section 6 — timestamps
        ('Timestamps', {
            'fields': ('date_joined', 'updated_at'),
        }),
    )

    # ── Add user form ─────────────────────────────────────────────────────────
    # add_fieldsets controls the form shown when you click "Add user" in admin.
    # Simpler than the edit form — just the minimum needed to create a user.

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': (
                'email', 'first_name', 'last_name',
                'role', 'password1', 'password2',
            ),
        }),
    )

    # ── Custom columns ────────────────────────────────────────────────────────
    # These methods define the custom columns we added to list_display above.

    def full_name(self, obj):
        return obj.full_name
    full_name.short_description = 'Name'

    def role_badge(self, obj):
        """
        Shows the role as a coloured label instead of plain text.
        Makes it easy to scan a list of users and spot doctors vs patients.

        format_html() is Django's safe way to render HTML in admin —
        it escapes any user-provided values so there's no XSS risk.
        """
        colours = {
            'patient': '#3b82f6',   # blue
            'doctor':  '#10b981',   # green
            'admin':   '#8b5cf6',   # purple
        }
        colour = colours.get(obj.role, '#6b7280')  # grey fallback

        return format_html(
            '<span style="color: {}; font-weight: 600; text-transform: capitalize;">{}</span>',
            colour,
            obj.role,
        )
    role_badge.short_description = 'Role'