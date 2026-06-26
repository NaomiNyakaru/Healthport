from rest_framework import generics, status, permissions, filters
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DoctorProfile
from .serializers import (
    DoctorProfileSerializer,
    DoctorListSerializer,
    DoctorUpdateSerializer,
    KMPDCVerifySerializer,
)
from .permissions import IsDoctor, IsVerifiedDoctor, IsAdminUser


# ─── 1. Browse doctors ────────────────────────────────────────────────────────

class DoctorListView(generics.ListAPIView):
    """
    GET /api/v1/doctors/

    Returns a paginated list of verified doctors for the patient browse screen.
    Only shows doctors who are verified and accepting patients.

    Supports:
    - ?search=alice         search by name, specialty, hospital
    - ?specialty=cardiology filter by specialty
    - ?accepting=true       only show doctors accepting new patients

    Who can call it: any logged-in user (patient or doctor).
    """
    serializer_class   = DoctorListSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [filters.SearchFilter]
    search_fields      = [
        'user__first_name',
        'user__last_name',
        'specialty',
        'hospital_affiliation',
    ]

    def get_queryset(self):
        # Start with only verified doctors
        qs = DoctorProfile.objects.filter(
            verification_status=DoctorProfile.VerificationStatus.VERIFIED,
        ).select_related('user')   # join User in the same DB query — avoids N+1 queries

        # Optional filter: specialty
        specialty = self.request.query_params.get('specialty')
        if specialty:
            qs = qs.filter(specialty=specialty)

        # Optional filter: only accepting patients
        accepting = self.request.query_params.get('accepting')
        if accepting == 'true':
            qs = qs.filter(is_accepting_patients=True)

        # Highest rated doctors appear first (set in model Meta ordering)
        return qs


# ─── 2. Doctor detail ─────────────────────────────────────────────────────────

class DoctorDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/doctors/<id>/

    Full doctor profile — shown when a patient taps a doctor card.
    Only returns verified doctors — unverified doctors are not visible
    to patients.

    Who can call it: any logged-in user.
    """
    serializer_class   = DoctorProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return DoctorProfile.objects.filter(
            verification_status=DoctorProfile.VerificationStatus.VERIFIED,
        ).select_related('user')


# ─── 3. Doctor's own profile ──────────────────────────────────────────────────

class MyDoctorProfileView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/v1/doctors/me/   → doctor views their own full profile
    PATCH /api/v1/doctors/me/   → doctor updates their editable fields

    Why different serializers for GET vs PATCH?
    - GET uses DoctorProfileSerializer — returns everything including
      verification status, rating, KMPDC number (read-only fields).
    - PATCH uses DoctorUpdateSerializer — only accepts the fields
      a doctor is allowed to change (bio, fee, availability etc).
      This prevents a doctor from sending { "verification_status": "verified" }
      and approving themselves.

    Who can call it: any doctor (pending or verified).
    """
    permission_classes = [IsDoctor]
    http_method_names  = ['get', 'patch', 'head', 'options']

    def get_serializer_class(self):
        if self.request.method == 'PATCH':
            return DoctorUpdateSerializer
        return DoctorProfileSerializer

    def get_object(self):
        # Always returns the logged-in doctor's own profile.
        # A doctor can never accidentally edit another doctor's profile.
        return self.request.user.doctor_profile


# ─── 4. Verification status ───────────────────────────────────────────────────

class DoctorVerificationStatusView(APIView):
    """
    GET /api/v1/doctors/verification-status/

    Called by the app while the doctor is on the "pending verification" screen.
    The app polls this every 30 seconds or so until status changes to 'verified'.
    Once verified, the app navigates the doctor to the main dashboard.

    Returns a small response — just the status fields, nothing else.

    Who can call it: any doctor (pending or verified).
    """
    permission_classes = [IsDoctor]

    def get(self, request):
        profile = request.user.doctor_profile
        return Response({
            'verification_status': profile.verification_status,
            'is_verified':         profile.is_verified,
            'verification_note':   profile.verification_note,
            'kmpdc_number':        profile.kmpdc_number,
        })


# ─── 5. KMPDC check ───────────────────────────────────────────────────────────

class KMPDCCheckView(APIView):
    """
    POST /api/v1/doctors/kmpdc-check/

    Body: { "kmpdc_number": "KMPDC/001/2020" }

    Called during doctor registration to check if a KMPDC number
    exists in the registry before submitting the full form.
    Gives the doctor instant feedback if their number is wrong.

    This does NOT change any verification_status — it's just a lookup.
    The actual verification is done by the admin via KMPDCAdminVerifyView.

    Who can call it: anyone (no login required — called before account exists).
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        kmpdc_number = request.data.get('kmpdc_number', '').strip()

        if not kmpdc_number:
            return Response(
                {'error': 'kmpdc_number is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Import here to avoid circular imports at module load time
        from .kmpdc import verify_kmpdc_number
        result = verify_kmpdc_number(kmpdc_number)

        return Response(result, status=status.HTTP_200_OK)


# ─── 6. Admin verify ──────────────────────────────────────────────────────────

class KMPDCAdminVerifyView(APIView):
    """
    POST /api/v1/doctors/<pk>/admin-verify/

    Admin-only endpoint to approve or reject a doctor's KMPDC verification.

    Body:
        { "action": "verify", "note": "KMPDC number confirmed." }
    or
        { "action": "reject", "note": "Number not found in registry." }

    What happens after verify:
    - doctor_profile.verification_status → 'verified'
    - doctor_profile.verified_at → now
    - Doctor can now access all patient-facing features
    - TODO Day 3: send push notification to doctor

    What happens after reject:
    - doctor_profile.verification_status → 'rejected'
    - doctor_profile.verification_note → the note
    - TODO Day 3: send push notification to doctor

    Who can call it: admin/staff users only.
    """
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        # Find the doctor profile
        try:
            profile = DoctorProfile.objects.select_related('user').get(pk=pk)
        except DoctorProfile.DoesNotExist:
            return Response(
                {'error': 'Doctor profile not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Validate the action and note
        serializer = KMPDCVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action = serializer.validated_data['action']
        note   = serializer.validated_data.get('note', '')

        if action == 'verify':
            profile.verify(note=note)
            message = f'Dr. {profile.user.full_name} has been verified successfully.'
        else:
            profile.reject(note=note)
            message = f'Dr. {profile.user.full_name} has been rejected.'

        return Response({
            'message':             message,
            'verification_status': profile.verification_status,
            'doctor':              profile.user.full_name,
        }, status=status.HTTP_200_OK)