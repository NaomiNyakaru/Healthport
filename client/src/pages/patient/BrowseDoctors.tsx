import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../../api/client'
import {
  Search, Star, MapPin, Briefcase, Filter,
  Sparkles, AlertTriangle, Loader2, X, ArrowRight
} from 'lucide-react'
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

// Human-readable label lookup for the suggested specialty
const specialtyLabel = (value: string) =>
  SPECIALTIES.find((s) => s.value === value)?.label ?? value

interface TriageResult {
  suggested_specialty: string
  urgency: 'low' | 'medium' | 'high'
  explanation: string
}

export default function BrowseDoctors() {
  const [search,    setSearch]    = useState('')
  const [specialty, setSpecialty] = useState('')
  const [accepting, setAccepting] = useState(false)

  // ── Symptom triage widget ──────────────────────────────────────────────────
  const [showTriage, setShowTriage] = useState(false)
  const [symptoms,   setSymptoms]   = useState('')
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null)

  const triageMutation = useMutation({
    mutationFn: () =>
      apiClient.post<TriageResult>('/ai/triage/', { symptoms })
        .then((r) => r.data),
    onSuccess: (result) => setTriageResult(result),
  })

  const handleTriage = () => {
    if (!symptoms.trim()) return
    setTriageResult(null)
    triageMutation.mutate()
  }

  const applyTriageSuggestion = () => {
    if (!triageResult) return
    setSpecialty(triageResult.suggested_specialty)
    setShowTriage(false)
  }

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

      {/* ── Symptom triage entry point ─────────────────────────────────────── */}
      {!showTriage && (
        <button
          onClick={() => setShowTriage(true)}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border border-blue-100 bg-blue-50/60 hover:bg-blue-50 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Not sure who to see?</p>
            <p className="text-xs text-gray-500">Describe your symptoms and we'll suggest a specialty</p>
          </div>
          <ArrowRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
        </button>
      )}

      {showTriage && (
        <div className="card p-4 space-y-4 border-blue-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-medium text-gray-900">Describe your symptoms</p>
            </div>
            <button
              onClick={() => { setShowTriage(false); setTriageResult(null); setSymptoms('') }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <textarea
            className="input resize-none"
            rows={3}
            placeholder='e.g. "I have had a sharp headache and blurred vision since yesterday"'
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            maxLength={1000}
          />

          <p className="text-xs text-gray-400 -mt-2">
            This is not a diagnosis — it only helps point you to the right kind of doctor.
            If this is an emergency, call 999/112 or go to the nearest hospital.
          </p>

          <button
            onClick={handleTriage}
            disabled={!symptoms.trim() || triageMutation.isPending}
            className="btn-primary w-full"
          >
            {triageMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Get suggestion</>
            )}
          </button>

          {triageMutation.isError && (
            <p className="text-xs text-red-500 text-center">
              Something went wrong. Please try again.
            </p>
          )}

          {/* Result */}
          {triageResult && (
            <div className={`rounded-xl p-4 space-y-3 border ${
              triageResult.urgency === 'high'
                ? 'bg-red-50 border-red-200'
                : 'bg-gray-50 border-gray-200'
            }`}>
              {triageResult.urgency === 'high' ? (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">
                      This may need urgent care
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">{triageResult.explanation}</p>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-500">Suggested:</span>
                    <span className="text-sm font-semibold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                      {specialtyLabel(triageResult.suggested_specialty)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      triageResult.urgency === 'medium'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {triageResult.urgency === 'medium' ? 'See a doctor soon' : 'Routine'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{triageResult.explanation}</p>
                </div>
              )}

              {triageResult.urgency !== 'high' && (
                <button onClick={applyTriageSuggestion} className="btn-secondary w-full text-sm">
                  Show me {specialtyLabel(triageResult.suggested_specialty)} doctors
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
                    ? 'bg-emerald-600 text-white'
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