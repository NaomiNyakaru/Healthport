import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import {
  Pill, Plus, Trash2, CheckCircle, XCircle,
  Clock, AlertCircle, X, ChevronDown, ChevronUp,
  CalendarDays, User, RefreshCw
} from 'lucide-react'
import type { Medication, DosageLog, PaginatedResponse } from '../../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: '',      label: 'All' },
  { value: 'true',  label: 'Active' },
  { value: 'false', label: 'Inactive' },
]

const doseStatusClass: Record<string, string> = {
  taken:   'bg-green-100 text-green-700',
  missed:  'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-600',
}

const doseStatusIcon: Record<string, React.ReactNode> = {
  taken:   <CheckCircle className="w-3.5 h-3.5" />,
  missed:  <XCircle     className="w-3.5 h-3.5" />,
  skipped: <Clock       className="w-3.5 h-3.5" />,
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const today = new Date().toISOString().split('T')[0]

// ── Component ─────────────────────────────────────────────────────────────────

export default function Medications() {
  const queryClient = useQueryClient()

  const [filter,       setFilter]       = useState('')
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [showAdd,      setShowAdd]      = useState(false)
  const [deleteId,     setDeleteId]     = useState<string | null>(null)
  const [showLogDose,  setShowLogDose]  = useState<string | null>(null)
  const [addError,     setAddError]     = useState('')

  // Add form state
  const [form, setForm] = useState({
    name:           '',
    dosage:         '',
    instructions:   '',
    frequency:      '1',
    frequency_unit: 'daily',
    start_date:     today,
    end_date:       '',
  })

  // Log dose form
  const [doseStatus,    setDoseStatus]    = useState<'taken' | 'missed' | 'skipped'>('taken')
  const [doseNotes,     setDoseNotes]     = useState('')
  const [scheduledTime, setScheduledTime] = useState(new Date().toISOString().slice(0, 16))

  // ── Fetch medications ──────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['medications', filter],
    queryFn: () => {
      const params = filter !== '' ? `?active=${filter}` : ''
      return apiClient
        .get<PaginatedResponse<Medication>>(`/patients/me/medications/${params}`)
        .then(r => r.data)
    },
  })

  const medications = data?.results ?? []

  // ── Fetch logs for expanded med ────────────────────────────────────────────

  const { data: logsData } = useQuery({
    queryKey: ['dosage-logs', expandedId],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<DosageLog>>(`/patients/me/dosage-logs/?medication=${expandedId}`)
        .then(r => r.data),
    enabled: !!expandedId,
  })

  const logs = logsData?.results ?? []

  // ── Add medication ─────────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiClient.post('/patients/me/medications/', {
        ...data,
        frequency:  parseInt(data.frequency),
        end_date:   data.end_date || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] })
      setShowAdd(false)
      resetForm()
    },
    onError: (err: any) => {
      const d = err.response?.data
      setAddError(
        d?.name?.[0] || d?.dosage?.[0] || d?.frequency?.[0] ||
        d?.start_date?.[0] || d?.end_date?.[0] || d?.message ||
        'Failed to add medication.'
      )
    },
  })

  // ── Delete medication ──────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/patients/me/medications/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] })
      setDeleteId(null)
      if (expandedId === deleteId) setExpandedId(null)
    },
  })

  // ── Toggle active ──────────────────────────────────────────────────────────

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiClient.patch(`/patients/me/medications/${id}/`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['medications'] }),
  })

  // ── Log dose ───────────────────────────────────────────────────────────────

  const logDoseMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/patients/me/dosage-logs/', {
        medication:     showLogDose,
        scheduled_time: new Date(scheduledTime).toISOString(),
        status:         doseStatus,
        notes:          doseNotes.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dosage-logs', showLogDose] })
      setShowLogDose(null)
      setDoseNotes('')
      setDoseStatus('taken')
    },
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setForm({ name: '', dosage: '', instructions: '', frequency: '1', frequency_unit: 'daily', start_date: today, end_date: '' })
    setAddError('')
  }

  const handleAdd = () => {
    if (!form.name.trim())   { setAddError('Medication name is required.'); return }
    if (!form.dosage.trim()) { setAddError('Dosage is required.'); return }
    if (!form.start_date)    { setAddError('Start date is required.'); return }
    setAddError('')
    addMutation.mutate(form)
  }

  const frequencyLabel = (med: Medication) =>
    med.frequency_unit === 'daily'
      ? `${med.frequency}× per day`
      : `Every ${med.frequency} hours`

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-container space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Medications</h1>
          <p className="text-gray-500 text-sm mt-1">Track your prescriptions and log doses</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddError('') }} className="btn-primary">
          <Plus className="w-4 h-4" /> Add medication
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === value
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Count */}
      {!isLoading && (
        <p className="text-sm text-gray-500">
          {data?.count ?? 0} medication{(data?.count ?? 0) !== 1 ? 's' : ''}
        </p>
      )}

      {/* Skeletons */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 bg-gray-200 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && medications.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Pill className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-700">No medications found</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">
            {filter === 'true' ? 'No active medications' : filter === 'false' ? 'No inactive medications' : 'Add your first medication to start tracking'}
          </p>
          {!filter && (
            <button onClick={() => setShowAdd(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Add medication
            </button>
          )}
        </div>
      )}

      {/* Medications list */}
      {!isLoading && medications.length > 0 && (
        <div className="space-y-3">
          {medications.map((med) => (
            <div key={med.id} className="card space-y-0">

              {/* Card header */}
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  med.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  <Pill className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{med.name}</p>
                      <p className="text-sm text-blue-600 font-medium">{med.dosage}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                      med.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {med.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> {frequencyLabel(med)}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {formatDate(med.start_date)}
                      {med.end_date ? ` → ${formatDate(med.end_date)}` : ' · Ongoing'}
                    </span>
                    {med.prescribed_by_name && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> Dr. {med.prescribed_by_name}
                      </span>
                    )}
                  </div>

                  {med.instructions && (
                    <p className="text-xs text-gray-400 mt-1.5 italic">{med.instructions}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button
                      onClick={() => { setShowLogDose(med.id); setScheduledTime(new Date().toISOString().slice(0, 16)) }}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Log dose
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === med.id ? null : med.id)}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      {expandedId === med.id
                        ? <><ChevronUp   className="w-3.5 h-3.5" /> Hide history</>
                        : <><ChevronDown className="w-3.5 h-3.5" /> View history</>
                      }
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate({ id: med.id, is_active: !med.is_active })}
                      disabled={toggleMutation.isPending}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      {med.is_active ? 'Mark inactive' : 'Mark active'}
                    </button>
                    <button
                      onClick={() => setDeleteId(med.id)}
                      className="btn-danger text-xs px-3 py-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Dose history (expanded) */}
              {expandedId === med.id && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
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
                            {doseStatusIcon[log.status]}
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

      {/* ── Add medication modal ────────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Add Medication</h2>
              <button onClick={() => { setShowAdd(false); resetForm() }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {addError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {addError}
              </div>
            )}

            <div>
              <label className="label">Medication name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Metformin"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Dosage <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="input"
                placeholder="e.g. 500mg"
                value={form.dosage}
                onChange={(e) => setForm({ ...form, dosage: e.target.value })}
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
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Unit <span className="text-red-500">*</span></label>
                <select
                  className="input"
                  value={form.frequency_unit}
                  onChange={(e) => setForm({ ...form, frequency_unit: e.target.value })}
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
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="label">End date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="date"
                  className="input"
                  min={form.start_date}
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="label">Instructions <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                className="input resize-none"
                rows={2}
                placeholder="e.g. Take with food. Avoid alcohol."
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={handleAdd} disabled={addMutation.isPending} className="btn-primary flex-1">
                {addMutation.isPending ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                ) : (
                  <><Plus className="w-4 h-4" /> Add medication</>
                )}
              </button>
              <button onClick={() => { setShowAdd(false); resetForm() }} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Log dose modal ──────────────────────────────────────────────────── */}
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
                placeholder='e.g. "Felt nauseous after"'
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

      {/* ── Delete modal ────────────────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Delete Medication</h2>
            <p className="text-sm text-gray-500">
              This will permanently delete the medication and all its dose history. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="btn-danger flex-1"
              >
                {deleteMutation.isPending ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Deleting...</>
                ) : 'Yes, delete'}
              </button>
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}