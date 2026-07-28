import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { Search, User, ChevronRight, Droplet } from 'lucide-react'
import type { AdminPatient, PaginatedResponse } from '../../types'

export default function AdminPatients() {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'patients', search],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<AdminPatient>>('/admin/patients/', {
          params: { search: search || undefined },
        })
        .then(r => r.data),
  })

  const patients = data?.results ?? []

  return (
    <div className="page-container space-y-6">

      <div>
        <h1 className="page-title">Patients</h1>
        <p className="text-gray-500 text-sm mt-1">{data?.count ?? 0} registered patients</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          className="input pl-9"
          placeholder="Search by name, email, national ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="card animate-pulse h-16" />)}
        </div>
      )}

      {!isLoading && patients.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <User className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-700">No patients match your search</p>
        </div>
      )}

      <div className="space-y-2">
        {patients.map(p => (
          <Link key={p.id} to={`/admin/patients/${p.id}`} className="card-hover flex items-center gap-4 p-4">

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-gray-900">{p.full_name}</p>
                {!p.is_active && <span className="badge bg-gray-100 text-gray-500">Disabled</span>}
              </div>
              <p className="text-xs text-gray-400">{p.email}</p>
            </div>

            <div className="hidden sm:flex items-center gap-4 text-xs text-gray-400 flex-shrink-0">
              {p.age != null && <span>{p.age} yrs</span>}
              {p.blood_group && (
                <span className="flex items-center gap-1"><Droplet className="w-3 h-3" />{p.blood_group}</span>
              )}
            </div>

            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}