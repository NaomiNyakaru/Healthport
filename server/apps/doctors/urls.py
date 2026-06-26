from django.urls import path
from .views import (
    DoctorListView,
    DoctorDetailView,
    MyDoctorProfileView,
    DoctorVerificationStatusView,
    KMPDCCheckView,
    KMPDCAdminVerifyView,
)

urlpatterns = [

    # ── Browse & search ───────────────────────────────────────────────────────
    # Full URL: GET /api/v1/doctors/
    # Returns paginated list of verified doctors.
    # Supports ?search=name and ?specialty=cardiology
    path('', DoctorListView.as_view(), name='doctor-list'),

    # ── Own profile ───────────────────────────────────────────────────────────
    # Full URL: GET  /api/v1/doctors/me/
    #           PATCH /api/v1/doctors/me/
    # Must come BEFORE <pk>/ so 'me' is not treated as a primary key.
    path('me/', MyDoctorProfileView.as_view(), name='doctor-me'),

    # ── Verification status ───────────────────────────────────────────────────
    # Full URL: GET /api/v1/doctors/verification-status/
    # Doctor polls this while waiting for KMPDC approval.
    # Must come BEFORE <pk>/ for the same reason as above.
    path('verification-status/', DoctorVerificationStatusView.as_view(), name='doctor-verification-status'),

    # ── KMPDC check ───────────────────────────────────────────────────────────
    # Full URL: POST /api/v1/doctors/kmpdc-check/
    # Called during registration to check a KMPDC number before submitting.
    # No auth required — called before the doctor account exists.
    path('kmpdc-check/', KMPDCCheckView.as_view(), name='doctor-kmpdc-check'),

    # ── Doctor detail ─────────────────────────────────────────────────────────
    # Full URL: GET /api/v1/doctors/<pk>/
    # Patient taps a doctor card to see the full profile.
    # <pk> is the integer primary key of the DoctorProfile.
    path('<int:pk>/', DoctorDetailView.as_view(), name='doctor-detail'),

    # ── Admin verify ──────────────────────────────────────────────────────────
    # Full URL: POST /api/v1/doctors/<pk>/admin-verify/
    # Admin approves or rejects a doctor's KMPDC verification.
    path('<int:pk>/admin-verify/', KMPDCAdminVerifyView.as_view(), name='doctor-admin-verify'),

]