import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useUser } from '../../store/authStore'
import { apiClient } from '../../api/client'
import {
  Calendar, Users, MessageSquare,
  ChevronRight, Clock, CheckCircle, XCircle
} from 'lucide-react'
import type { Appointment, ChatRoom, PaginatedResponse } from '../../types'

export default function DoctorDashboard() {
  const user = useUser()

  const { data: upcomingData } = useQuery({
    queryKey: ['appointments', 'upcoming'],
    queryFn: () => apiClient.get<PaginatedResponse<Appointment>>('/appointments/upcoming/')
      .then(r => r.data),
  })

  const { data: pendingData } = useQuery({
    queryKey: ['appointments', 'pending'],
    queryFn: () => apiClient.get<PaginatedResponse<Appointment>>('/appointments/?status=pending')
      .then(r => r.data),
  })

  const { data: chatData } = useQuery({
    queryKey: ['chat', 'rooms'],
    queryFn: () => apiClient.get<PaginatedResponse<ChatRoom>>('/chat/rooms/')
      .then(r => r.data),
  })

  const upcoming   = upcomingData?.results ?? []
  const pending    = pendingData?.results ?? []
  const unreadMsgs = chatData?.results?.reduce((sum, r) => sum + r.unread_count, 0) ?? 0
  const nextAppt   = upcoming[0]

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' })

  const formatTime = (time: string) => {
    const [h, m] = time.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  const confirmAppt = async (id: string) => {
    await apiClient.patch(`/appointments/${id}/update/`, { status: 'confirmed' })
  }

  const cancelAppt = async (id: string) => {
    await apiClient.post(`/appointments/${id}/cancel/`, {
      cancellation_reason: 'Cancelled by doctor.'
    })
  }

  return (
    <div className="page-container space-y-6">

      {/* Welcome */}
      <div>
        <h1 className="page-title">Welcome, Dr. {user?.first_name} 👋</h1>
        <p className="text-gray-500 mt-1 text-sm">Here's your schedule for today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Upcoming appointments', value: upcoming.length, icon: Calendar, to: '/doctor/appointments', color: 'bg-blue-50 text-blue-600' },
          { label: 'Pending approval',       value: pending.length,  icon: Users,    to: '/doctor/appointments', color: 'bg-yellow-50 text-yellow-600' },
          { label: 'Unread messages',        value: unreadMsgs,      icon: MessageSquare, to: '/doctor/chat',   color: 'bg-purple-50 text-purple-600' },
        ].map(({ label, value, icon: Icon, to, color }) => (
          <Link key={to + label} to={to} className="card-hover flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Next appointment */}
      {nextAppt && (
        <div className="bg-blue-600 rounded-2xl p-6 text-white">
          <p className="text-blue-200 text-sm font-medium mb-1">Next Appointment</p>
          <p className="text-lg font-semibold">{nextAppt.patient_name}</p>
          <p className="text-blue-200 text-sm mt-0.5 mb-3">{nextAppt.reason}</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-sm">
              <Calendar className="w-4 h-4" />
              {formatDate(nextAppt.appointment_date)}
            </span>
            <span className="flex items-center gap-1.5 text-sm">
              <Clock className="w-4 h-4" />
              {formatTime(nextAppt.appointment_time)}
            </span>
          </div>
        </div>
      )}

      {/* Pending appointments needing action */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Awaiting your confirmation</h2>
            <Link to="/doctor/appointments" className="text-sm text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {pending.slice(0, 3).map((appt) => (
              <div key={appt.id} className="card flex items-start gap-4 p-4">
                <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-gray-600">
                    {appt.patient_name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{appt.patient_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{appt.reason}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(appt.appointment_date)} at {formatTime(appt.appointment_time)}
                    {' · '}{appt.type_display}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => confirmAppt(appt.id)}
                    className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                    title="Confirm"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => cancelAppt(appt.id)}
                    className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    title="Cancel"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent messages */}
      {(chatData?.results?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Recent messages</h2>
            <Link to="/doctor/chat" className="text-sm text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {chatData?.results?.slice(0, 3).map((room) => (
              <Link
                key={room.id}
                to={`/doctor/chat/${room.id}`}
                className="card-hover flex items-center gap-3 p-4"
              >
                <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-gray-600">
                    {room.other_participant_name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {room.other_participant_name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {room.last_message || 'No messages yet'}
                  </p>
                </div>
                {room.unread_count > 0 && (
                  <span className="w-5 h-5 bg-blue-600 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0">
                    {room.unread_count}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
