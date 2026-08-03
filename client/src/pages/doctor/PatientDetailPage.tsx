import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import {
  ArrowLeft, User, Heart, AlertCircle, Phone,
  Calendar, Clock, Video, MapPin, FileText,
  Paperclip, MessageSquare, ChevronDown, ChevronUp,
  Plus, X, Pill, RefreshCw, CalendarDays, Sparkles
} from 'lucide-react'
import type {
  PatientProfile, MedicalRecord, Appointment, Medication, DosageLog, PaginatedResponse
} from '../../types'

// ─── Attachment constraints (mirrors server-side validation) ───────────────────

const MAX_FILES = 5
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.doc', '.docx']

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
  diagnosis:    'bg-blue-100 text-black-700 border-black-50',
  lab_result:   'bg-purple-100 text-black-700 border-black-50',
  prescription: 'bg-green-100 text-black-700 border-black-50',
  surgery:      'bg-red-100 text-black-700 border-black-50',
  allergy:      'bg-orange-100 black-orange-700 border-black-50',
  vaccination:  'bg-teal-100 text-black-700 border-black-50',
  note:         'bg-gray-100 text-black-600 border-black-50',
}

const doseStatusClass: Record<string, string> = {
  taken:   'bg-emerald-600 text-white',
  missed:  'bg-rose-600 text-white',
  skipped: 'bg-gray-100 text-gray-600',
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const RECORD_TYPE_OPTIONS = [
  { value: 'diagnosis',    label: 'Diagnosis' },
  { value: 'lab_result',   label: 'Lab Result' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'surgery',      label: 'Surgery' },
  { value: 'allergy',      label: 'Allergy' },
  { value: 'vaccination',  label: 'Vaccination' },
  { value: 'note',         label: 'General Note' },
]

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
  const queryClient = useQueryClient()
  const today = new Date().toISOString().split('T')[0]

  const [showAllAppts, setShowAllAppts] = useState(false)

    // ── Add record form state ────────────────────────────────────────────────
  const [showAddRecord, setShowAddRecord] = useState(false)
  const [recordError,   setRecordError]   = useState('')
  const [title,         setTitle]         = useState('')
  const [recordType,    setRecordType]    = useState('note')
  const [description,   setDescription]   = useState('')
  const [dateOfRecord, setDateOfRecord] = useState(today)
  const [isPrivate,     setIsPrivate]     = useState(false)
  const [files,         setFiles]         = useState<File[]>([])

  const resetRecordForm = () => {
    setTitle('')
    setRecordType('note')
    setDescription('')
    setDateOfRecord(today)
    setIsPrivate(false)
    setFiles([])
    setRecordError('')
  }

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-selecting the same file later

    if (selected.length === 0) return

    const combined = [...files, ...selected]
    if (combined.length > MAX_FILES) {
      setRecordError(`You can attach up to ${MAX_FILES} files.`)
      return
    }

    for (const f of combined) {
      const ext = '.' + (f.name.split('.').pop() ?? '').toLowerCase()
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setRecordError(`"${f.name}" isn't a supported file type.`)
        return
      }
      if (f.size > MAX_FILE_SIZE) {
        setRecordError(`"${f.name}" is larger than 20MB.`)
        return
      }
    }

    setRecordError('')
    setFiles(combined)
  }

  const removeFile = (index: number) =>
    setFiles(prev => prev.filter((_, i) => i !== index))

  const addRecordMutation = useMutation({
    mutationFn: async () => {
      // 1. Create the record itself.
      const { data: record } = await apiClient.post(`/patients/${id}/records/`, {
        title:          title.trim(),
        record_type:    recordType,
        description:    description.trim(),
        date_of_record: dateOfRecord,
        is_private:     isPrivate,
      })

      // 2. Upload any attached files against the newly created record.
      if (files.length > 0) {
        const form = new FormData()
        files.forEach(f => form.append('files', f))
        await apiClient.post(`/patients/records/${record.id}/attachments/`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      return record
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-records-doctor', id] })
      setShowAddRecord(false)
      resetRecordForm()
    },
    onError: (err: any) => {
      const d = err.response?.data
      setRecordError(
        d?.title?.[0] || d?.date_of_record?.[0] || d?.files?.[0] || d?.message ||
        'Could not save record. Please try again.'
      )
    },
  })

  const handleAddRecord = () => {
    if (!title.trim())  { setRecordError('Title is required.'); return }
    if (!dateOfRecord)  { setRecordError('Date is required.'); return }
    setRecordError('')
    addRecordMutation.mutate()
  }

  // ── Prescribe medication form state ──────────────────────────────────────
  const [showAddMed, setShowAddMed] = useState(false)
  const [medError,   setMedError]   = useState('')
  const [medForm,    setMedForm]    = useState({
    name:           '',
    dosage:         '',
    instructions:   '',
    frequency:      '1',
    frequency_unit: 'daily',
    start_date:     today,
    end_date:       '',
  })

  const resetMedForm = () => {
    setMedForm({ name: '', dosage: '', instructions: '', frequency: '1', frequency_unit: 'daily', start_date: today, end_date: '' })
    setMedError('')
  }

  // ── Log dose state (copied from patient-side Medications.tsx) ────────────
  const [expandedMedId, setExpandedMedId] = useState<string | null>(null)
  const [showLogDose,   setShowLogDose]   = useState<string | null>(null)
  const [doseStatus,    setDoseStatus]    = useState<'taken' | 'missed' | 'skipped'>('taken')
  const [doseNotes,     setDoseNotes]     = useState('')
  const [scheduledTime, setScheduledTime] = useState(new Date().toISOString().slice(0, 16))

  const prescribeMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/patients/${id}/medications/`, {
        ...medForm,
        frequency: parseInt(medForm.frequency),
        end_date:  medForm.end_date || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-medications-doctor', id] })
      setShowAddMed(false)
      resetMedForm()
    },
    onError: (err: any) => {
      const d = err.response?.data
      setMedError(
        d?.name?.[0] || d?.dosage?.[0] || d?.frequency?.[0] ||
        d?.start_date?.[0] || d?.end_date?.[0] || d?.message ||
        'Could not prescribe medication. Please try again.'
      )
    },
  })

  const handlePrescribe = () => {
    if (!medForm.name.trim())   { setMedError('Medication name is required.'); return }
    if (!medForm.dosage.trim()) { setMedError('Dosage is required.'); return }
    setMedError('')
    prescribeMutation.mutate()
  }

  const frequencyLabel = (med: Medication) =>
    med.frequency_unit === 'daily'
      ? `${med.frequency}× per day`
      : `Every ${med.frequency} hours`

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

  // ── Fetch medications ─────────────────────────────────────────────────────

  const { data: medsData, isLoading: medsLoading } = useQuery({
    queryKey: ['patient-medications-doctor', id],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<Medication>>(`/patients/${id}/medications/`)
        .then(r => r.data),
    enabled: !!id,
  })

  const medications = medsData?.results ?? []

  // ── Fetch dose history for the expanded medication ────────────────────────

  const { data: logsData } = useQuery({
    queryKey: ['patient-dosage-logs-doctor', id, expandedMedId],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<DosageLog>>(`/patients/${id}/dosage-logs/?medication=${expandedMedId}`)
        .then(r => r.data),
    enabled: !!id && !!expandedMedId,
  })

  const logs = logsData?.results ?? []

  // ── AI patient summary ────────────────────────────────────────────────────
  const {
    data:      summaryData,
    isLoading: summaryLoading,
  } = useQuery({
    queryKey: ['patient-summary', id],
    queryFn:  () =>
      apiClient
        .get<{ summary: string; was_cached: boolean; generated_at: string | null }>(
          `/ai/patients/${id}/summary/`
        )
        .then(r => r.data),
    enabled:   !!id,
    staleTime: 1000 * 60 * 5,   // treat as fresh for 5 min — don't re-hit Gemini on every tab switch
  })

  const regenerateMutation = useMutation({
    mutationFn: () =>
      apiClient
        .get<{ summary: string; was_cached: boolean; generated_at: string | null }>(
          `/ai/patients/${id}/summary/?refresh=true`
        )
        .then(r => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData(['patient-summary', id], data)
    },
  })

  // ── Log a dose on the patient's behalf (e.g. a dose given in-clinic) ─────

  const logDoseMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/patients/${id}/dosage-logs/`, {
        medication:     showLogDose,
        scheduled_time: new Date(scheduledTime).toISOString(),
        status:         doseStatus,
        notes:          doseNotes.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-dosage-logs-doctor', id, showLogDose] })
      setShowLogDose(null)
      setDoseNotes('')
      setDoseStatus('taken')
    },
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
                    className="text-xs bg-red-50 text-black-900 border border-black-50 px-2.5 py-0.5 rounded-full"
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
                    className="text-xs bg-orange-50 text-black-900 border border-black-50 px-2.5 py-0.5 rounded-full"
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
        {/* ── AI Clinical Summary ──────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">AI Clinical Brief</p>
              {summaryData?.generated_at && (
                <p className="text-xs text-gray-400">
                  Generated {new Date(summaryData.generated_at).toLocaleString('en-KE', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                  {summaryData.was_cached ? ' · cached' : ' · fresh'}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending || summaryLoading}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40 transition-colors flex-shrink-0"
            title="Regenerate summary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
            {regenerateMutation.isPending ? 'Regenerating...' : 'Refresh'}
          </button>
        </div>

        {summaryLoading ? (
          <div className="space-y-2">
            <div className="h-3.5 bg-blue-100 rounded animate-pulse w-full" />
            <div className="h-3.5 bg-blue-100 rounded animate-pulse w-5/6" />
            <div className="h-3.5 bg-blue-100 rounded animate-pulse w-4/6" />
          </div>
        ) : summaryData?.summary ? (
          <p className="text-sm text-gray-700 leading-relaxed">{summaryData.summary}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">
            Summary unavailable — check that your GEMINI_API_KEY is configured.
          </p>
        )}

        <p className="text-xs text-gray-400 border-t border-blue-100 pt-2">
          AI-generated briefing — always verify against the full records below.
        </p>
      </div> 
      
        <div className="flex justify-end -mt-2 mb-1">
          <button
            onClick={() => { setShowAddRecord(true); setRecordError('') }}
            className="btn-primary text-xs px-3 py-2 flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Add record
          </button>
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
                className="border border-gray-300 rounded-xl px-4 py-3 space-y-1"
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
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {rec.description}
                  </p>
                )}

                <div className="flex items-center gap-3 pt-1 flex-wrap">
                  {rec.attachments?.map(att => (
                    <a
                      key={att.id}
                      href={att.file}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={att.original_filename}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline max-w-[160px]"
                    >
                      <Paperclip className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{att.original_filename || 'Attachment'}</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Medications ────────────────────────────────────────────────────────── */}
      <SectionCard title="Medications" icon={Pill}>
        <div className="flex justify-end -mt-2 mb-1">
          <button onClick={() => { setShowAddMed(true); setMedError('') }} className="btn-primary text-xs px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Prescribe medication
          </button>
        </div>

        {medsLoading && (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!medsLoading && medications.length === 0 && (
          <p className="text-sm italic text-gray-400 py-2">No medications on record.</p>
        )}

        {!medsLoading && medications.length > 0 && (
          <div className="space-y-2">
            {medications.map(med => (
              <div key={med.id} className="border border-gray-300 rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{med.name}</p>
                    <p className="text-sm text-blue-600 font-medium">{med.dosage}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                    med.is_active ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {med.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    {frequencyLabel(med)}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" />
                    {formatDate(med.start_date)}
                    {med.end_date ? ` → ${formatDate(med.end_date)}` : ' · Ongoing'}
                  </span>
                  {med.prescribed_by_name && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> Prescribed by Dr. {med.prescribed_by_name}
                    </span>
                  )}
                </div>

                {med.instructions && (
                  <p className="text-xs text-gray-400 mt-1.5">{med.instructions}</p>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => setExpandedMedId(expandedMedId === med.id ? null : med.id)}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    {expandedMedId === med.id
                      ? <><ChevronUp   className="w-3.5 h-3.5" /> Hide history</>
                      : <><ChevronDown className="w-3.5 h-3.5" /> View history</>
                    }
                  </button>
                </div>

                {/* Dose history (expanded) */}
                {expandedMedId === med.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Dose History</p>
                    {logs.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">No doses logged yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {logs.map((log) => (
                          <div key={log.id} className="flex items-center justify-between gap-3">
                            <span className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium ${
                              doseStatusClass[log.status] ?? 'bg-gray-100 text-gray-600'
                            }`}>
                              {log.status_display}
                            </span>
                            <span className="text-xs text-gray-400 flex-1 text-right">
                              {formatDateTime(log.scheduled_time)}
                            </span>
                            {log.notes && (
                              <span className="text-xs text-gray-400 italic truncate max-w-[120px]">
                                "{log.notes}"
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Prescribe medication modal ──────────────────────────────────────── */}
      {showAddMed && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Prescribe Medication</h2>
              <button onClick={() => { setShowAddMed(false); resetMedForm() }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {medError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {medError}
              </div>
            )}

            <div>
              <label className="label">Medication name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Metformin"
                value={medForm.name}
                onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Dosage <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="input"
                placeholder="e.g. 500mg"
                value={medForm.dosage}
                onChange={(e) => setMedForm({ ...medForm, dosage: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Frequency <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  className="input"
                  min="1"
                  max="24"
                  value={medForm.frequency}
                  onChange={(e) => setMedForm({ ...medForm, frequency: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Unit <span className="text-red-500">*</span></label>
                <select
                  className="input"
                  value={medForm.frequency_unit}
                  onChange={(e) => setMedForm({ ...medForm, frequency_unit: e.target.value })}
                >
                  <option value="daily">Times per day</option>
                  <option value="hours">Every N hours</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  className="input"
                  value={medForm.start_date}
                  onChange={(e) => setMedForm({ ...medForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="label">End date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="date"
                  className="input"
                  min={medForm.start_date}
                  value={medForm.end_date}
                  onChange={(e) => setMedForm({ ...medForm, end_date: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="label">Instructions <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                className="input resize-none"
                rows={2}
                placeholder="e.g. Take with food. Avoid alcohol."
                value={medForm.instructions}
                onChange={(e) => setMedForm({ ...medForm, instructions: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={handlePrescribe} disabled={prescribeMutation.isPending} className="btn-primary flex-1">
                {prescribeMutation.isPending ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                ) : (
                  <><Plus className="w-4 h-4" /> Prescribe medication</>
                )}
              </button>
              <button onClick={() => { setShowAddMed(false); resetMedForm() }} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Log dose modal (copied from patient-side Medications.tsx) ────────── */}
      {showLogDose && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Log Dose</h2>
              <button onClick={() => setShowLogDose(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="label">Status</label>
              <div className="grid grid-cols-3 gap-2">
                {(['taken', 'missed', 'skipped'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setDoseStatus(s)}
                    className={`py-2 text-sm rounded-xl border font-medium capitalize transition-colors ${
                      doseStatus === s
                        ? s === 'taken'   ? 'bg-green-600 text-white border-green-600'
                        : s === 'missed'  ? 'bg-red-600 text-white border-red-600'
                                          : 'bg-gray-600 text-white border-gray-600'
                        : 'border-gray-200 text-gray-600 hover:border-blue-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Scheduled time</label>
              <input
                type="datetime-local"
                className="input"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                className="input"
                placeholder='e.g. "Given IM in-clinic"'
                value={doseNotes}
                onChange={(e) => setDoseNotes(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => logDoseMutation.mutate()}
                disabled={logDoseMutation.isPending}
                className="btn-primary flex-1"
              >
                {logDoseMutation.isPending ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Logging...</>
                ) : 'Log dose'}
              </button>
              <button onClick={() => setShowLogDose(null)} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Add record modal ──────────────────────────────────────────────── */}
      {showAddRecord && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Add Medical Record</h2>
              <button
                onClick={() => { setShowAddRecord(false); resetRecordForm() }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {recordError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {recordError}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="label">Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="input"
                placeholder='e.g. "Follow-up consultation"'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Record type */}
            <div>
              <label className="label">Record Type <span className="text-red-500">*</span></label>
              <select
                className="input"
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
              >
                {RECORD_TYPE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="label">Date of Record <span className="text-red-500">*</span></label>
              <input
                type="date"
                className="input"
                max={today}
                value={dateOfRecord}
                onChange={(e) => setDateOfRecord(e.target.value)}
              />
            </div>

            {/* Description */}
            <div>
              <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Diagnosis, findings, or notes for this visit..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Attachments */}
            <div>
              <label className="label">
                Attachments <span className="text-gray-400 font-normal">(optional, up to {MAX_FILES} files)</span>
              </label>

              <label
                htmlFor="record-file-input"
                className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl px-4 py-4 text-sm text-gray-500 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
              >
                <Paperclip className="w-4 h-4" />
                Click to attach lab results, referrals, or scans
              </label>
              <input
                id="record-file-input"
                type="file"
                multiple
                accept={ALLOWED_EXTENSIONS.join(',')}
                onChange={handleFilesSelected}
                className="hidden"
              />
              <p className="text-xs text-gray-400 mt-1">
                PDF, JPG, PNG, HEIC, DOC/DOCX · up to 20MB each
              </p>

              {files.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {files.map((f, i) => (
                    <li
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5"
                    >
                      <span className="flex items-center gap-1.5 text-xs text-gray-700 min-w-0">
                        <Paperclip className="w-3 h-3 flex-shrink-0 text-gray-400" />
                        <span className="truncate">{f.name}</span>
                        <span className="text-gray-400 flex-shrink-0">
                          ({(f.size / (1024 * 1024)).toFixed(1)}MB)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleAddRecord}
                disabled={addRecordMutation.isPending}
                className="btn-primary flex-1"
              >
                {addRecordMutation.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <><Plus className="w-4 h-4" /> Save record</>
                )}
              </button>
              <button
                onClick={() => { setShowAddRecord(false); resetRecordForm() }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

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