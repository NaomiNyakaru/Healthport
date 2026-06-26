from django.contrib import admin
from .models import PatientProfile, MedicalRecord, Medication, DosageLog


# ─── 1. Patient profile ───────────────────────────────────────────────────────

@admin.register(PatientProfile)
class PatientProfileAdmin(admin.ModelAdmin):
    """
    Patient profiles — used for debugging and support.
    You can see a patient's blood group, allergies, and emergency contact here.
    """
    list_display   = ('patient_name', 'gender', 'blood_group', 'age', 'created_at')
    list_filter    = ('gender', 'blood_group')
    search_fields  = (
        'user__email',
        'user__first_name',
        'user__last_name',
        'national_id',
    )
    readonly_fields = ('created_at', 'updated_at')

    fieldsets = (
        ('Patient', {
            'fields': ('user',)
        }),
        ('Personal health', {
            'fields': (
                'date_of_birth', 'gender', 'blood_group', 'national_id',
                'allergies', 'chronic_conditions',
            )
        }),
        ('Emergency contact', {
            'fields': ('emergency_contact_name', 'emergency_contact_phone')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    def patient_name(self, obj):
        return obj.user.full_name
    patient_name.short_description = 'Patient'

    def age(self, obj):
        return obj.age    # uses the @property from the model
    age.short_description = 'Age'


# ─── 2. Medical records ───────────────────────────────────────────────────────

@admin.register(MedicalRecord)
class MedicalRecordAdmin(admin.ModelAdmin):
    """
    Medical records — useful for verifying records were saved correctly
    and checking what doctors have written for patients.
    """
    list_display   = (
        'title', 'record_type', 'patient_name',
        'doctor_name', 'date_of_record', 'is_private',
    )
    list_filter    = ('record_type', 'is_private')
    search_fields  = (
        'title',
        'patient__user__first_name',
        'patient__user__last_name',
        'patient__user__email',
    )
    readonly_fields = ('id', 'created_at', 'updated_at')
    date_hierarchy  = 'date_of_record'   # adds a date drill-down at the top

    fieldsets = (
        ('Record', {
            'fields': ('id', 'record_type', 'title', 'description', 'date_of_record')
        }),
        ('Parties', {
            'fields': ('patient', 'doctor')
        }),
        ('Options', {
            'fields': ('attachment', 'is_private')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    def patient_name(self, obj):
        return obj.patient.user.full_name
    patient_name.short_description = 'Patient'

    def doctor_name(self, obj):
        if obj.doctor:
            return obj.doctor.full_name
        return '—'   # em dash for "no doctor" — patient self-reported
    doctor_name.short_description = 'Doctor'


# ─── 3. Medications ──────────────────────────────────────────────────────────

@admin.register(Medication)
class MedicationAdmin(admin.ModelAdmin):
    """
    Medications — check what drugs patients are logged as taking
    and whether they are still active.
    """
    list_display  = (
        'name', 'dosage', 'patient_name',
        'frequency_display', 'is_active', 'start_date',
    )
    list_filter   = ('is_active', 'frequency_unit')
    search_fields = (
        'name',
        'patient__user__first_name',
        'patient__user__last_name',
        'patient__user__email',
    )
    readonly_fields = ('id', 'created_at')
    date_hierarchy  = 'start_date'

    fieldsets = (
        ('Medication', {
            'fields': ('id', 'name', 'dosage', 'instructions')
        }),
        ('Schedule', {
            'fields': (
                'frequency', 'frequency_unit',
                'start_date', 'end_date', 'is_active',
            )
        }),
        ('Parties', {
            'fields': ('patient', 'prescribed_by')
        }),
        ('Timestamps', {
            'fields': ('created_at',),
            'classes': ('collapse',),
        }),
    )

    def patient_name(self, obj):
        return obj.patient.user.full_name
    patient_name.short_description = 'Patient'

    def frequency_display(self, obj):
        """Shows frequency in a readable format e.g. '3× daily'."""
        if obj.frequency_unit == 'daily':
            return f'{obj.frequency}× daily'
        return f'every {obj.frequency}h'
    frequency_display.short_description = 'Frequency'


# ─── 4. Dosage logs ───────────────────────────────────────────────────────────

@admin.register(DosageLog)
class DosageLogAdmin(admin.ModelAdmin):
    """
    Dosage logs — the full history of every dose event.
    Useful for checking if reminders are working correctly on Day 3.
    """
    list_display  = (
        'medication_name', 'patient_name',
        'status_badge', 'scheduled_time', 'taken_at',
    )
    list_filter   = ('status',)
    search_fields = (
        'medication__name',
        'medication__patient__user__first_name',
        'medication__patient__user__last_name',
    )
    readonly_fields = ('id', 'created_at')
    date_hierarchy  = 'scheduled_time'

    def medication_name(self, obj):
        return obj.medication.name
    medication_name.short_description = 'Medication'

    def patient_name(self, obj):
        return obj.medication.patient.user.full_name
    patient_name.short_description = 'Patient'

    def status_badge(self, obj):
        """Colour-coded status so you can spot missed doses at a glance."""
        from django.utils.html import format_html
        colours = {
            'taken':   ('#065f46', '#d1fae5'),   # green
            'missed':  ('#991b1b', '#fee2e2'),   # red
            'skipped': ('#92400e', '#fef3c7'),   # amber
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