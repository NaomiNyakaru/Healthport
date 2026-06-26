from django.contrib import admin
from django.utils.html import format_html
from .models import DoctorProfile


@admin.register(DoctorProfile)
class DoctorProfileAdmin(admin.ModelAdmin):
    """
    Admin configuration for DoctorProfile.

    The most important use of this panel is verifying doctors —
    checking their KMPDC number and approving or rejecting their account.
    """

    # ── List view ─────────────────────────────────────────────────────────────
    # Columns shown in the table at /admin/doctors/doctorprofile/

    list_display = (
        'doctor_name',
        'kmpdc_number',
        'specialty',
        'verification_badge',
        'is_accepting_patients',
        'created_at',
    )
    list_filter   = ('verification_status', 'specialty', 'is_accepting_patients')
    search_fields = (
        'user__email',
        'user__first_name',
        'user__last_name',
        'kmpdc_number',
        'hospital_affiliation',
    )
    ordering      = ('-created_at',)   # newest registrations at the top
    readonly_fields = ('verified_at', 'created_at', 'updated_at', 'average_rating', 'total_reviews')

    # ── Detail / edit view ────────────────────────────────────────────────────
    # Sections shown when you click on a doctor

    fieldsets = (
        # Section 1 — who is this doctor
        ('Doctor', {
            'fields': ('user',)
        }),
        # Section 2 — KMPDC verification — this is where you take action
        ('KMPDC Verification', {
            'fields': (
                'kmpdc_number',
                'verification_status',
                'verification_note',
                'verified_at',
            ),
            'description': (
                'To verify: check the KMPDC number at https://kmpdc.go.ke, '
                'then use the bulk actions below or change verification_status manually.'
            ),
        }),
        # Section 3 — professional details
        ('Professional Details', {
            'fields': (
                'specialty',
                'years_of_experience',
                'bio',
                'hospital_affiliation',
                'consultation_fee',
            )
        }),
        # Section 4 — availability
        ('Availability & Rating', {
            'fields': (
                'is_accepting_patients',
                'average_rating',
                'total_reviews',
            )
        }),
        # Section 5 — timestamps
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),   # hidden by default
        }),
    )

    # ── Bulk actions ──────────────────────────────────────────────────────────
    # These appear in the "Action" dropdown above the list.
    # Select multiple doctors, pick an action, click Go.

    actions = ['verify_doctors', 'reject_doctors']

    @admin.action(description='✅  Verify selected doctors (KMPDC confirmed)')
    def verify_doctors(self, request, queryset):
        """
        Approve all selected doctors in one go.
        Calls profile.verify() on each one which sets verified_at timestamp.
        """
        count = 0
        for profile in queryset:
            if profile.verification_status != DoctorProfile.VerificationStatus.VERIFIED:
                profile.verify(note='Approved via admin bulk action.')
                count += 1
        self.message_user(
            request,
            f'{count} doctor(s) successfully verified.',
        )

    @admin.action(description='❌  Reject selected doctors (KMPDC not confirmed)')
    def reject_doctors(self, request, queryset):
        """
        Reject all selected doctors in one go.
        """
        count = 0
        for profile in queryset:
            if profile.verification_status != DoctorProfile.VerificationStatus.REJECTED:
                profile.reject(note='Rejected via admin bulk action.')
                count += 1
        self.message_user(
            request,
            f'{count} doctor(s) rejected.',
        )

    # ── Custom columns ────────────────────────────────────────────────────────

    def doctor_name(self, obj):
        """Shows the doctor's full name in the list — pulled from the User model."""
        return obj.user.full_name
    doctor_name.short_description = 'Doctor'

    def verification_badge(self, obj):
        """
        Shows verification status as a coloured label so you can instantly
        see which doctors need attention (amber = pending).
        """
        colours = {
            'pending':  ('#92400e', '#fef3c7'),   # amber text, amber background
            'verified': ('#065f46', '#d1fae5'),   # green text, green background
            'rejected': ('#991b1b', '#fee2e2'),   # red text, red background
        }
        text_colour, bg_colour = colours.get(
            obj.verification_status, ('#374151', '#f3f4f6')
        )
        return format_html(
            '<span style="'
            'color: {}; background: {}; '
            'padding: 2px 10px; border-radius: 99px; '
            'font-size: 12px; font-weight: 600;'
            '">{}</span>',
            text_colour,
            bg_colour,
            obj.get_verification_status_display(),
        )
    verification_badge.short_description = 'Status'