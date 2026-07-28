import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import { Search, Calendar, Trash2, Video, MapPin } from 'lucide-react'
import type { AdminAppointment, PaginatedResponse, AppointmentStatus } from '../../types'

const statusClass: Record<string, string> = {
  pending:   'badge-pending',
  confirmed: 'badge-confirmed',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })

const formatTime = (time: string) => {
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

export default function AdminAppointments() {
  const queryClient = useQueryClient()
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [date, setDate]       = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'appointments', search, status, date],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<AdminAppointment>>('/admin/appointments/', {
          params: {
            search: search || undefined,
            status: status || undefined,
            date:   date || undefined,
          },
        })
        .then(r => r.data),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'appointments'] })

  const setApptStatus = async (id: string, newStatus: AppointmentStatus) => {
    await apiClient.patch(`/admin/appointments/${id}/`, { status: newStatus })
    refresh()
  }

  const deleteAppt = async (id: string) => {
    if (!confirm('Permanently delete this appointment record?')) return
    await apiClient.delete(`/admin/appointments/${id}/`)
    refresh()
  }

  const appointments = data?.results ?? []

  return (
    <div className="page-container space-y-6">

      <div>
        <h1 className="page-title">Appointments</h1>
        <p className="text-gray-500 text-sm mt-1">{data?.count ?? 0} appointments across HealthPort</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by patient or doctor name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input max-w-[160px]" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          type="date"
          className="input max-w-[170px]"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      {/* List */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="card animate-pulse h-20" />)}
        </div>
      )}

      {!isLoading && appointments.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Calendar className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-700">No appointments match these filters</p>
        </div>
      )}

      <div className="space-y-2">
        {appointments.map(appt => (
          <div key={appt.id} className="card flex items-start gap-4 p-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-gray-900">{appt.patient_name}</p>
                <span className="text-gray-300">→</span>
                <p className="text-sm font-medium text-gray-900">Dr. {appt.doctor_name}</p>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(appt.appointment_date)} at {formatTime(appt.appointment_time)}
                </span>
                <span className="flex items-center gap-1">
                  {appt.appointment_type === 'virtual' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                  {appt.type_display}
                </span>
                {appt.cancellation_reason && (
                  <span className="italic">"{appt.cancellation_reason}"</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={statusClass[appt.status] ?? 'badge'}>{appt.status_display}</span>
              <button
                onClick={() => deleteAppt(appt.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}