import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../../api/client'
import {
  Calendar, Clock, Video, MapPin, CheckCircle,
  XCircle, ClipboardList, AlertCircle, ChevronDown,
  MessageSquare, User
} from 'lucide-react'
import type { Appointment, PaginatedResponse } from '../../types'

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: '',          label: 'All' },
  { value: 'pending',   label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const statusClass: Record<string, string> = {
  pending:   'badge-pending',
  confirmed: 'badge-confirmed',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
}

// ─── Modal types ────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'complete'; appt: Appointment }
  | { type: 'cancel';   appt: Appointment }
  | null

// ─── Helpers ───────────────────────────────────────────────────────────────────

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

const formatDateShort = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', {
    weekday: 'short', month: 'short', day: 'numeric',
  })

const formatTime = (t: string) => {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour > 12 ? hour - 12 : hour || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function DoctorAppointments() {
  const queryClient = useQueryClient()

  const [filter, setFilter] = useState('')
  const [modal, setModal]   = useState<ModalState>(null)
  const [notes, setNotes]         = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [actionError, setActionError]   = useState('')

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['doctor-appointments', filter],
    queryFn: () => {
      const params = filter ? `?status=${filter}` : ''
      return apiClient
        .get<PaginatedResponse<Appointment>>(`/appointments/${params}`)
        .then(r => r.data)
    },
  })

  const appointments = data?.results ?? []

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['doctor-appointments'] })
    queryClient.invalidateQueries({ queryKey: ['appointments'] })
  }

  const confirmMutation = useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/appointments/${id}/update/`, { status: 'confirmed' }),
    onSuccess: () => invalidate(),
    onError: () => setActionError('Failed to confirm. Please try again.'),
  })

  const completeMutation = useMutation({
    mutationFn: ({ id, n }: { id: string; n: string }) =>
      apiClient.patch(`/appointments/${id}/update/`, {
        status: 'completed',
        notes:  n,
      }),
    onSuccess: () => {
      invalidate()
      closeModal()
    },
    onError: () => setActionError('Failed to complete. Please try again.'),
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post(`/appointments/${id}/cancel/`, {
        cancellation_reason: reason || 'Cancelled by doctor.',
      }),
    onSuccess: () => {
      invalidate()
      closeModal()
    },
    onError: () => setActionError('Failed to cancel. Please try again.'),
  })

  // ── Modal helpers ─────────────────────────────────────────────────────────────

  const openComplete = (appt: Appointment) => {
    setNotes('')
    setActionError('')
    setModal({ type: 'complete', appt })
  }

  const openCancel = (appt: Appointment) => {
    setCancelReason('')
    setActionError('')
    setModal({ type: 'cancel', appt })
  }

  const closeModal = () => {
    setModal(null)
    setActionError('')
  }

  const isPending   = (a: Appointment) => a.status === 'pending'
  const isConfirmed = (a: Appointment) => a.status === 'confirmed'

  // ── Counts for tab badges ─────────────────────────────────────────────────────

  const pendingCount = appointments.filter(isPending).length

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="page-container space-y-6">

      {/* Header */}
      <div>
        <h1 className="page-title">Appointments</h1>
        <p className="text-gray-500 text-sm mt-1">
          {data?.count ?? 0} appointment{(data?.count ?? 0) !== 1 ? 's' : ''} total
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors relative ${
              filter === value
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
          >
            {label}
            {value === 'pending' && pendingCount > 0 && filter !== 'pending' && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex gap-4">
                <div className="w-11 h-11 bg-gray-200 rounded-full" />
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
      {!isLoading && appointments.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Calendar className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-700">No appointments found</p>
          <p className="text-sm text-gray-400 mt-1">
            {filter ? 'Try a different filter' : 'Your appointments will appear here'}
          </p>
        </div>
      )}

      {/* Appointment list */}
      {!isLoading && appointments.length > 0 && (
        <div className="space-y-3">
          {appointments.map((appt) => (
            <div key={appt.id} className="card space-y-4">

              {/* Top row: patient + status badge */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    {appt.patient_avatar ? (
                      <img
                        src={appt.patient_avatar}
                        className="w-11 h-11 rounded-full object-cover"
                        alt=""
                      />
                    ) : (
                      <span className="text-sm font-semibold text-gray-600">
                        {appt.patient_name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div>
                    <Link
                      to={`/doctor/patients/${appt.patient}`}
                      className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
                    >
                      {appt.patient_name}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Booked {new Date(appt.created_at).toLocaleDateString('en-KE', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <span className={statusClass[appt.status] || 'badge'}>
                  {appt.status_display}
                </span>
              </div>

              {/* Date / time / type */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {formatDate(appt.appointment_date)}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  {formatTime(appt.appointment_time)}
                  <span className="text-gray-400">· {appt.duration_minutes} min</span>
                </div>
                <div className="flex items-center gap-2">
                  {appt.appointment_type === 'virtual'
                    ? <Video className="w-4 h-4 text-gray-400" />
                    : <MapPin className="w-4 h-4 text-gray-400" />
                  }
                  {appt.type_display}
                </div>
              </div>

              {/* Reason */}
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-400 mb-0.5">Reason for visit</p>
                <p className="text-sm text-gray-700">{appt.reason || '—'}</p>
              </div>

              {/* Doctor's notes (completed) */}
              {appt.status === 'completed' && appt.notes && (
                <div className="bg-green-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-green-600 font-medium mb-0.5">
                    Your consultation notes
                  </p>
                  <p className="text-sm text-gray-700">{appt.notes}</p>
                </div>
              )}

              {/* Cancellation info */}
              {appt.status === 'cancelled' && (
                <div className="bg-red-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-red-500 font-medium mb-0.5">
                    Cancelled by {appt.cancelled_by_name || 'unknown'}
                  </p>
                  {appt.cancellation_reason && (
                    <p className="text-sm text-gray-700">{appt.cancellation_reason}</p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {(isPending(appt) || isConfirmed(appt)) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                  {isPending(appt) && (
                    <button
                      onClick={() => confirmMutation.mutate(appt.id)}
                      disabled={confirmMutation.isPending}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      {confirmMutation.isPending && confirmMutation.variables === appt.id ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      Confirm
                    </button>
                  )}

                  {isConfirmed(appt) && (
                    <button
                      onClick={() => openComplete(appt)}
                      className="btn-primary text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Mark complete
                    </button>
                  )}

                  <Link
                    to={`/doctor/chat`}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Message patient
                  </Link>

                  <button
                    onClick={() => openCancel(appt)}
                    className="btn-danger text-xs px-3 py-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Complete modal ─────────────────────────────────────────────────────── */}
      {modal?.type === 'complete' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <ClipboardList className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Complete appointment
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {modal.appt.patient_name} ·{' '}
                  {formatDateShort(modal.appt.appointment_date)} at{' '}
                  {formatTime(modal.appt.appointment_time)}
                </p>
              </div>
            </div>

            {actionError && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {actionError}
              </div>
            )}

            <div>
              <label className="label">
                Consultation notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                className="input resize-none"
                rows={4}
                placeholder="Diagnosis, prescriptions, follow-up instructions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                Visible to the patient. Leave blank to complete without notes.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => completeMutation.mutate({ id: modal.appt.id, n: notes })}
                disabled={completeMutation.isPending}
                className="btn-primary flex-1 bg-green-600 hover:bg-green-700"
              >
                {completeMutation.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Mark as completed
                  </>
                )}
              </button>
              <button onClick={closeModal} className="btn-secondary px-5">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel modal ───────────────────────────────────────────────────────── */}
      {modal?.type === 'cancel' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Cancel appointment</h2>
            <p className="text-sm text-gray-500">
              Cancelling for{' '}
              <span className="font-medium text-gray-700">{modal.appt.patient_name}</span> on{' '}
              {formatDateShort(modal.appt.appointment_date)} at{' '}
              {formatTime(modal.appt.appointment_time)}. The patient will be notified.
            </p>

            {actionError && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {actionError}
              </div>
            )}

            <div>
              <label className="label">
                Reason <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Let the patient know why you're cancelling..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => cancelMutation.mutate({ id: modal.appt.id, reason: cancelReason })}
                disabled={cancelMutation.isPending}
                className="btn-danger flex-1"
              >
                {cancelMutation.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Yes, cancel'
                )}
              </button>
              <button onClick={closeModal} className="btn-secondary flex-1">
                Keep appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}