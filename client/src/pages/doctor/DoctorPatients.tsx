import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { Search, User, Calendar, ChevronRight } from 'lucide-react'
import type { Appointment, PaginatedResponse } from '../../types'

// Derive a unique patient list from all appointments
function useMyPatients() {
  const { data, isLoading } = useQuery({
    queryKey: ['doctor-all-appointments'],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<Appointment>>('/appointments/')
        .then(r => r.data),
  })

  const patients = useMemo(() => {
    if (!data?.results) return []
    const seen = new Set<string>()
    const list: {
      id: string
      name: string
      avatar: string | null
      lastAppt: Appointment
      totalAppts: number
    }[] = []

    // Sort appointments newest-first so lastAppt is accurate
    const sorted = [...data.results].sort(
      (a, b) =>
        new Date(b.appointment_date).getTime() -
        new Date(a.appointment_date).getTime()
    )

    for (const appt of sorted) {
      if (!seen.has(appt.patient)) {
        seen.add(appt.patient)
        list.push({
          id:          appt.patient,
          name:        appt.patient_name,
          avatar:      appt.patient_avatar,
          lastAppt:    appt,
          totalAppts:  data.results.filter(a => a.patient === appt.patient).length,
        })
      }
    }
    return list
  }, [data])

  return { patients, isLoading, total: patients.length }
}

// ── Status badge colour ──────────────────────────────────────────────────────

const statusClass: Record<string, string> = {
  pending:   'badge-pending',
  confirmed: 'badge-confirmed',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

// ── Component ────────────────────────────────────────────────────────────────

export default function DoctorPatients() {
  const [search, setSearch] = useState('')
  const { patients, isLoading, total } = useMyPatients()

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page-container space-y-6">

      {/* Header */}
      <div>
        <h1 className="page-title">My Patients</h1>
        <p className="text-gray-500 text-sm mt-1">
          {total} patient{total !== 1 ? 's' : ''} who have had appointments with you
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          className="input pl-9"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card animate-pulse flex items-center gap-4">
              <div className="w-11 h-11 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <User className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-700">
            {search ? 'No patients match your search' : 'No patients yet'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {search
              ? 'Try a different name'
              : 'Patients appear here once you have at least one appointment with them'}
          </p>
        </div>
      )}

      {/* Patient list */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(p => (
            <Link
              key={p.id}
              to={`/doctor/patients/${p.id}`}
              className="card-hover flex items-center gap-4 p-4"
            >
              {/* Avatar */}
              <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                {p.avatar ? (
                  <img
                    src={p.avatar}
                    className="w-11 h-11 rounded-full object-cover"
                    alt=""
                  />
                ) : (
                  <span className="text-sm font-semibold text-gray-600">
                    {p.name.charAt(0)}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Calendar className="w-3 h-3" />
                    Last: {formatDate(p.lastAppt.appointment_date)}
                  </span>
                  <span className={`${statusClass[p.lastAppt.status] || 'badge'} text-[10px]`}>
                    {p.lastAppt.status_display}
                  </span>
                </div>
              </div>

              {/* Appointment count */}
              <div className="text-right flex-shrink-0 hidden sm:block">
                <p className="text-sm font-semibold text-gray-700">{p.totalAppts}</p>
                <p className="text-xs text-gray-400">
                  visit{p.totalAppts !== 1 ? 's' : ''}
                </p>
              </div>

              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}