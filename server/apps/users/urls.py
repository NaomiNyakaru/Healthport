from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    PatientRegisterView,
    DoctorRegisterView,
    LoginView,
    LogoutView,
    MeView,
    ChangePasswordView,
    UpdatePushTokenView,
)

urlpatterns = [

    # ── Registration ──────────────────────────────────────────────────────────
    # Two separate endpoints — one per role — because the required fields
    # are different. Doctors need kmpdc_number and specialty; patients don't.
    #
    # Full URL: POST /api/v1/auth/register/patient/
    path('register/patient/', PatientRegisterView.as_view(), name='register-patient'),

    # Full URL: POST /api/v1/auth/register/doctor/
    path('register/doctor/',  DoctorRegisterView.as_view(),  name='register-doctor'),


    # ── Session ───────────────────────────────────────────────────────────────
    # Full URL: POST /api/v1/auth/login/
    # Body: { "email": "...", "password": "..." }
    # Returns: access token, refresh token, user object
    path('login/',  LoginView.as_view(),  name='login'),

    # Full URL: POST /api/v1/auth/logout/
    # Body: { "refresh": "<refresh_token>" }
    # Blacklists the refresh token
    path('logout/', LogoutView.as_view(), name='logout'),

    # Full URL: POST /api/v1/auth/token/refresh/
    # Body: { "refresh": "<refresh_token>" }
    # Returns a new access token when the old one expires (after 60 min).
    # TokenRefreshView is built into simplejwt — no custom view needed.
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),


    # ── Profile ───────────────────────────────────────────────────────────────
    # Full URL: GET  /api/v1/auth/me/   → returns own profile
    #           PATCH /api/v1/auth/me/  → updates name, phone, avatar
    path('me/', MeView.as_view(), name='me'),

    # Full URL: POST /api/v1/auth/change-password/
    # Body: { "old_password": "...", "new_password": "...", "new_password2": "..." }
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),


    # ── Device ────────────────────────────────────────────────────────────────
    # Full URL: PATCH /api/v1/auth/push-token/
    # Body: { "push_token": "ExponentPushToken[...]" }
    # Called once after the user grants notification permission on their phone.
    path('push-token/', UpdatePushTokenView.as_view(), name='push-token'),

]