from django.contrib import admin
from django.utils.html import format_html
from .models import Appointment


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    """
    Admin for appointments.
    Most useful for monitoring activity and debugging booking issues.
    """

    # ── List view ─────────────────────────────────────────────────────────────
    list_display = (
        'patient_name',
        'doctor_name',
        'appointment_date',
        'appointment_time',
        'appointment_type',
        'status_badge',
        'created_at',
    )
    list_filter  = ('status', 'appointment_type', 'appointment_date')
    search_fields = (
        'patient__first_name',
        'patient__last_name',
        'patient__email',
        'doctor__first_name',
        'doctor__last_name',
        'doctor__email',
    )
    ordering      = ('appointment_date', 'appointment_time')
    readonly_fields = (
        'id', 'created_at', 'updated_at',
        'reminder_24h_sent', 'reminder_1h_sent',
    )

    # Date drill-down navigation at the top of the list
    date_hierarchy = 'appointment_date'

    # ── Detail view ───────────────────────────────────────────────────────────
    fieldsets = (
        ('Appointment', {
            'fields': ('id', 'appointment_type', 'status')
        }),
        ('Parties', {
            'fields': ('patient', 'doctor')
        }),
        ('Schedule', {
            'fields': (
                'appointment_date',
                'appointment_time',
                'duration_minutes',
            )
        }),
        ('Content', {
            'fields': ('reason', 'notes')
        }),
        ('Cancellation', {
            'fields': (
                'cancelled_by',
                'cancellation_reason',
            ),
            'classes': ('collapse',),
        }),
        ('Reminders', {
            'fields': ('reminder_24h_sent', 'reminder_1h_sent'),
            'classes': ('collapse',),
            'description': (
                'These are set automatically by Celery tasks on Day 3. '
                'Reset to False to re-send a reminder manually.'
            ),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    # ── Custom columns ────────────────────────────────────────────────────────

    def patient_name(self, obj):
        return obj.patient.full_name
    patient_name.short_description = 'Patient'

    def doctor_name(self, obj):
        return f'Dr. {obj.doctor.full_name}'
    doctor_name.short_description = 'Doctor'

    def status_badge(self, obj):
        """Colour-coded status badge — easy to scan the list."""
        colours = {
            'pending':   ('#92400e', '#fef3c7'),   # amber
            'confirmed': ('#1e40af', '#dbeafe'),   # blue
            'completed': ('#065f46', '#d1fae5'),   # green
            'cancelled': ('#991b1b', '#fee2e2'),   # red
        }
        text_colour, bg_colour = colours.get(
            obj.status, ('#374151', '#f3f4f6')
        )
        return format_html(
            '<span style="'
            'color: {}; background: {}; '
            'padding: 2px 10px; border-radius: 99px; '
            'font-size: 12px; font-weight: 600;'
            '">{}</span>',
            text_colour,
            bg_colour,
            obj.get_status_display(),
        )
    status_badge.short_description = 'Status'