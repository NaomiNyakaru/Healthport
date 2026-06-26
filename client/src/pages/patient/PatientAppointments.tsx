import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../../api/client'
import {
  Calendar, Clock, Video, MapPin,
  XCircle, AlertCircle, MessageSquare
} from 'lucide-react'
import type { Appointment, PaginatedResponse } from '../../types'

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

export default function PatientAppointments() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()

  const [filter,       setFilter]       = useState('')
  const [cancelId,     setCancelId]     = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError,  setCancelError]  = useState('')
  const [chatLoading,  setChatLoading]  = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['appointments', filter],
    queryFn: () => {
      const params = filter ? `?status=${filter}` : ''
      return apiClient.get<PaginatedResponse<Appointment>>(
        `/appointments/${params}`
      ).then(r => r.data)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post(`/appointments/${id}/cancel/`, {
        cancellation_reason: reason || 'Cancelled by patient.'
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      setCancelId(null)
      setCancelReason('')
      setCancelError('')
    },
    onError: (err: any) => {
      setCancelError(err.response?.data?.message || 'Failed to cancel.')
    },
  })

  // Create or get existing chat room then navigate to it
  const openChat = async (appointmentId: string) => {
    setChatLoading(appointmentId)
    try {
      const { data } = await apiClient.post('/chat/rooms/create/', {
        appointment_id: appointmentId,
      })
      navigate(`/patient/chat/${data.id}`)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Could not open chat.')
    } finally {
      setChatLoading(null)
    }
  }

  const appointments = data?.results ?? []

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-KE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })

  const formatTime = (time: string) => {
    const [h, m] = time.split(':')
    const hour   = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Appointments</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage your upcoming and past appointments
          </p>
        </div>
        <Link to="/patient/doctors" className="btn-primary">
          <Calendar className="w-4 h-4" /> Book new
        </Link>
      </div>

      {/* Status filter tabs */}
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

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && appointments.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Calendar className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-700">No appointments found</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">
            {filter ? 'Try a different filter' : 'Book your first appointment'}
          </p>
          {!filter && (
            <Link to="/patient/doctors" className="btn-primary">
              Find a doctor
            </Link>
          )}
        </div>
      )}

      {/* Appointments */}
      {!isLoading && appointments.length > 0 && (
        <div className="space-y-3">
          {appointments.map((appt) => (
            <div key={appt.id} className="card space-y-4">

              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-700 font-semibold text-sm">
                      {appt.doctor_name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{appt.doctor_name}</p>
                    <p className="text-sm text-blue-600">{appt.doctor_specialty}</p>
                  </div>
                </div>
                <span className={statusClass[appt.status] || 'badge'}>
                  {appt.status_display}
                </span>
              </div>

              {/* Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {formatDate(appt.appointment_date)}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  {formatTime(appt.appointment_time)}
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
                <p className="text-sm text-gray-700">{appt.reason}</p>
              </div>

              {/* Doctor notes */}
              {appt.status === 'completed' && appt.notes && (
                <div className="bg-green-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-green-600 font-medium mb-0.5">Doctor's notes</p>
                  <p className="text-sm text-gray-700">{appt.notes}</p>
                </div>
              )}

              {/* Cancellation */}
              {appt.status === 'cancelled' && appt.cancellation_reason && (
                <div className="bg-red-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-red-500 font-medium mb-0.5">
                    Cancelled by {appt.cancelled_by_name || 'unknown'}
                  </p>
                  <p className="text-sm text-gray-700">{appt.cancellation_reason}</p>
                </div>
              )}

              {/* Actions */}
              {(appt.status === 'pending' || appt.status === 'confirmed') && (
                <div className="flex gap-2 pt-2 border-t border-gray-100 flex-wrap">
                  {/* Open / create chat room */}
                  <button
                    onClick={() => openChat(appt.id)}
                    disabled={chatLoading === appt.id}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    {chatLoading === appt.id ? (
                      <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <MessageSquare className="w-3.5 h-3.5" />
                    )}
                    Message doctor
                  </button>

                  <button
                    onClick={() => { setCancelId(appt.id); setCancelError('') }}
                    className="btn-danger text-xs px-3 py-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Cancel modal */}
      {cancelId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Cancel Appointment</h2>
            <p className="text-sm text-gray-500">
              Are you sure you want to cancel this appointment?
            </p>

            {cancelError && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {cancelError}
              </div>
            )}

            <div>
              <label className="label">Reason (optional)</label>
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Let the doctor know why you're cancelling..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => cancelMutation.mutate({ id: cancelId, reason: cancelReason })}
                disabled={cancelMutation.isPending}
                className="btn-danger flex-1"
              >
                {cancelMutation.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Cancelling...
                  </>
                ) : 'Yes, cancel'}
              </button>
              <button
                onClick={() => { setCancelId(null); setCancelReason('') }}
                className="btn-secondary flex-1"
              >
                Keep appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
