import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient, resolveMediaUrl } from '../../api/client'
import { MessageSquare, Search, Check, CheckCheck } from 'lucide-react'
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

// Short relative "last seen" string for the avatar dot's tooltip.
// e.g. "Last seen 5m ago", "Last seen yesterday"
function formatLastSeen(iso: string | null) {
  if (!iso) return 'Offline'
  const diffMs  = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / (1000 * 60))
  if (minutes < 1)   return 'Last seen just now'
  if (minutes < 60)  return `Last seen ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)    return `Last seen ${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1)    return 'Last seen yesterday'
  return `Last seen ${days}d ago`
}

export default function ChatInbox() {
  const [query, setQuery] = useState('')
  // Room IDs whose avatar image failed to load — falls back to initials
  // instead of the browser's broken-image icon.
  const [brokenAvatars, setBrokenAvatars] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['chat', 'rooms'],
    queryFn: () => apiClient.get<PaginatedResponse<ChatRoom>>('/chat/rooms/')
      .then(r => r.data),
    refetchInterval: 10000,  // poll every 10s for new messages + presence
  })

  const rooms = data?.results ?? []
  const basePath = window.location.pathname.startsWith('/doctor') ? '/doctor' : '/patient'

  const totalUnread = useMemo(
    () => rooms.reduce((sum, r) => sum + r.unread_count, 0),
    [rooms]
  )

  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rooms
    return rooms.filter((r) =>
      r.other_participant_name.toLowerCase().includes(q) ||
      (r.other_participant_specialty ?? '').toLowerCase().includes(q)
    )
  }, [rooms, query])

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="text-gray-500 text-sm mt-1">
            Your conversations with {basePath === '/doctor' ? 'patients' : 'doctors'}
          </p>
        </div>
        {totalUnread > 0 && (
          <span className="flex-shrink-0 bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            {totalUnread} unread
          </span>
        )}
      </div>

      {/* Search */}
      {!isLoading && rooms.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${basePath === '/doctor' ? 'patients' : 'doctors'}...`}
            className="input pl-10 rounded-full"
          />
        </div>
      )}

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

      {/* Empty — no conversations at all */}
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

      {/* Empty — search matched nothing */}
      {!isLoading && rooms.length > 0 && filteredRooms.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-400">No conversations match "{query}"</p>
        </div>
      )}

      {/* Room list — flat rows with hairline dividers, not individual cards */}
      {!isLoading && filteredRooms.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {filteredRooms.map((room, i) => (
            <Link
              key={room.id}
              to={`${basePath}/chat/${room.id}`}
              className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 ${
                i !== filteredRooms.length - 1 ? 'border-b border-gray-100' : ''
              } ${room.unread_count > 0 ? 'bg-blue-50/60' : ''}`}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {room.other_participant_avatar && !brokenAvatars.has(room.id) ? (
                  <img
                    src={resolveMediaUrl(room.other_participant_avatar) ?? undefined}
                    alt={room.other_participant_name}
                    className="w-11 h-11 rounded-full object-cover"
                    onError={() => setBrokenAvatars((prev) => new Set(prev).add(room.id))}
                  />
                ) : (
                  <div className="w-11 h-11 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-700 font-semibold text-sm">
                      {room.other_participant_name.charAt(0)}
                    </span>
                  </div>
                )}

                {/* Unread count badge — top right */}
                {room.unread_count > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full text-white text-xs flex items-center justify-center ring-2 ring-white">
                    {room.unread_count > 9 ? '9+' : room.unread_count}
                  </span>
                )}

                {/* Online / offline presence dot — bottom right */}
                <span
                  title={room.other_participant_online ? 'Online' : formatLastSeen(room.other_participant_last_seen)}
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-white ${
                    room.other_participant_online ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                />
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
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {formatTime(room.last_message_time)}
                    </span>
                  )}
                </div>

                {/* Specialty tag — only present when the other participant is a doctor */}
                {room.other_participant_specialty && (
                  <p className="text-xs text-blue-500 mt-0.5">
                    {room.other_participant_specialty}
                  </p>
                )}

                {/* Last message preview, with read-receipt tick when it's yours */}
                <div className="flex items-center gap-1 mt-0.5">
                  {room.last_message_is_mine && (
                    room.last_message_is_read
                      ? <CheckCheck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      : <Check      className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                  )}
                  <p className={`text-xs truncate ${
                    room.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'
                  }`}>
                    {room.last_message || 'No messages yet'}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}