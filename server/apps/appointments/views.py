from datetime import date

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Appointment
from .serializers import (
    AppointmentCreateSerializer,
    AppointmentSerializer,
    AppointmentUpdateSerializer,
)
from apps.users.permissions import IsPatient, IsDoctor, IsVerifiedDoctor


# ─── 1. List and create ───────────────────────────────────────────────────────

class AppointmentListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/appointments/    → list appointments for the logged-in user
    POST /api/v1/appointments/    → patient books a new appointment

    How the list works:
    - Patient sees all their own appointments
    - Doctor sees all appointments where they are the doctor
    - Both can filter by status: ?status=pending

    How booking works:
    - Only patients can POST (doctors cannot book appointments)
    - Serializer validates date, doctor availability, no double-booking
    - New appointment starts with status='pending'
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return AppointmentCreateSerializer
        return AppointmentSerializer

    def get_queryset(self):
        user = self.request.user

        if user.is_patient:
            qs = Appointment.objects.filter(patient=user)
        elif user.is_doctor:
            qs = Appointment.objects.filter(doctor=user)
        else:
            return Appointment.objects.none()

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        date_filter = self.request.query_params.get('date')
        if date_filter:
            qs = qs.filter(appointment_date=date_filter)

        return qs.select_related('patient', 'doctor').order_by(
            'appointment_date', 'appointment_time'
        )

    def create(self, request, *args, **kwargs):
        if not request.user.is_patient:
            return Response(
                {'error': 'Only patients can book appointments.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        appointment = serializer.save()

        return Response(
            AppointmentSerializer(appointment, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


# ─── 2. Appointment detail ────────────────────────────────────────────────────

class AppointmentDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/appointments/<id>/
    Either party can view the full details of an appointment they are in.
    """
    serializer_class   = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Appointment.objects.filter(
            Q(patient=user) | Q(doctor=user)
        ).select_related('patient', 'doctor', 'cancelled_by')


# ─── 3. Update appointment ────────────────────────────────────────────────────

class AppointmentUpdateView(APIView):
    """
    PATCH /api/v1/appointments/<id>/update/
    Handles confirm, complete, and cancel with role-based rules.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_appointment(self, pk, user):
        return get_object_or_404(
            Appointment,
            Q(patient=user) | Q(doctor=user),
            pk=pk,
        )

    def patch(self, request, pk):
        appointment = self.get_appointment(pk, request.user)
        new_status  = request.data.get('status')
        user        = request.user

        if user.is_patient:
            if new_status != Appointment.Status.CANCELLED:
                return Response(
                    {'error': 'Patients can only cancel appointments.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        elif user.is_doctor:
            allowed = [
                Appointment.Status.CONFIRMED,
                Appointment.Status.COMPLETED,
                Appointment.Status.CANCELLED,
            ]
            if new_status not in allowed:
                return Response(
                    {'error': f'Doctors can only set status to: {", ".join(allowed)}'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = AppointmentUpdateSerializer(
            appointment,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)

        if new_status == Appointment.Status.CONFIRMED:
            appointment.confirm()
        elif new_status == Appointment.Status.COMPLETED:
            notes = request.data.get('notes', '')
            appointment.complete(notes=notes)
        elif new_status == Appointment.Status.CANCELLED:
            reason = request.data.get('cancellation_reason', '')
            appointment.cancel(cancelled_by_user=user, reason=reason)

        return Response(
            AppointmentSerializer(appointment, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )


# ─── 4. Upcoming appointments ─────────────────────────────────────────────────

class UpcomingAppointmentsView(generics.ListAPIView):
    """
    GET /api/v1/appointments/upcoming/
    Returns upcoming confirmed appointments for the home screen.
    """
    serializer_class   = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Appointment.objects.filter(
            Q(patient=user) | Q(doctor=user),
            status=Appointment.Status.CONFIRMED,
            appointment_date__gte=date.today(),
        ).select_related(
            'patient', 'doctor'
        ).order_by('appointment_date', 'appointment_time')


# ─── 5. Cancel appointment ────────────────────────────────────────────────────

class AppointmentCancelView(APIView):
    """
    POST /api/v1/appointments/<id>/cancel/
    Dedicated cancel endpoint for either party.
    Body: { "cancellation_reason": "..." }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        appointment = get_object_or_404(
            Appointment,
            Q(patient=request.user) | Q(doctor=request.user),
            pk=pk,
        )

        if appointment.status in [
            Appointment.Status.COMPLETED,
            Appointment.Status.CANCELLED,
        ]:
            return Response(
                {'error': f'Cannot cancel a {appointment.status} appointment.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get('cancellation_reason', 'No reason provided.')
        appointment.cancel(cancelled_by_user=request.user, reason=reason)

        return Response(
            AppointmentSerializer(appointment, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )