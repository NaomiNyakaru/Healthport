"""
Thin wrapper around Google Gemini for HealthPort's AI-assisted features.

Kept as plain functions (not a class) so each feature — triage now,
history summarization next — can import just what it needs without
carrying unrelated state around.
"""

import json
import logging
import hashlib

from django.conf import settings
from google import genai
from google.genai import types

from apps.doctors.models import DoctorProfile

logger = logging.getLogger(__name__)

# Valid specialty values the model is allowed to choose from — built from
# the same source of truth doctors are actually registered under, so the
# AI can never suggest a specialty nobody on the platform practices.
VALID_SPECIALTIES = [choice[0] for choice in DoctorProfile.Specialty.choices]


def _get_client() -> genai.Client:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError(
            'GEMINI_API_KEY is not set. Get one from '
            'https://aistudio.google.com/ and add it to your .env file.'
        )
    return genai.Client(api_key=settings.GEMINI_API_KEY)


# JSON schema the model's response must conform to. Using response_schema
# (rather than just prompting "reply in JSON") means Gemini's structured
# output mode enforces this shape — no fragile string-parsing needed.
TRIAGE_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        'suggested_specialty': types.Schema(
            type=types.Type.STRING,
            enum=VALID_SPECIALTIES,
        ),
        'urgency': types.Schema(
            type=types.Type.STRING,
            enum=['low', 'medium', 'high'],
        ),
        'explanation': types.Schema(type=types.Type.STRING),
    },
    required=['suggested_specialty', 'urgency', 'explanation'],
)

TRIAGE_SYSTEM_PROMPT = """\
You are a pre-appointment triage assistant for a Kenyan telehealth app
called HealthPort. A patient describes their symptoms before booking a
doctor. Your job is ONLY to:

1. Suggest which medical specialty they most likely need
   (from the fixed list you're given — never invent one).
2. Estimate urgency:
   - "high"   → symptoms that could indicate a medical emergency
                (e.g. chest pain, difficulty breathing, stroke signs,
                severe bleeding, suicidal ideation)
   - "medium" → concerning but not immediately life-threatening,
                should be seen within a few days
   - "low"    → routine, can be booked at the patient's convenience
3. Give a short, plain-language explanation (1-2 sentences, no jargon).

You are NOT diagnosing anything. Never state or imply a specific
diagnosis. If urgency is "high", the explanation MUST tell the patient
to seek emergency care immediately (e.g. call 999/112 or go to the
nearest ER) rather than wait for a booked appointment.

Respond only with the requested JSON — no extra commentary.
"""


def triage_symptoms(symptom_text: str) -> dict:
    """
    Given free-text symptoms from a patient, returns:
        {
            "suggested_specialty": "cardiology",   # one of DoctorProfile.Specialty
            "urgency": "medium",                   # low | medium | high
            "explanation": "...",
        }

    Falls back to a safe, generic response (general_practice / medium
    urgency) if Gemini is unreachable or misconfigured — a broken AI call
    should never block someone from booking a doctor.
    """
    fallback = {
        'suggested_specialty': DoctorProfile.Specialty.GENERAL_PRACTICE,
        'urgency': 'medium',
        'explanation': (
            "We couldn't analyze your symptoms automatically right now. "
            "We've suggested a general practitioner — they can refer you "
            "to a specialist if needed."
        ),
    }

    text = (symptom_text or '').strip()
    if not text:
        return fallback

    try:
        client = _get_client()
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=f'Patient-described symptoms: "{text}"',
            config=types.GenerateContentConfig(
                system_instruction=TRIAGE_SYSTEM_PROMPT,
                response_mime_type='application/json',
                response_schema=TRIAGE_SCHEMA,
                temperature=0.2,  # low temperature — this is a routing
                                  # decision, not creative writing
                # NOTE: we tried thinking_config=ThinkingConfig(thinking_budget=0)
                # here to disable internal reasoning, but the model behind
                # settings.GEMINI_MODEL (a Gemini 3.x alias) rejects a zero
                # budget outright ("this model only works in thinking mode").
                # Since which exact model that alias resolves to can change
                # over time, we don't fight it — instead we give a generous
                # max_output_tokens so there's room for both the invisible
                # thinking phase AND the actual JSON answer, and rely on the
                # empty-response check below as the safety net.
                max_output_tokens=800,
            ),
        )
        if not response.text or not response.text.strip():
            raise ValueError(
                f'Gemini returned an empty response '
                f'(finish_reason={getattr(response.candidates[0], "finish_reason", "?") if response.candidates else "no candidates"})'
            )
        result = json.loads(response.text)

        # Defense in depth: even though response_schema constrains the
        # enum, don't trust it blindly — validate before it reaches the
        # database or frontend.
        if result.get('suggested_specialty') not in VALID_SPECIALTIES:
            result['suggested_specialty'] = DoctorProfile.Specialty.GENERAL_PRACTICE
        if result.get('urgency') not in ('low', 'medium', 'high'):
            result['urgency'] = 'medium'

        return result

    except Exception:
        logger.exception('Gemini triage call failed — falling back to default')
        return fallback

SUMMARY_SYSTEM_PROMPT = """\
You are a clinical assistant for HealthPort, a Kenyan telehealth platform.
A doctor is about to consult with a patient and needs a rapid briefing.

Given the patient's medical records and active medications, write a
3-4 sentence clinical summary in plain English. Your summary must:

1. Lead with the most clinically significant conditions or history.
2. List active medications and their purpose (1 sentence).
3. Flag anything requiring immediate attention (abnormal results,
   drug interactions, overdue follow-ups, or anything marked urgent).
4. End with one sentence on what the patient is currently being treated for.

Rules:
- Clinical tone, no jargon the patient wouldn't understand.
- Do NOT invent information not in the provided data.
- If there are no records or medications, say so plainly.
- Maximum 4 sentences total.
- Respond with plain text only — no markdown, no bullet points.
"""


def _build_patient_context(profile) -> tuple[str, str]:
    """
    Build the text prompt and a hash fingerprint from a patient's
    current records + medications.

    Returns (context_text, sha256_hash) so the caller can detect
    when the underlying data has changed since the last summary.
    """
    from apps.patients.models import MedicalRecord, Medication

    records = MedicalRecord.objects.filter(
        patient=profile,
        is_private=False,   # doctors only see non-private records
    ).order_by('-date_of_record')[:20]   # cap at 20 most recent

    meds = Medication.objects.filter(
        patient=profile,
        is_active=True,
    ).order_by('name')

    # Build a readable context block
    lines = [f"Patient: {profile.user.full_name}"]

    if profile.age:
        lines.append(f"Age: {profile.age}")
    if profile.blood_group:
        lines.append(f"Blood group: {profile.blood_group}")
    if profile.allergies:
        lines.append(f"Allergies: {profile.allergies}")
    if profile.chronic_conditions:
        lines.append(f"Chronic conditions: {profile.chronic_conditions}")

    lines.append("")
    lines.append("MEDICAL RECORDS (most recent first):")
    if records:
        for r in records:
            lines.append(
                f"- [{r.date_of_record}] {r.get_record_type_display()}: "
                f"{r.title} — {r.description[:200]}"
            )
    else:
        lines.append("  No medical records on file.")

    lines.append("")
    lines.append("ACTIVE MEDICATIONS:")
    if meds:
        for m in meds:
            freq = (
                f"{m.frequency}× per day"
                if m.frequency_unit == 'daily'
                else f"every {m.frequency} hours"
            )
            lines.append(
                f"- {m.name} {m.dosage} ({freq})"
                + (f" — {m.instructions}" if m.instructions else "")
                + (f" [prescribed by Dr. {m.prescribed_by.full_name}]" if m.prescribed_by else "")
            )
    else:
        lines.append("  No active medications.")

    context_text = "\n".join(lines)

    # SHA-256 of the context so we can detect when data has changed
    data_hash = hashlib.sha256(context_text.encode()).hexdigest()

    return context_text, data_hash


def summarize_patient_history(profile, force: bool = False) -> dict:
    """
    Generate (or return cached) a 3-4 sentence clinical summary for a patient.

    Args:
        profile: PatientProfile instance
        force:   if True, skip the cache and regenerate even if the
                 data hasn't changed

    Returns:
        {
            "summary":   "...",
            "was_cached": True | False,
            "generated_at": "ISO timestamp or None",
        }

    The summary is cached on PatientProfile.ai_summary.
    It's only regenerated when:
      - force=True (doctor clicks "Refresh")
      - the data hash has changed (new records/meds added since last run)
      - the cache is empty (first call)
    """
    from django.utils import timezone

    context_text, data_hash = _build_patient_context(profile)

    # ── Cache hit check ───────────────────────────────────────────────────────
    if (
        not force
        and profile.ai_summary
        and profile.ai_summary_hash == data_hash
    ):
        return {
            'summary':      profile.ai_summary,
            'was_cached':   True,
            'generated_at': (
                profile.ai_summary_generated.isoformat()
                if profile.ai_summary_generated else None
            ),
        }

    # ── Fallback for when Gemini is unavailable ───────────────────────────────
    fallback_summary = (
        f"{profile.user.full_name} has "
        f"{profile.medical_records.filter(is_private=False).count()} medical record(s) on file "
        f"and {profile.medications.filter(is_active=True).count()} active medication(s). "
        "Automatic summarization is temporarily unavailable — please review the records below."
    )

    try:
        client = _get_client()
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=context_text,
            config=types.GenerateContentConfig(
                system_instruction=SUMMARY_SYSTEM_PROMPT,
                temperature=0.3,
                # See the matching comment in triage_symptoms() above — we
                # don't try to force thinking off since the current model
                # rejects thinking_budget=0. Generous ceiling instead, so
                # there's room for both the thinking phase and the actual
                # 3-4 sentence summary.
                max_output_tokens=1500,
            ),
        )
        try:
            parts = response.candidates[0].content.parts
            summary = ''.join(
                p.text for p in parts
                if hasattr(p, 'text') and p.text
            ).strip()
        except (IndexError, AttributeError):
            summary = (response.text or '').strip()

        # A real clinical summary is always at least a full sentence.
        # Anything shorter is almost certainly a truncated/garbled
        # response (e.g. cut off mid-word by MAX_TOKENS) — treat it the
        # same as a failed call rather than caching and showing garbage
        # to a doctor.
        if len(summary) < 30:
            raise ValueError(f'Gemini summary suspiciously short/truncated: {summary!r}')

    except Exception:
        logger.exception('Gemini summarization failed — using fallback')
        summary = fallback_summary

    # ── Cache the result ──────────────────────────────────────────────────────
    now = timezone.now()
    profile.ai_summary           = summary
    profile.ai_summary_hash      = data_hash
    profile.ai_summary_generated = now
    profile.save(update_fields=['ai_summary', 'ai_summary_hash', 'ai_summary_generated'])

    return {
        'summary':      summary,
        'was_cached':   False,
        'generated_at': now.isoformat(),
    }