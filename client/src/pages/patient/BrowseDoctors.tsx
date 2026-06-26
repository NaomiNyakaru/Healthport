import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { Search, Star, MapPin, Briefcase, Filter } from 'lucide-react'
import type { DoctorProfile, PaginatedResponse } from '../../types'

const SPECIALTIES = [
  { value: '',                 label: 'All Specialties' },
  { value: 'general_practice', label: 'General Practice' },
  { value: 'cardiology',       label: 'Cardiology' },
  { value: 'dermatology',      label: 'Dermatology' },
  { value: 'gynaecology',      label: 'Gynaecology' },
  { value: 'neurology',        label: 'Neurology' },
  { value: 'oncology',         label: 'Oncology' },
  { value: 'ophthalmology',    label: 'Ophthalmology' },
  { value: 'orthopaedics',     label: 'Orthopaedics' },
  { value: 'paediatrics',      label: 'Paediatrics' },
  { value: 'psychiatry',       label: 'Psychiatry' },
  { value: 'radiology',        label: 'Radiology' },
  { value: 'surgery',          label: 'Surgery' },
  { value: 'dentistry',        label: 'Dentistry' },
]

export default function BrowseDoctors() {
  const [search,    setSearch]    = useState('')
  const [specialty, setSpecialty] = useState('')
  const [accepting, setAccepting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['doctors', search, specialty, accepting],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search)    params.set('search',    search)
      if (specialty) params.set('specialty', specialty)
      if (accepting) params.set('accepting', 'true')
      return apiClient.get<PaginatedResponse<DoctorProfile>>(
        `/doctors/?${params.toString()}`
      ).then(r => r.data)
    },
    staleTime: 30000,
  })

  const doctors = data?.results ?? []

  return (
    <div className="page-container space-y-6">
      <div>
        <h1 className="page-title">Find a Doctor</h1>
        <p className="text-gray-500 text-sm mt-1">
          Browse verified doctors and book an appointment
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search by name, specialty or hospital..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Specialty filter */}
          <div className="relative flex-1">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              className="input pl-9 appearance-none"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            >
              {SPECIALTIES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Accepting patients toggle */}
          <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              className="w-4 h-4 accent-blue-600"
              checked={accepting}
              onChange={(e) => setAccepting(e.target.checked)}
            />
            <span className="text-sm text-gray-700 whitespace-nowrap">
              Accepting patients
            </span>
          </label>
        </div>
      </div>

      {/* Results count */}
      {!isLoading && (
        <p className="text-sm text-gray-500">
          {data?.count ?? 0} doctor{(data?.count ?? 0) !== 1 ? 's' : ''} found
        </p>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-3 bg-gray-200 rounded" />
                <div className="h-3 bg-gray-200 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Doctor cards */}
      {!isLoading && doctors.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-700">No doctors found</p>
          <p className="text-sm text-gray-400 mt-1">
            Try adjusting your search or filters
          </p>
        </div>
      )}

      {!isLoading && doctors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {doctors.map((doctor) => (
            <Link
              key={doctor.id}
              to={`/patient/doctors/${doctor.id}`}
              className="card-hover flex flex-col gap-4"
            >
              {/* Avatar + name */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  {doctor.avatar ? (
                    <img
                      src={doctor.avatar}
                      className="w-12 h-12 rounded-full object-cover"
                      alt=""
                    />
                  ) : (
                    <span className="text-blue-700 font-semibold">
                      {doctor.full_name.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    Dr. {doctor.full_name}
                  </p>
                  <p className="text-sm text-blue-600">{doctor.specialty_display}</p>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1.5 flex-1">
                {doctor.hospital_affiliation && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{doctor.hospital_affiliation}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{doctor.years_of_experience} years experience</span>
                </div>
                {parseFloat(doctor.average_rating) > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                    <span>{doctor.average_rating} ({doctor.total_reviews} reviews)</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div>
                  {doctor.consultation_fee ? (
                    <p className="text-sm font-semibold text-gray-900">
                      KES {parseFloat(doctor.consultation_fee).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Fee on request</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  doctor.is_accepting_patients
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {doctor.is_accepting_patients ? 'Available' : 'Unavailable'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
