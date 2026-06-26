from django.shortcuts import get_object_or_404
from rest_framework import generics, status, permissions
from rest_framework.response import Response

from .models import PatientProfile, MedicalRecord, Medication, DosageLog
from .serializers import (
    PatientProfileSerializer,
    MedicalRecordSerializer,
    MedicationSerializer,
    DosageLogSerializer,
)
from apps.users.permissions import IsPatient, IsVerifiedDoctor


# ─── Shared permission ────────────────────────────────────────────────────────

class IsPatientOrVerifiedDoctor(permissions.BasePermission):
    """
    Used on endpoints that both patients and verified doctors can reach
    but for different reasons:
    - Patient → accessing their own data
    - Verified doctor → accessing a patient's data during consultation

    Object-level ownership is enforced separately in get_queryset()
    and get_object() in each view below.
    """
    message = 'Only patients or verified doctors can perform this action.'

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_patient:
            return True
        if request.user.is_doctor:
            try:
                return request.user.doctor_profile.is_verified
            except Exception:
                return False
        return False


# ═══════════════════════════════════════════════════════════════════════════════
# PATIENT PROFILE
# ═══════════════════════════════════════════════════════════════════════════════

class MyPatientProfileView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/v1/patients/me/    → patient views their own profile
    PATCH /api/v1/patients/me/    → patient updates their profile

    Who can call it: patients only.

    get_or_create ensures a profile exists even if the signal
    didn't fire during registration — no crash, just a blank profile.
    """
    serializer_class   = PatientProfileSerializer
    permission_classes = [IsPatient]
    http_method_names  = ['get', 'patch', 'head', 'options']

    def get_object(self):
        profile, _ = PatientProfile.objects.get_or_create(
            user=self.request.user
        )
        return profile


class PatientProfileForDoctorView(generics.RetrieveAPIView):
    """
    GET /api/v1/patients/<patient_id>/profile/

    A verified doctor views a specific patient's full profile.
    Used when the doctor opens a patient's file during a consultation.

    Who can call it: verified doctors only.
    """
    serializer_class   = PatientProfileSerializer
    permission_classes = [IsVerifiedDoctor]

    def get_object(self):
        # Look up by user UUID (patient_id in the URL)
        return get_object_or_404(
            PatientProfile,
            user__id=self.kwargs['patient_id'],
        )


# ═══════════════════════════════════════════════════════════════════════════════
# MEDICAL RECORDS
# ═══════════════════════════════════════════════════════════════════════════════

class MedicalRecordListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/patients/me/records/    → patient lists their records
    POST /api/v1/patients/me/records/    → patient adds a new record

    Who can call it: patients only.

    Records are ordered by date_of_record descending (most recent first)
    as set in the model's Meta class.
    """
    serializer_class   = MedicalRecordSerializer
    permission_classes = [IsPatient]

    def get_queryset(self):
        profile = get_object_or_404(PatientProfile, user=self.request.user)
        return MedicalRecord.objects.filter(
            patient=profile
        ).select_related('doctor')
        # select_related('doctor') fetches the doctor's User row in the
        # same query so doctor_name doesn't cause an extra DB hit

    def perform_create(self, serializer):
        # Attach the patient profile before saving
        profile = get_object_or_404(PatientProfile, user=self.request.user)
        # context={'request': request} is passed automatically by
        # generics.ListCreateAPIView — the serializer uses it to
        # auto-tag the doctor if the creator is a doctor
        serializer.save(patient=profile)


class MedicalRecordDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/v1/patients/me/records/<id>/  → view a specific record
    PATCH  /api/v1/patients/me/records/<id>/  → update a record
    DELETE /api/v1/patients/me/records/<id>/  → delete a record

    Who can call it: patients only (their own records).

    get_queryset() already filters by patient so a patient can never
    accidentally access or delete another patient's records.
    """
    serializer_class   = MedicalRecordSerializer
    permission_classes = [IsPatient]
    http_method_names  = ['get', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        profile = get_object_or_404(PatientProfile, user=self.request.user)
        return MedicalRecord.objects.filter(patient=profile)


class PatientRecordsForDoctorView(generics.ListAPIView):
    """
    GET /api/v1/patients/<patient_id>/records/

    A verified doctor views a patient's medical history.
    Only returns non-private records (is_private=False).
    Private records are hidden from doctors — only the patient can see those.

    Who can call it: verified doctors only.
    """
    serializer_class   = MedicalRecordSerializer
    permission_classes = [IsVerifiedDoctor]

    def get_queryset(self):
        profile = get_object_or_404(
            PatientProfile,
            user__id=self.kwargs['patient_id'],
        )
        return MedicalRecord.objects.filter(
            patient=profile,
            is_private=False,    # ← doctors cannot see private records
        ).select_related('doctor')


# ═══════════════════════════════════════════════════════════════════════════════
# MEDICATIONS
# ═══════════════════════════════════════════════════════════════════════════════

class MedicationListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/patients/me/medications/    → list medications
    POST /api/v1/patients/me/medications/    → add a medication

    Who can call it: patients only.

    Optional query param:
    ?active=true → returns only medications where is_active=True
    Useful for the home screen which shows only current medications.
    """
    serializer_class   = MedicationSerializer
    permission_classes = [IsPatient]

    def get_queryset(self):
        profile = get_object_or_404(PatientProfile, user=self.request.user)
        qs = Medication.objects.filter(
            patient=profile
        ).select_related('prescribed_by')

        # Filter to active only if requested
        if self.request.query_params.get('active') == 'true':
            qs = qs.filter(is_active=True)

        return qs

    def perform_create(self, serializer):
        profile = get_object_or_404(PatientProfile, user=self.request.user)
        serializer.save(patient=profile)


class MedicationDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/v1/patients/me/medications/<id>/
    PATCH  /api/v1/patients/me/medications/<id>/
    DELETE /api/v1/patients/me/medications/<id>/

    Who can call it: patients only (their own medications).
    """
    serializer_class   = MedicationSerializer
    permission_classes = [IsPatient]
    http_method_names  = ['get', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        profile = get_object_or_404(PatientProfile, user=self.request.user)
        return Medication.objects.filter(patient=profile)


# ═══════════════════════════════════════════════════════════════════════════════
# DOSAGE LOGS
# ═══════════════════════════════════════════════════════════════════════════════

class DosageLogListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/patients/me/dosage-logs/    → view dose history
    POST /api/v1/patients/me/dosage-logs/    → log a dose event

    Who can call it: patients only.

    Optional query param:
    ?medication=<uuid> → filter logs for a specific medication

    The serializer's validate_medication() already ensures the
    medication belongs to this patient — we don't need to
    repeat that check here.
    """
    serializer_class   = DosageLogSerializer
    permission_classes = [IsPatient]

    def get_queryset(self):
        profile = get_object_or_404(PatientProfile, user=self.request.user)
        qs = DosageLog.objects.filter(
            medication__patient=profile
        ).select_related('medication')

        # Optional filter by medication
        medication_id = self.request.query_params.get('medication')
        if medication_id:
            qs = qs.filter(medication__id=medication_id)

        return qs