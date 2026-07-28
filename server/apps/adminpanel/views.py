from datetime import timedelta

from django.utils import timezone
from rest_framework import generics, filters, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User
from apps.doctors.models import DoctorProfile
from apps.patients.models import PatientProfile, MedicalRecord, Medication, DosageLog
from apps.appointments.models import Appointment

from .permissions import IsAdminStaff
from .serializers import (
    AdminUserListSerializer,
    AdminUserDetailSerializer,
    AdminUserCreateSerializer,
    AdminDoctorSerializer,
    AdminPatientSerializer,
    AdminMedicalRecordSerializer,
    AdminMedicationSerializer,
    AdminDosageLogSerializer,
    AdminAppointmentSerializer,
)


# ─── 0. Dashboard stats ─────────────────────────────────────────────────────────

class AdminStatsView(APIView):
    """
    GET /api/v1/admin/stats/

    One call that feeds every number on the admin dashboard's overview
    cards — avoids the frontend firing off half a dozen separate count
    queries on page load.
    """
    permission_classes = [IsAdminStaff]

    def get(self, request):
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

        data = {
            'total_users':    User.objects.count(),
            'total_patients': User.objects.filter(role=User.Role.PATIENT).count(),
            'total_doctors':  User.objects.filter(role=User.Role.DOCTOR).count(),
            'pending_doctors': DoctorProfile.objects.filter(
                verification_status=DoctorProfile.VerificationStatus.PENDING
            ).count(),
            'verified_doctors': DoctorProfile.objects.filter(
                verification_status=DoctorProfile.VerificationStatus.VERIFIED
            ).count(),
            'rejected_doctors': DoctorProfile.objects.filter(
                verification_status=DoctorProfile.VerificationStatus.REJECTED
            ).count(),
            'active_users_today': User.objects.filter(last_seen__gte=today_start).count(),
            'total_appointments': Appointment.objects.count(),
            'pending_appointments': Appointment.objects.filter(
                status=Appointment.Status.PENDING
            ).count(),
            'upcoming_appointments': Appointment.objects.filter(
                appointment_date__gte=timezone.now().date(),
            ).exclude(status=Appointment.Status.CANCELLED).count(),
            'total_medical_records': MedicalRecord.objects.count(),
            'total_medications': Medication.objects.count(),
        }
        return Response(data)


# ─── 1. Users ──────────────────────────────────────────────────────────────────

class AdminUserListView(generics.ListCreateAPIView):
    """
    GET  /api/v1/admin/users/   list every user — search, filter by role/status
    POST /api/v1/admin/users/   create a user of any role (admin "Add user")

    Query params:
    - ?search=       name, email, phone
    - ?role=         patient | doctor | admin
    - ?is_active=    true | false
    """
    permission_classes = [IsAdminStaff]
    filter_backends     = [filters.SearchFilter]
    search_fields        = ['email', 'first_name', 'last_name', 'phone']

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return AdminUserCreateSerializer
        return AdminUserListSerializer

    def get_queryset(self):
        qs = User.objects.all()

        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')

        return qs


class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/v1/admin/users/<id>/   full detail
    PATCH  /api/v1/admin/users/<id>/   edit role, status, staff flag, etc.
    DELETE /api/v1/admin/users/<id>/   permanently remove the account

    An admin can't delete or deactivate their own account through here —
    that would be an easy way to accidentally lock yourself out.
    """
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminUserDetailSerializer
    queryset             = User.objects.all()

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('You cannot delete your own account.')
        instance.delete()

    def perform_update(self, serializer):
        # Guard against an admin locking themselves out by accident.
        if serializer.instance.pk == self.request.user.pk:
            if serializer.validated_data.get('is_active') is False:
                from rest_framework.exceptions import ValidationError
                raise ValidationError('You cannot deactivate your own account.')
            if serializer.validated_data.get('is_staff') is False:
                from rest_framework.exceptions import ValidationError
                raise ValidationError('You cannot remove your own admin access.')
        serializer.save()


# ─── 2. Doctors ────────────────────────────────────────────────────────────────

class AdminDoctorListView(generics.ListAPIView):
    """
    GET /api/v1/admin/doctors/

    Every doctor profile regardless of verification status — this is
    the queue an admin works from to approve or reject KMPDC numbers.
    Verifying/rejecting itself is done via the existing endpoint
    POST /api/v1/doctors/<id>/admin-verify/ (already admin-gated).

    Query params:
    - ?search=              name, email, kmpdc number, hospital
    - ?verification_status= pending | verified | rejected
    - ?specialty=
    """
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminDoctorSerializer
    filter_backends      = [filters.SearchFilter]
    search_fields         = [
        'user__first_name', 'user__last_name', 'user__email',
        'kmpdc_number', 'hospital_affiliation',
    ]

    def get_queryset(self):
        qs = DoctorProfile.objects.select_related('user').all()

        vstatus = self.request.query_params.get('verification_status')
        if vstatus:
            qs = qs.filter(verification_status=vstatus)

        specialty = self.request.query_params.get('specialty')
        if specialty:
            qs = qs.filter(specialty=specialty)

        return qs


class AdminDoctorDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/v1/admin/doctors/<id>/   full professional profile
    PATCH /api/v1/admin/doctors/<id>/   edit professional details

    Verification status is intentionally left out of the editable
    fields here — that stays on the dedicated verify/reject endpoint
    so the audit trail (verified_at, verification_note) is never
    bypassed by a plain field edit.
    """
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminDoctorSerializer
    queryset             = DoctorProfile.objects.select_related('user').all()


# ─── 3. Patients ───────────────────────────────────────────────────────────────

class AdminPatientListView(generics.ListAPIView):
    """
    GET /api/v1/admin/patients/

    Query params:
    - ?search=  name, email, national ID
    """
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminPatientSerializer
    filter_backends      = [filters.SearchFilter]
    search_fields         = [
        'user__first_name', 'user__last_name', 'user__email', 'national_id',
    ]
    queryset               = PatientProfile.objects.select_related('user').all()


class AdminPatientDetailView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/v1/admin/patients/<id>/
    PATCH /api/v1/admin/patients/<id>/
    """
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminPatientSerializer
    queryset             = PatientProfile.objects.select_related('user').all()


# ─── 4. Medical records ─────────────────────────────────────────────────────────

class AdminMedicalRecordListView(generics.ListAPIView):
    """
    GET /api/v1/admin/medical-records/

    Query params:
    - ?search=       title, patient name
    - ?record_type=
    - ?is_private=   true | false
    - ?patient=      filter to one patient's records (used by the
                      patient detail page)
    """
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminMedicalRecordSerializer
    filter_backends      = [filters.SearchFilter]
    search_fields         = [
        'title', 'patient__user__first_name', 'patient__user__last_name',
    ]

    def get_queryset(self):
        qs = MedicalRecord.objects.select_related('patient__user', 'doctor').all()

        record_type = self.request.query_params.get('record_type')
        if record_type:
            qs = qs.filter(record_type=record_type)

        is_private = self.request.query_params.get('is_private')
        if is_private is not None:
            qs = qs.filter(is_private=is_private.lower() == 'true')

        patient = self.request.query_params.get('patient')
        if patient:
            qs = qs.filter(patient_id=patient)

        return qs


class AdminMedicalRecordDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminMedicalRecordSerializer
    queryset             = MedicalRecord.objects.select_related('patient__user', 'doctor').all()


# ─── 5. Medications ────────────────────────────────────────────────────────────

class AdminMedicationListView(generics.ListAPIView):
    """
    GET /api/v1/admin/medications/

    Query params:
    - ?search=     name, patient name
    - ?is_active=  true | false
    - ?patient=    filter to one patient's medications
    """
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminMedicationSerializer
    filter_backends      = [filters.SearchFilter]
    search_fields         = ['name', 'patient__user__first_name', 'patient__user__last_name']

    def get_queryset(self):
        qs = Medication.objects.select_related('patient__user', 'prescribed_by').all()

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')

        patient = self.request.query_params.get('patient')
        if patient:
            qs = qs.filter(patient_id=patient)

        return qs


class AdminMedicationDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminMedicationSerializer
    queryset             = Medication.objects.select_related('patient__user', 'prescribed_by').all()


# ─── 6. Dosage logs ─────────────────────────────────────────────────────────────

class AdminDosageLogListView(generics.ListAPIView):
    """
    GET /api/v1/admin/dosage-logs/

    Read-heavy debugging view for the medication reminder system —
    mirrors DosageLogAdmin in apps/patients/admin.py. Query params:
    - ?status=    taken | missed | skipped
    - ?patient=
    """
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminDosageLogSerializer
    filter_backends      = [filters.SearchFilter]
    search_fields         = ['medication__name', 'medication__patient__user__first_name']

    def get_queryset(self):
        qs = DosageLog.objects.select_related('medication__patient__user').all()

        dstatus = self.request.query_params.get('status')
        if dstatus:
            qs = qs.filter(status=dstatus)

        patient = self.request.query_params.get('patient')
        if patient:
            qs = qs.filter(medication__patient_id=patient)

        return qs


class AdminDosageLogDetailView(generics.RetrieveDestroyAPIView):
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminDosageLogSerializer
    queryset             = DosageLog.objects.select_related('medication__patient__user').all()


# ─── 7. Appointments ────────────────────────────────────────────────────────────

class AdminAppointmentListView(generics.ListAPIView):
    """
    GET /api/v1/admin/appointments/

    Query params:
    - ?search=            patient/doctor name
    - ?status=            pending | confirmed | completed | cancelled
    - ?appointment_type=  virtual | in_person
    - ?date=              YYYY-MM-DD
    """
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminAppointmentSerializer
    filter_backends      = [filters.SearchFilter]
    search_fields         = [
        'patient__first_name', 'patient__last_name', 'patient__email',
        'doctor__first_name', 'doctor__last_name', 'doctor__email',
    ]

    def get_queryset(self):
        qs = Appointment.objects.select_related('patient', 'doctor').all()

        appt_status = self.request.query_params.get('status')
        if appt_status:
            qs = qs.filter(status=appt_status)

        appt_type = self.request.query_params.get('appointment_type')
        if appt_type:
            qs = qs.filter(appointment_type=appt_type)

        date = self.request.query_params.get('date')
        if date:
            qs = qs.filter(appointment_date=date)

        return qs


class AdminAppointmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/v1/admin/appointments/<id>/
    PATCH  /api/v1/admin/appointments/<id>/   admin override — can set
           any status without the normal patient/doctor transition
           rules, for fixing stuck or mistaken bookings.
    DELETE /api/v1/admin/appointments/<id>/
    """
    permission_classes = [IsAdminStaff]
    serializer_class    = AdminAppointmentSerializer
    queryset             = Appointment.objects.select_related('patient', 'doctor').all()