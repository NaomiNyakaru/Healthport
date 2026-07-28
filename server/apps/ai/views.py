from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from apps.users.permissions import IsPatient, IsVerifiedDoctor
from apps.patients.models import PatientProfile
from .services import triage_symptoms, summarize_patient_history


class TriageView(APIView):
    """
    POST /api/v1/ai/triage/
    Body: { "symptoms": "I've had a sharp pain in my chest since morning" }

    Returns an AI-suggested specialty + urgency level so a patient who
    doesn't know which kind of doctor they need can get pointed in the
    right direction before browsing/booking.

    Who can call it: patients only. Read-only in the sense that it
    doesn't create or modify anything — purely advisory. Never used to
    auto-book anything; the patient still picks and confirms a doctor
    themselves on BrowseDoctors.tsx.
    """
    permission_classes = [IsPatient]

    def post(self, request):
        symptoms = request.data.get('symptoms', '')

        if not symptoms or not symptoms.strip():
            return Response(
                {'symptoms': 'Please describe your symptoms.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(symptoms) > 1000:
            return Response(
                {'symptoms': 'Please keep your description under 1000 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = triage_symptoms(symptoms)
        return Response(result, status=status.HTTP_200_OK)

class PatientSummaryView(APIView):
    """
    GET /api/v1/ai/patients/<patient_id>/summary/

    Returns a 3-4 sentence AI-generated clinical brief for a patient,
    pulling from their MedicalRecord history and active Medications.

    The summary is cached on PatientProfile and only regenerated when:
    - the underlying records/meds have changed since the last run, OR
    - the doctor passes ?refresh=true to force a fresh generation.

    Who can call it: verified doctors only.
    Patients cannot call this endpoint — the summary is a clinical
    tool for the doctor, not patient-facing content.
    """
    permission_classes = [IsVerifiedDoctor]

    def get(self, request, patient_id):
        profile = get_object_or_404(PatientProfile, user__id=patient_id)
        force   = request.query_params.get('refresh', '').lower() == 'true'
        result  = summarize_patient_history(profile, force=force)
        return Response(result, status=status.HTTP_200_OK)