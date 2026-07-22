from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, permissions
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .models import PatientProfile, MedicalRecord, RecordAttachment, Medication, DosageLog
from .serializers import (
    PatientProfileSerializer,
    MedicalRecordSerializer,
    RecordAttachmentSerializer,
    MedicationSerializer,
    DosageLogSerializer,
)
from apps.users.permissions import IsPatient, IsVerifiedDoctor, IsOwnerOrVerifiedDoctor


def get_accessible_record(user, record_id):
    """
    Fetch a MedicalRecord the given user is allowed to see, or raise Http404.

    - A patient can only reach records that belong to them.
    - A doctor can reach any record they're allowed to see - i.e. not
      marked private by a *different* doctor (mirrors the is_private
      filtering already used in PatientRecordsForDoctorView.get_queryset).

    Shared by the attachment views below so upload/list/delete all agree
    on who can touch a record's files.
    """
    record = get_object_or_404(MedicalRecord, pk=record_id)

    if getattr(user, 'is_patient', False):
        if record.patient.user_id != user.id:
            raise Http404
    elif getattr(user, 'is_doctor', False):
        if record.is_private and record.doctor_id != user.id:
            raise Http404
    else:
        raise Http404

    return record


# ─── Shared permission ────────────────────────────────────────────────────────

# class IsPatientOrVerifiedDoctor(permissions.BasePermission):
#     """
#     Used on endpoints that both patients and verified doctors can reach
#     but for different reasons:
#     - Patient → accessing their own data
#     - Verified doctor → accessing a patient's data during consultation

#     Object-level ownership is enforced separately in get_queryset()
#     and get_object() in each view below.
#     """
#     message = 'Only patients or verified doctors can perform this action.'

#     def has_permission(self, request, view):
#         if not (request.user and request.user.is_authenticated):
#             return False
#         if request.user.is_patient:
#             return True
#         if request.user.is_doctor:
#             try:
#                 return request.user.doctor_profile.is_verified
#             except Exception:
#                 return False
#         return False


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

class MedicalRecordListView(generics.ListAPIView):
    """
    GET /api/v1/patients/me/records/    → patient views their own records

    Who can call it: patients only. Read-only — a patient never creates
    or edits their own medical records. Only a verified doctor can log a
    record, via PatientRecordsForDoctorView below
    (/patients/<patient_id>/records/), typically right after an appointment.

    Records are ordered by date_of_record descending (most recent first)
    as set in the model's Meta class.
    """
    serializer_class   = MedicalRecordSerializer
    permission_classes = [IsPatient]

    def get_queryset(self):
        profile = get_object_or_404(PatientProfile, user=self.request.user)
        qs = MedicalRecord.objects.filter(
            patient=profile
        ).select_related('doctor').prefetch_related('attachments__uploaded_by')
        # NOTE: no is_private filter here — a patient sees ALL of their
        # own records. Only the doctor-facing view below filters out
        # records the doctor marked private.

        record_type = self.request.query_params.get('record_type')
        if record_type:
            qs = qs.filter(record_type=record_type)

        return qs


class MedicalRecordDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/patients/me/records/<id>/  → view a specific record

    Who can call it: patients only (their own records), read-only.
    """
    serializer_class   = MedicalRecordSerializer
    permission_classes = [IsPatient]
    http_method_names  = ['get', 'head', 'options']

    def get_queryset(self):
        profile = get_object_or_404(PatientProfile, user=self.request.user)
        return MedicalRecord.objects.filter(patient=profile)


class PatientRecordsForDoctorView(generics.ListCreateAPIView):
    """
    GET  /api/v1/patients/<patient_id>/records/  → doctor views history
    POST /api/v1/patients/<patient_id>/records/  → doctor logs a new record
                                                     for this patient
                                                     (e.g. right after an
                                                     appointment)

    This is the ONLY place medical records get created. Patients cannot
    create their own — MedicalRecordListView (me/records/) is read-only.

    <patient_id> comes from the URL — the doctor never needs to
    pass patient_id in the request body.

    GET only returns records the doctor hasn't marked private
    (is_private=False). A record marked private is still fully visible
    to the patient it belongs to — it's just hidden from other doctors
    browsing this patient's file.

    Records created here are immediately visible to the patient because
    MedicalRecordListView.get_queryset() (the patient's own "me/records/"
    endpoint) filters only on patient=profile, with no is_private exclusion.

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
            is_private=False,
        ).select_related('doctor').prefetch_related('attachments__uploaded_by')

    def perform_create(self, serializer):
        profile = get_object_or_404(
            PatientProfile,
            user__id=self.kwargs['patient_id'],
        )
        # Doctor-created records are never private by default. If the
        # client tries to pass is_private=True, we still honor it (a
        # doctor may want to hide from other doctors) — but a doctor can
        # never accidentally create a record the patient itself can't see.
        serializer.save(patient=profile, doctor=self.request.user, is_private=False)


class RecordAttachmentListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/patients/records/<record_id>/attachments/
    POST /api/v1/patients/records/<record_id>/attachments/

    Lists or uploads files attached to a single medical record.

    POST accepts one or more files under the 'files' key
    (multipart/form-data) — each file becomes its own RecordAttachment,
    so one consultation can carry a lab result, a referral letter, and a
    photo of a scan as separate downloadable files.

    Who can call it:
    - GET: the patient who owns the record, or any doctor who can see
      the record (per get_accessible_record).
    - POST: verified doctors only — patients don't author records or
      their attachments, matching how MedicalRecord creation already works.
    """
    serializer_class   = RecordAttachmentSerializer
    permission_classes = [IsOwnerOrVerifiedDoctor]

    MAX_FILES_PER_UPLOAD = 5

    def get_queryset(self):
        record = get_accessible_record(self.request.user, self.kwargs['record_id'])
        return record.attachments.select_related('uploaded_by')

    def create(self, request, *args, **kwargs):
        if not request.user.is_doctor:
            raise PermissionDenied('Only doctors can add attachments to a record.')

        record = get_accessible_record(request.user, self.kwargs['record_id'])
        files  = request.FILES.getlist('files')

        if not files:
            return Response(
                {'files': ['No files were submitted.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(files) > self.MAX_FILES_PER_UPLOAD:
            return Response(
                {'files': [f'You can upload at most {self.MAX_FILES_PER_UPLOAD} files at once.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created, errors = [], []
        for f in files:
            serializer = self.get_serializer(data={'file': f})
            if serializer.is_valid():
                serializer.save(
                    record=record,
                    uploaded_by=request.user,
                    original_filename=f.name,
                    content_type=f.content_type or '',
                    size_bytes=f.size,
                )
                created.append(serializer.data)
            else:
                errors.append({'filename': f.name, 'errors': serializer.errors})

        if errors and not created:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)

        payload = {'attachments': created}
        if errors:
            payload['errors'] = errors
        return Response(payload, status=status.HTTP_201_CREATED)


class RecordAttachmentDetailView(generics.RetrieveDestroyAPIView):
    """
    GET    /api/v1/patients/records/<record_id>/attachments/<id>/
    DELETE /api/v1/patients/records/<record_id>/attachments/<id>/

    Only the doctor who uploaded a given attachment can delete it — e.g.
    to remove a file they added by mistake. Deleting removes the DB row
    and the underlying file from storage.
    """
    serializer_class   = RecordAttachmentSerializer
    permission_classes = [IsOwnerOrVerifiedDoctor]
    http_method_names  = ['get', 'delete', 'head', 'options']

    def get_queryset(self):
        record = get_accessible_record(self.request.user, self.kwargs['record_id'])
        return record.attachments.select_related('uploaded_by')

    def perform_destroy(self, instance):
        if instance.uploaded_by_id != self.request.user.id:
            raise PermissionDenied('You can only delete attachments you uploaded.')
        instance.file.delete(save=False)
        instance.delete()


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

class PatientMedicationsForDoctorView(generics.ListCreateAPIView):
    """
    GET  /api/v1/patients/<patient_id>/medications/  → doctor views history
    POST /api/v1/patients/<patient_id>/medications/  → doctor prescribes a
                                                         new medication for
                                                         this patient

    <patient_id> comes from the URL — the doctor never needs to pass
    patient_id in the request body.

    Medications created here are tagged with prescribed_by = the
    requesting doctor, and are immediately visible to the patient
    because MedicationListCreateView (me/medications/) filters only
    on patient=profile.

    Who can call it: verified doctors only.
    """
    serializer_class   = MedicationSerializer
    permission_classes = [IsVerifiedDoctor]

    def get_queryset(self):
        profile = get_object_or_404(PatientProfile, user__id=self.kwargs['patient_id'])
        return Medication.objects.filter(patient=profile).select_related('prescribed_by')

    def perform_create(self, serializer):
        profile = get_object_or_404(PatientProfile, user__id=self.kwargs['patient_id'])
        serializer.save(patient=profile, prescribed_by=self.request.user)


class PatientDosageLogsForDoctorView(generics.ListCreateAPIView):
    """
    GET  /api/v1/patients/<patient_id>/dosage-logs/  → doctor views dose history
    POST /api/v1/patients/<patient_id>/dosage-logs/  → doctor logs a dose event
                                                         for this patient (e.g.
                                                         a dose given in-clinic)

    Optional query param:
    ?medication=<uuid> → filter logs for a specific medication, same as the
    patient-facing endpoint.

    Who can call it: verified doctors only.

    Safety check in perform_create(): the medication in the request body
    must actually belong to <patient_id> from the URL — otherwise a doctor
    could log a dose against a different patient's medication by guessing
    a UUID. DosageLogSerializer.validate_medication() only enforces
    ownership for patient requests, so we check it here instead.
    """
    serializer_class   = DosageLogSerializer
    permission_classes = [IsVerifiedDoctor]

    def get_queryset(self):
        profile = get_object_or_404(PatientProfile, user__id=self.kwargs['patient_id'])
        qs = DosageLog.objects.filter(
            medication__patient=profile
        ).select_related('medication')

        medication_id = self.request.query_params.get('medication')
        if medication_id:
            qs = qs.filter(medication__id=medication_id)

        return qs

    def perform_create(self, serializer):
        profile = get_object_or_404(PatientProfile, user__id=self.kwargs['patient_id'])
        medication = serializer.validated_data.get('medication')
        if medication.patient_id != profile.id:
            raise PermissionDenied('This medication does not belong to this patient.')
        serializer.save()