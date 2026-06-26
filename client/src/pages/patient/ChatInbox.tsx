import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { MessageSquare, User, Clock } from 'lucide-react'
import type { ChatRoom, PaginatedResponse } from '../../types'

function formatTime(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  const now  = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return date.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7)  return date.toLocaleDateString('en-KE', { weekday: 'short' })
  return date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })
}

export default function ChatInbox() {
  const { data, isLoading } = useQuery({
    queryKey: ['chat', 'rooms'],
    queryFn: () => apiClient.get<PaginatedResponse<ChatRoom>>('/chat/rooms/')
      .then(r => r.data),
    refetchInterval: 10000,  // poll every 10s for new messages
  })

  const rooms = data?.results ?? []
  const basePath = window.location.pathname.startsWith('/doctor') ? '/doctor' : '/patient'

  return (
    <div className="page-container space-y-6">
      <div>
        <h1 className="page-title">Messages</h1>
        <p className="text-gray-500 text-sm mt-1">
          Your conversations with {basePath === '/doctor' ? 'patients' : 'doctors'}
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card animate-pulse flex items-center gap-3 p-4">
              <div className="w-11 h-11 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-200 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && rooms.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-700">No conversations yet</p>
          <p className="text-sm text-gray-400 mt-1">
            {basePath === '/patient'
              ? 'Book an appointment to start chatting with a doctor'
              : 'Conversations will appear here once patients message you'}
          </p>
          {basePath === '/patient' && (
            <Link to="/patient/doctors" className="btn-primary mt-4 inline-flex">
              Find a doctor
            </Link>
          )}
        </div>
      )}

      {/* Room list */}
      {!isLoading && rooms.length > 0 && (
        <div className="space-y-2">
          {rooms.map((room) => (
            <Link
              key={room.id}
              to={`${basePath}/chat/${room.id}`}
              className="card-hover flex items-center gap-3 p-4"
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-11 h-11 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-700 font-semibold text-sm">
                    {room.other_participant_name.charAt(0)}
                  </span>
                </div>
                {room.unread_count > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full text-white text-xs flex items-center justify-center">
                    {room.unread_count > 9 ? '9+' : room.unread_count}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-sm truncate ${
                    room.unread_count > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
                  }`}>
                    {room.other_participant_name}
                  </p>
                  {room.last_message_time && (
                    <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(room.last_message_time)}
                    </span>
                  )}
                </div>
                <p className={`text-xs truncate mt-0.5 ${
                  room.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'
                }`}>
                  {room.last_message || 'No messages yet'}
                </p>
                <p className="text-xs text-gray-300 mt-0.5">
                  Appt: {new Date(room.appointment_date).toLocaleDateString('en-KE', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
