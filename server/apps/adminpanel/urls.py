from django.urls import path

from .views import (
    AdminStatsView,
    AdminUserListView,
    AdminUserDetailView,
    AdminDoctorListView,
    AdminDoctorDetailView,
    AdminPatientListView,
    AdminPatientDetailView,
    AdminMedicalRecordListView,
    AdminMedicalRecordDetailView,
    AdminMedicationListView,
    AdminMedicationDetailView,
    AdminDosageLogListView,
    AdminDosageLogDetailView,
    AdminAppointmentListView,
    AdminAppointmentDetailView,
)

app_name = 'adminpanel'

urlpatterns = [

    # ── Dashboard ─────────────────────────────────────────────────────────────
    # Full URL: GET /api/v1/admin/stats/
    path('stats/', AdminStatsView.as_view(), name='admin-stats'),

    # ── Users ─────────────────────────────────────────────────────────────────
    # Full URL: GET/POST /api/v1/admin/users/
    path('users/',        AdminUserListView.as_view(),   name='admin-user-list'),
    # Full URL: GET/PATCH/DELETE /api/v1/admin/users/<uuid>/
    path('users/<uuid:pk>/', AdminUserDetailView.as_view(), name='admin-user-detail'),

    # ── Doctors ───────────────────────────────────────────────────────────────
    # Full URL: GET /api/v1/admin/doctors/
    path('doctors/',        AdminDoctorListView.as_view(),   name='admin-doctor-list'),
    # Full URL: GET/PATCH /api/v1/admin/doctors/<int>/
    path('doctors/<int:pk>/', AdminDoctorDetailView.as_view(), name='admin-doctor-detail'),

    # ── Patients ──────────────────────────────────────────────────────────────
    # Full URL: GET /api/v1/admin/patients/
    path('patients/',        AdminPatientListView.as_view(),   name='admin-patient-list'),
    # Full URL: GET/PATCH /api/v1/admin/patients/<int>/
    path('patients/<int:pk>/', AdminPatientDetailView.as_view(), name='admin-patient-detail'),

    # ── Medical records ───────────────────────────────────────────────────────
    # Full URL: GET /api/v1/admin/medical-records/
    path('medical-records/',        AdminMedicalRecordListView.as_view(),   name='admin-record-list'),
    # Full URL: GET/PATCH/DELETE /api/v1/admin/medical-records/<uuid>/
    path('medical-records/<uuid:pk>/', AdminMedicalRecordDetailView.as_view(), name='admin-record-detail'),

    # ── Medications ───────────────────────────────────────────────────────────
    # Full URL: GET /api/v1/admin/medications/
    path('medications/',        AdminMedicationListView.as_view(),   name='admin-medication-list'),
    # Full URL: GET/PATCH/DELETE /api/v1/admin/medications/<uuid>/
    path('medications/<uuid:pk>/', AdminMedicationDetailView.as_view(), name='admin-medication-detail'),

    # ── Dosage logs ───────────────────────────────────────────────────────────
    # Full URL: GET /api/v1/admin/dosage-logs/
    path('dosage-logs/',        AdminDosageLogListView.as_view(),   name='admin-dosage-list'),
    # Full URL: GET/DELETE /api/v1/admin/dosage-logs/<uuid>/
    path('dosage-logs/<uuid:pk>/', AdminDosageLogDetailView.as_view(), name='admin-dosage-detail'),

    # ── Appointments ──────────────────────────────────────────────────────────
    # Full URL: GET /api/v1/admin/appointments/
    path('appointments/',        AdminAppointmentListView.as_view(),   name='admin-appointment-list'),
    # Full URL: GET/PATCH/DELETE /api/v1/admin/appointments/<uuid>/
    path('appointments/<uuid:pk>/', AdminAppointmentDetailView.as_view(), name='admin-appointment-detail'),

]