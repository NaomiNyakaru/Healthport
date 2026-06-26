import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useUser } from '../../store/authStore'
import { apiClient } from '../../api/client'
import {
  Calendar, Pill, MessageSquare, Search,
  ChevronRight, Clock, User
} from 'lucide-react'
import type { Appointment, Medication, ChatRoom, PaginatedResponse } from '../../types'

export default function PatientDashboard() {
  const user = useUser()

  const { data: upcomingData } = useQuery({
    queryKey: ['appointments', 'upcoming'],
    queryFn: () => apiClient.get<PaginatedResponse<Appointment>>('/appointments/upcoming/')
      .then(r => r.data),
  })

  const { data: medicationsData } = useQuery({
    queryKey: ['medications', 'active'],
    queryFn: () => apiClient.get<PaginatedResponse<Medication>>('/patients/me/medications/?active=true')
      .then(r => r.data),
  })

  const { data: chatData } = useQuery({
    queryKey: ['chat', 'rooms'],
    queryFn: () => apiClient.get<PaginatedResponse<ChatRoom>>('/chat/rooms/')
      .then(r => r.data),
  })

  const upcoming     = upcomingData?.results ?? []
  const nextAppt     = upcoming[0]
  const activeMeds   = medicationsData?.count ?? 0
  const unreadMsgs   = chatData?.results?.reduce((sum, r) => sum + r.unread_count, 0) ?? 0

  const stats = [
    { label: 'Upcoming appointments', value: upcoming.length, icon: Calendar, to: '/patient/appointments', color: 'bg-blue-50 text-blue-600' },
    { label: 'Active medications',     value: activeMeds,      icon: Pill,     to: '/patient/medications',  color: 'bg-green-50 text-green-600' },
    { label: 'Unread messages',        value: unreadMsgs,      icon: MessageSquare, to: '/patient/chat',   color: 'bg-purple-50 text-purple-600' },
  ]

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-KE', { weekday: 'long', month: 'long', day: 'numeric' })

  const formatTime = (time: string) => {
    const [h, m] = time.split(':')
    const hour = parseInt(h)
    return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  return (
    <div className="page-container space-y-6">

      {/* Welcome */}
      <div>
        <h1 className="page-title">
          Good morning, {user?.first_name} 👋
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Here's what's happening with your health today.
        </p>
      </div>

      {/* Next appointment banner */}
      {nextAppt ? (
        <div className="bg-blue-600 rounded-2xl p-6 text-white">
          <p className="text-blue-200 text-sm font-medium mb-1">Next Appointment</p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">{nextAppt.doctor_name}</p>
              <p className="text-blue-200 text-sm">{nextAppt.doctor_specialty}</p>
              <div className="flex items-center gap-4 mt-3">
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
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${
              nextAppt.appointment_type === 'virtual'
                ? 'bg-blue-500 text-white'
                : 'bg-blue-700 text-blue-100'
            }`}>
              {nextAppt.type_display}
            </span>
          </div>
          <Link
            to="/patient/appointments"
            className="mt-4 inline-flex items-center gap-1 text-sm text-blue-200 hover:text-white transition-colors"
          >
            View all appointments <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="bg-gray-100 rounded-2xl p-6 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-700">No upcoming appointments</p>
            <p className="text-sm text-gray-500 mt-0.5">Find a doctor and book your first appointment</p>
          </div>
          <Link to="/patient/doctors" className="btn-primary flex-shrink-0">
            Find a doctor
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, to, color }) => (
          <Link key={to} to={to} className="card-hover flex items-center gap-4">
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

      {/* Quick actions */}
      <div>
        <h2 className="section-title mb-3">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link to="/patient/doctors" className="card-hover flex items-center gap-3 p-4">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
              <Search className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Find a Doctor</p>
              <p className="text-xs text-gray-400">Browse specialists</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
          </Link>

          <Link to="/patient/appointments" className="card-hover flex items-center gap-3 p-4">
            <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Appointments</p>
              <p className="text-xs text-gray-400">View & manage</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
          </Link>

          <Link to="/patient/medications" className="card-hover flex items-center gap-3 p-4">
            <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
              <Pill className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Medications</p>
              <p className="text-xs text-gray-400">Log & track doses</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
          </Link>
        </div>
      </div>

      {/* Recent messages */}
      {(chatData?.results?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Recent messages</h2>
            <Link to="/patient/chat" className="text-sm text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {chatData?.results?.slice(0, 3).map((room) => (
              <Link
                key={room.id}
                to={`/patient/chat/${room.id}`}
                className="card-hover flex items-center gap-3 p-4"
              >
                <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-gray-500" />
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
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
