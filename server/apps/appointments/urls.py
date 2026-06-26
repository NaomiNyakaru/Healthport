from django.urls import path
from .views import (
    AppointmentListCreateView,
    AppointmentDetailView,
    AppointmentUpdateView,
    UpcomingAppointmentsView,
    AppointmentCancelView,
)

urlpatterns = [

    # ── List and create ───────────────────────────────────────────────────────
    # Full URL: GET  /api/v1/appointments/
    # Full URL: GET  /api/v1/appointments/?status=pending
    # Full URL: GET  /api/v1/appointments/?status=confirmed
    # Full URL: GET  /api/v1/appointments/?date=2024-12-10
    # Full URL: POST /api/v1/appointments/
    path(
        '',
        AppointmentListCreateView.as_view(),
        name='appointment-list',
    ),

    # ── Upcoming — MUST come before <uuid:pk> ─────────────────────────────────
    # Full URL: GET /api/v1/appointments/upcoming/
    # Used by the home screen to show the next confirmed appointment.
    path(
        'upcoming/',
        UpcomingAppointmentsView.as_view(),
        name='appointment-upcoming',
    ),

    # ── Single appointment ────────────────────────────────────────────────────
    # Full URL: GET /api/v1/appointments/<uuid>/
    path(
        '<uuid:pk>/',
        AppointmentDetailView.as_view(),
        name='appointment-detail',
    ),

    # ── Update status (confirm / complete / cancel) ───────────────────────────
    # Full URL: PATCH /api/v1/appointments/<uuid>/update/
    # Body: { "status": "confirmed" }
    # Body: { "status": "completed", "notes": "Patient improving." }
    # Body: { "status": "cancelled", "cancellation_reason": "..." }
    path(
        '<uuid:pk>/update/',
        AppointmentUpdateView.as_view(),
        name='appointment-update',
    ),

    # ── Cancel (dedicated endpoint) ───────────────────────────────────────────
    # Full URL: POST /api/v1/appointments/<uuid>/cancel/
    # Body: { "cancellation_reason": "Doctor unavailable." }
    # Cleaner than PATCH for a single-purpose cancel action.
    path(
        '<uuid:pk>/cancel/',
        AppointmentCancelView.as_view(),
        name='appointment-cancel',
    ),
]