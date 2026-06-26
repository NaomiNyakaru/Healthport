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

  const [messages,   setMessages]   = useState<Message[]>([])
  const [input,      setInput]      = useState('')
  const [connected,  setConnected]  = useState(false)
  const [wsError,    setWsError]    = useState(false)

  const wsRef       = useRef<WebSocket | null>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLInputElement>(null)

  const basePath = window.location.pathname.startsWith('/doctor') ? '/doctor' : '/patient'

  // Fetch room details
  const { data: room } = useQuery({
    queryKey: ['chat', 'room', roomId],
    queryFn: () => apiClient.get<ChatRoomType>(`/chat/rooms/${roomId}/`).then(r => r.data),
    enabled: !!roomId,
  })

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Connect WebSocket
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
          // Initial history load on connect
          setMessages(data.messages)
        } else if (data.type === 'message') {
          // New real-time message
          setMessages((prev) => {
            // Avoid duplicates
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
        // Reconnect after 3 seconds if not intentional
        setTimeout(() => {
          if (wsRef.current?.readyState !== WebSocket.OPEN) {
            connect()
          }
        }, 3000)
      }

      ws.onerror = () => {
        setWsError(true)
        setConnected(false)
      }
    }

    connect()

    return () => {
      wsRef.current?.close()
    }
  }, [roomId])

  const sendMessage = useCallback(() => {
    const content = input.trim()
    if (!content) return

    if (connected && wsRef.current?.readyState === WebSocket.OPEN) {
      // Send via WebSocket
      wsRef.current.send(JSON.stringify({ message: content }))
    } else {
      // Fallback — send via REST
      apiClient.post(`/chat/rooms/${roomId}/messages/create/`, { content })
        .then(({ data }) => {
          setMessages(prev => [...prev, data])
        })
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

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-KE', { weekday: 'long', month: 'long', day: 'numeric' })

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const date = msg.created_at.split('T')[0]
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {} as Record<string, Message[]>)

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
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
          <p className="font-medium text-gray-900 text-sm truncate">
            {room?.other_participant_name ?? 'Loading...'}
          </p>
          <p className="text-xs text-gray-400">
            Appt: {room?.appointment_date
              ? new Date(room.appointment_date).toLocaleDateString('en-KE', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })
              : ''}
          </p>
        </div>

        {/* Connection indicator */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {connected ? (
            <>
              <Wifi className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-500 hidden sm:block">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-400 hidden sm:block">
                {wsError ? 'Error' : 'Connecting...'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">
              No messages yet. Say hello!
            </p>
          </div>
        )}

        {Object.entries(groupedMessages).map(([date, dayMessages]) => (
          <div key={date}>
            {/* Date divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatDate(date + 'T00:00:00')}
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Messages for this day */}
            <div className="space-y-2">
              {dayMessages.map((msg) => {
                const isMe = msg.sender === user?.id
                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    {/* Other person's avatar */}
                    {!isMe && (
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mb-1">
                        <span className="text-blue-700 font-semibold text-xs">
                          {msg.sender_name.charAt(0)}
                        </span>
                      </div>
                    )}

                    <div className={`max-w-xs lg:max-w-md ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                      {/* Sender name for received messages */}
                      {!isMe && (
                        <span className="text-xs text-gray-400 px-1">{msg.sender_name}</span>
                      )}

                      {/* Bubble */}
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isMe
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-white text-gray-900 shadow-sm border border-gray-100 rounded-bl-sm'
                      }`}>
                        {msg.content}
                      </div>

                      {/* Timestamp */}
                      <span className={`text-xs text-gray-400 px-1 ${isMe ? 'text-right' : ''}`}>
                        {formatTime(msg.created_at)}
                        {isMe && msg.is_read && (
                          <span className="ml-1 text-blue-400">✓✓</span>
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-3">
        {wsError && (
          <p className="text-xs text-red-500 mb-2 text-center">
            Connection lost. Messages will be sent when reconnected.
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            className="input flex-1 rounded-full px-4"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
