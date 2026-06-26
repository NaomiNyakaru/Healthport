import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import {
  ArrowLeft, User, Heart, AlertCircle, Phone,
  Calendar, Clock, Video, MapPin, FileText,
  Lock, Paperclip, MessageSquare, ChevronDown, ChevronUp
} from 'lucide-react'
import type {
  PatientProfile, MedicalRecord, Appointment, PaginatedResponse
} from '../../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

const formatTime = (t: string) => {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

const statusClass: Record<string, string> = {
  pending:   'badge-pending',
  confirmed: 'badge-confirmed',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
}

const RECORD_TYPE_COLOURS: Record<string, string> = {
  diagnosis:    'bg-blue-50 text-blue-700 border-blue-100',
  lab_result:   'bg-purple-50 text-purple-700 border-purple-100',
  prescription: 'bg-green-50 text-green-700 border-green-100',
  surgery:      'bg-red-50 text-red-700 border-red-100',
  allergy:      'bg-orange-50 text-orange-700 border-orange-100',
  vaccination:  'bg-teal-50 text-teal-700 border-teal-100',
  note:         'bg-gray-50 text-gray-600 border-gray-100',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">
        {value || <span className="italic text-gray-400">Not recorded</span>}
      </p>
    </div>
  )
}

function SectionCard({
  title, icon: Icon, children,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PatientDetailPage() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()

  const [showAllAppts, setShowAllAppts] = useState(false)

  // ── Fetch patient profile ────────────────────────────────────────────────

  const { data: profile, isLoading: profileLoading, isError: profileError } = useQuery({
    queryKey: ['patient-profile-doctor', id],
    queryFn: () =>
      apiClient
        .get<PatientProfile>(`/patients/${id}/profile/`)
        .then(r => r.data),
    enabled: !!id,
  })

  // ── Fetch medical records (non-private only) ─────────────────────────────

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['patient-records-doctor', id],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<MedicalRecord>>(`/patients/${id}/records/`)
        .then(r => r.data),
    enabled: !!id,
  })

  // ── Fetch shared appointment history ─────────────────────────────────────

  const { data: apptData, isLoading: apptsLoading } = useQuery({
    queryKey: ['doctor-appointments-for-patient', id],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<Appointment>>('/appointments/')
        .then(r => r.data),
    enabled: !!id,
  })

  const sharedAppts = (apptData?.results ?? [])
    .filter(a => a.patient === id)
    .sort(
      (a, b) =>
        new Date(b.appointment_date).getTime() -
        new Date(a.appointment_date).getTime()
    )

  const visibleAppts = showAllAppts ? sharedAppts : sharedAppts.slice(0, 3)

  // ── Find a chat room with this patient ───────────────────────────────────
  // We'll use the first confirmed/completed appointment's chat room
  const firstLinkedAppt = sharedAppts.find(
    a => a.status === 'confirmed' || a.status === 'completed'
  )

  // ── Loading state ────────────────────────────────────────────────────────

  if (profileLoading) return (
    <div className="page-container max-w-2xl">
      <div className="animate-pulse space-y-4">
        <div className="h-5 bg-gray-200 rounded w-24" />
        <div className="card space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-gray-200 rounded w-1/3" />
              <div className="h-3 bg-gray-200 rounded w-1/4" />
            </div>
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    </div>
  )

  if (profileError || !profile) return (
    <div className="page-container text-center py-16">
      <p className="text-gray-500">Patient not found or access denied.</p>
      <button
        onClick={() => navigate(-1)}
        className="btn-secondary mt-4"
      >
        Go back
      </button>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-container space-y-6 max-w-2xl">

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to patients
      </button>

      {/* ── Identity card ───────────────────────────────────────────────────── */}
      <div className="card space-y-5">
        <div className="flex items-start justify-between gap-4">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  className="w-16 h-16 rounded-full object-cover"
                  alt=""
                />
              ) : (
                <User className="w-7 h-7 text-gray-400" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {profile.full_name}
              </h1>
              <p className="text-sm text-gray-500">{profile.email}</p>
              {profile.age && (
                <p className="text-sm text-gray-400 mt-0.5">{profile.age} years old</p>
              )}
            </div>
          </div>

          {/* Message button */}
          <Link
            to="/doctor/chat"
            className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Message
          </Link>
        </div>

        {/* Quick vitals row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
          <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
            <p className="text-xs text-gray-400">Blood group</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">
              {profile.blood_group || '—'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
            <p className="text-xs text-gray-400">Gender</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5 capitalize">
              {profile.gender || '—'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
            <p className="text-xs text-gray-400">DOB</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">
              {profile.date_of_birth
                ? new Date(profile.date_of_birth).toLocaleDateString('en-KE', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })
                : '—'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
            <p className="text-xs text-gray-400">Visits</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">
              {sharedAppts.length}
            </p>
          </div>
        </div>
      </div>

      {/* ── Health info card ─────────────────────────────────────────────────── */}
      <SectionCard title="Health Information" icon={Heart}>
        <div className="space-y-4">
          {/* Allergies */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Allergies</p>
            {profile.allergies ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.allergies.split(',').map((a, i) => (
                  <span
                    key={i}
                    className="text-xs bg-red-50 text-red-700 border border-red-100 px-2.5 py-0.5 rounded-full"
                  >
                    {a.trim()}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-gray-400">None recorded</p>
            )}
          </div>

          {/* Chronic conditions */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Chronic conditions</p>
            {profile.chronic_conditions ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.chronic_conditions.split(',').map((c, i) => (
                  <span
                    key={i}
                    className="text-xs bg-orange-50 text-orange-700 border border-orange-100 px-2.5 py-0.5 rounded-full"
                  >
                    {c.trim()}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-gray-400">None recorded</p>
            )}
          </div>

          {/* National ID */}
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
            <InfoRow label="National ID" value={profile.national_id} />
          </div>
        </div>
      </SectionCard>

      {/* ── Emergency contact ─────────────────────────────────────────────────── */}
      {(profile.emergency_contact_name || profile.emergency_contact_phone) && (
        <SectionCard title="Emergency Contact" icon={AlertCircle}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow label="Name"  value={profile.emergency_contact_name} />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Phone</p>
              {profile.emergency_contact_phone ? (
                <a
                  href={`tel:${profile.emergency_contact_phone}`}
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1.5"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {profile.emergency_contact_phone}
                </a>
              ) : (
                <p className="text-sm italic text-gray-400">Not recorded</p>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Medical records ───────────────────────────────────────────────────── */}
      <SectionCard title="Medical Records" icon={FileText}>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mb-2">
          <Lock className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <p className="text-xs text-blue-700">
            Private records are hidden. Only records the patient has made visible to doctors appear here.
          </p>
        </div>

        {recordsLoading && (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 animate-pulse rounded-xl" />
            ))}
          </div>
        )}

        {!recordsLoading && (records?.results ?? []).length === 0 && (
          <p className="text-sm italic text-gray-400 py-2">No records to display.</p>
        )}

        {!recordsLoading && (records?.results ?? []).length > 0 && (
          <div className="space-y-2">
            {records!.results.map(rec => (
              <div
                key={rec.id}
                className="border border-gray-100 rounded-xl px-4 py-3 space-y-1"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${
                        RECORD_TYPE_COLOURS[rec.record_type] ?? RECORD_TYPE_COLOURS.note
                      }`}
                    >
                      {rec.record_type_display}
                    </span>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {rec.title}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 flex-shrink-0">
                    {formatDate(rec.date_of_record)}
                  </p>
                </div>

                {rec.description && (
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">
                    {rec.description}
                  </p>
                )}

                <div className="flex items-center gap-3 pt-1">
                  {rec.doctor_name && (
                    <p className="text-xs text-gray-400">
                      by {rec.doctor_name}
                    </p>
                  )}
                  {rec.attachment && (
                    <a
                      href={rec.attachment}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <Paperclip className="w-3 h-3" />
                      Attachment
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Appointment history ───────────────────────────────────────────────── */}
      <SectionCard title="Appointment History" icon={Calendar}>
        {apptsLoading && (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />
            ))}
          </div>
        )}

        {!apptsLoading && sharedAppts.length === 0 && (
          <p className="text-sm italic text-gray-400">No shared appointments yet.</p>
        )}

        {!apptsLoading && sharedAppts.length > 0 && (
          <div className="space-y-2">
            {visibleAppts.map(appt => (
              <div
                key={appt.id}
                className="border border-gray-100 rounded-xl px-4 py-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {formatDate(appt.appointment_date)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {formatTime(appt.appointment_time)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {appt.appointment_type === 'virtual'
                        ? <Video className="w-3.5 h-3.5 text-gray-400" />
                        : <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      }
                      {appt.type_display}
                    </span>
                  </div>
                  <span className={statusClass[appt.status] || 'badge'}>
                    {appt.status_display}
                  </span>
                </div>

                <p className="text-xs text-gray-500 line-clamp-1">
                  <span className="text-gray-400">Reason: </span>{appt.reason || '—'}
                </p>

                {appt.status === 'completed' && appt.notes && (
                  <div className="bg-green-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-green-600 font-medium mb-0.5">
                      Consultation notes
                    </p>
                    <p className="text-xs text-gray-700 line-clamp-2">{appt.notes}</p>
                  </div>
                )}
              </div>
            ))}

            {sharedAppts.length > 3 && (
              <button
                onClick={() => setShowAllAppts(v => !v)}
                className="w-full flex items-center justify-center gap-1.5 text-sm text-blue-600 hover:underline py-1"
              >
                {showAllAppts ? (
                  <><ChevronUp className="w-4 h-4" /> Show less</>
                ) : (
                  <><ChevronDown className="w-4 h-4" /> Show all {sharedAppts.length} appointments</>
                )}
              </button>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
