import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiClient, createWebSocket } from '../../api/client'
import { useUser } from '../../store/authStore'
import { ArrowLeft, Send, Wifi, WifiOff } from 'lucide-react'
import type { ChatRoom as ChatRoomType, Message, WSPayload } from '../../types'

export default function ChatRoom() {
  const { roomId }  = useParams()
  const navigate    = useNavigate()
  const user        = useUser()

  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [connected, setConnected] = useState(false)
  const [wsError,   setWsError]   = useState(false)

  const wsRef    = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  const basePath = window.location.pathname.startsWith('/doctor') ? '/doctor' : '/patient'

  const { data: room } = useQuery({
    queryKey: ['chat', 'room', roomId],
    queryFn: () => apiClient.get<ChatRoomType>(`/chat/rooms/${roomId}/`).then(r => r.data),
    enabled: !!roomId,
  })

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // WebSocket connection
  useEffect(() => {
    if (!roomId) return

    const connect = () => {
      const ws = createWebSocket(roomId)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        setWsError(false)
      }

      ws.onmessage = (event) => {
        const data: WSPayload = JSON.parse(event.data)

        if (data.type === 'history') {
          setMessages(data.messages)
        } else if (data.type === 'message') {
          setMessages((prev) => {
            if (prev.find(m => m.id === data.message_id)) return prev
            return [...prev, {
              id:            data.message_id,
              content:       data.content,
              sender:        data.sender_id,
              sender_name:   data.sender_name,
              sender_avatar: data.sender_avatar,
              is_read:       data.is_read,
              created_at:    data.created_at,
            }]
          })
        }
      }

      ws.onclose = () => {
        setConnected(false)
        setTimeout(() => {
          if (wsRef.current?.readyState !== WebSocket.OPEN) connect()
        }, 3000)
      }

      ws.onerror = () => {
        setWsError(true)
        setConnected(false)
      }
    }

    connect()
    return () => { wsRef.current?.close() }
  }, [roomId])

  const sendMessage = useCallback(() => {
    const content = input.trim()
    if (!content) return

    if (connected && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ message: content }))
    } else {
      apiClient.post(`/chat/rooms/${roomId}/messages/create/`, { content })
        .then(({ data }) => setMessages(prev => [...prev, data]))
    }

    setInput('')
    inputRef.current?.focus()
  }, [input, connected, roomId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })

  const formatDateLabel = (iso: string) =>
    new Date(iso).toLocaleDateString('en-KE', {
      weekday: 'long', month: 'long', day: 'numeric'
    })

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const date = msg.created_at.split('T')[0]
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {} as Record<string, Message[]>)

  // ── Determine if a message was sent by the current user ──────────────────
  // Compare both as strings and trim to handle any whitespace differences
  const isMyMessage = (msg: Message) =>
    String(msg.sender).trim() === String(user?.id).trim()

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0 shadow-sm">
        <button
          onClick={() => navigate(`${basePath}/chat`)}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <span className="text-blue-700 font-semibold text-sm">
            {room?.other_participant_name?.charAt(0) ?? '?'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {room?.other_participant_name ?? 'Loading...'}
          </p>
          <p className="text-xs text-gray-400">
            {room?.appointment_date
              ? `Appt: ${new Date(room.appointment_date).toLocaleDateString('en-KE', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })}`
              : ''}
          </p>
        </div>

        {/* Live / offline indicator */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {connected ? (
            <>
              <Wifi className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-500 hidden sm:block font-medium">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-400 hidden sm:block">
                {wsError ? 'Reconnecting...' : 'Connecting...'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">

        {messages.length === 0 && !wsError && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">No messages yet — say hello! 👋</p>
          </div>
        )}

        {Object.entries(groupedMessages).map(([date, dayMessages]) => (
          <div key={date} className="space-y-3">

            {/* Date divider */}
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 bg-gray-50 px-2 flex-shrink-0">
                {formatDateLabel(date + 'T12:00:00')}
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {dayMessages.map((msg) => {
              const mine = isMyMessage(msg)

              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Other person avatar — left side */}
                  {!mine && (
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mb-1 shadow-sm">
                      <span className="text-blue-700 font-semibold text-xs">
                        {msg.sender_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  <div className={`flex flex-col gap-1 max-w-xs lg:max-w-md ${mine ? 'items-end' : 'items-start'}`}>

                    {/* Sender name — only for received messages */}
                    {!mine && (
                      <span className="text-xs text-gray-500 font-medium px-1">
                        {msg.sender_name}
                      </span>
                    )}

                    {/* Message bubble */}
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      mine
                        ? 'bg-blue-600 text-white rounded-br-none'      // ← MY messages: blue, right side, no bottom-right radius
                        : 'bg-white text-gray-900 rounded-bl-none border border-gray-100'  // ← THEIR messages: white, left side, no bottom-left radius
                    }`}>
                      {msg.content}
                    </div>

                    {/* Timestamp + read receipt */}
                    <div className={`flex items-center gap-1 px-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-xs text-gray-400">
                        {formatTime(msg.created_at)}
                      </span>
                      {mine && (
                        <span className={`text-xs ${msg.is_read ? 'text-blue-500' : 'text-gray-300'}`}>
                          {msg.is_read ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* My avatar — right side */}
                  {mine && (
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mb-1 shadow-sm">
                      <span className="text-white font-semibold text-xs">
                        {user?.first_name?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-3 shadow-sm">
        {wsError && (
          <p className="text-xs text-amber-500 mb-2 text-center">
            ⚠ Connection lost — messages will send when reconnected
          </p>
        )}
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            className="input flex-1 rounded-full"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
