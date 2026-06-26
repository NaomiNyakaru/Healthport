from django.urls import path
from .views import (
    MyPatientProfileView,
    PatientProfileForDoctorView,
    MedicalRecordListCreateView,
    MedicalRecordDetailView,
    PatientRecordsForDoctorView,
    MedicationListCreateView,
    MedicationDetailView,
    DosageLogListCreateView,
)

urlpatterns = [

    # ── Patient's own profile ─────────────────────────────────────────────────
    # Full URL: GET   /api/v1/patients/me/
    # Full URL: PATCH /api/v1/patients/me/
    path(
        'me/',
        MyPatientProfileView.as_view(),
        name='patient-me',
    ),


    # ── Patient's own medical records ─────────────────────────────────────────
    # Full URL: GET  /api/v1/patients/me/records/
    # Full URL: POST /api/v1/patients/me/records/
    path(
        'me/records/',
        MedicalRecordListCreateView.as_view(),
        name='patient-records',
    ),

    # Full URL: GET    /api/v1/patients/me/records/<uuid>/
    # Full URL: PATCH  /api/v1/patients/me/records/<uuid>/
    # Full URL: DELETE /api/v1/patients/me/records/<uuid>/
    # <uuid:pk> matches a UUID and passes it to the view as pk
    path(
        'me/records/<uuid:pk>/',
        MedicalRecordDetailView.as_view(),
        name='patient-record-detail',
    ),


    # ── Patient's own medications ─────────────────────────────────────────────
    # Full URL: GET  /api/v1/patients/me/medications/
    # Full URL: GET  /api/v1/patients/me/medications/?active=true
    # Full URL: POST /api/v1/patients/me/medications/
    path(
        'me/medications/',
        MedicationListCreateView.as_view(),
        name='patient-medications',
    ),

    # Full URL: GET    /api/v1/patients/me/medications/<uuid>/
    # Full URL: PATCH  /api/v1/patients/me/medications/<uuid>/
    # Full URL: DELETE /api/v1/patients/me/medications/<uuid>/
    path(
        'me/medications/<uuid:pk>/',
        MedicationDetailView.as_view(),
        name='patient-medication-detail',
    ),


    # ── Dosage logs ───────────────────────────────────────────────────────────
    # Full URL: GET  /api/v1/patients/me/dosage-logs/
    # Full URL: GET  /api/v1/patients/me/dosage-logs/?medication=<uuid>
    # Full URL: POST /api/v1/patients/me/dosage-logs/
    path(
        'me/dosage-logs/',
        DosageLogListCreateView.as_view(),
        name='patient-dosage-logs',
    ),


    # ── Doctor views a specific patient ───────────────────────────────────────
    # These URLs are called by a verified doctor, not the patient themselves.
    # <uuid:patient_id> captures the patient's User UUID from the URL.
    #
    # Full URL: GET /api/v1/patients/<uuid>/profile/
    path(
        '<uuid:patient_id>/profile/',
        PatientProfileForDoctorView.as_view(),
        name='patient-profile-for-doctor',
    ),

    # Full URL: GET /api/v1/patients/<uuid>/records/
    # Only returns non-private records — private records are hidden from doctors.
    path(
        '<uuid:patient_id>/records/',
        PatientRecordsForDoctorView.as_view(),
        name='patient-records-for-doctor',
    ),
]