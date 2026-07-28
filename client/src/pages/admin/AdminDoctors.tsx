import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import {
  Search, Stethoscope, CheckCircle, XCircle, X,
  ShieldCheck, Building2,
} from 'lucide-react'
import type { AdminDoctor, PaginatedResponse } from '../../types'

const statusBadge: Record<string, string> = {
  pending:  'badge-pending',
  verified: 'badge-verified',
  rejected: 'badge-cancelled',
}

// ── Verify / reject modal ───────────────────────────────────────────────────

function VerifyModal({
  doctor, action, onClose, onDone,
}: {
  doctor: AdminDoctor
  action: 'verify' | 'reject'
  onClose: () => void
  onDone: () => void
}) {
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      await apiClient.post(`/doctors/${doctor.id}/admin-verify/`, { action, note })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">
            {action === 'verify' ? 'Verify' : 'Reject'} Dr. {doctor.full_name}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-sm text-gray-500">
            KMPDC number <span className="font-medium text-gray-700">{doctor.kmpdc_number}</span>
          </p>
          <div>
            <label className="label">Note {action === 'reject' && '(shown to the doctor)'}</label>
            <textarea
              className="input min-h-[80px]"
              placeholder={action === 'verify' ? 'KMPDC number confirmed.' : 'Number not found in registry.'}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className={action === 'verify' ? 'btn-primary' : 'btn-danger'}
            disabled={saving}
            onClick={submit}
          >
            {saving ? 'Saving…' : action === 'verify' ? 'Confirm verification' : 'Confirm rejection'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Row action buttons ───────────────────────────────────────────────────────
//
// Keep this symmetric across all three states so a resolved doctor never
// shows a live action for the opposite outcome: pending shows both buttons
// active; verified shows a greyed check + an active reject (in case of a
// mistake); rejected shows an active verify + a greyed X. What we must never
// do is show BOTH an active button and its own resolved state at once,
// which is exactly the bug this replaces (reject stayed clickable forever).

function DoctorRowActions({
  doctor, onAction,
}: {
  doctor: AdminDoctor
  onAction: (action: 'verify' | 'reject') => void
}) {
  if (doctor.verification_status === 'pending') {
    return (
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={() => onAction('verify')}
          className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
          title="Verify"
        >
          <CheckCircle className="w-4 h-4" />
        </button>
        <button
          onClick={() => onAction('reject')}
          className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
          title="Reject"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>
    )
  }

  if (doctor.verification_status === 'verified') {
    return (
      <div className="flex gap-2 flex-shrink-0">
        <span className="p-1.5 text-gray-300" title="Verified">
          <ShieldCheck className="w-4 h-4" />
        </span>
      </div>
    )
  }

  // rejected
  return (
    <div className="flex gap-2 flex-shrink-0">
      <span className="p-1.5 text-gray-300" title="Rejected">
        <XCircle className="w-4 h-4" />
      </span>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AdminDoctors() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState<{ doctor: AdminDoctor; action: 'verify' | 'reject' } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'doctors', search, statusFilter],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<AdminDoctor>>('/admin/doctors/', {
          params: { search: search || undefined, verification_status: statusFilter || undefined },
        })
        .then(r => r.data),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'doctors'] })
    setModal(null)
  }

  const doctors = data?.results ?? []

  const setStatus = (status: string) => {
    if (status) setSearchParams({ status })
    else setSearchParams({})
  }

  return (
    <div className="page-container space-y-6">

      <div>
        <h1 className="page-title">Doctors</h1>
        <p className="text-gray-500 text-sm mt-1">{data?.count ?? 0} registered doctors</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by name, KMPDC number, hospital…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { label: 'All',      value: '' },
            { label: 'Pending',  value: 'pending' },
            { label: 'Verified', value: 'verified' },
            { label: 'Rejected', value: 'rejected' },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card animate-pulse h-20" />
          ))}
        </div>
      )}

      {!isLoading && doctors.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Stethoscope className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-700">No doctors match this filter</p>
        </div>
      )}

      <div className="space-y-2">
        {doctors.map(doc => (
          <div key={doc.id} className="card flex items-start gap-4 p-4">

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-gray-900">Dr. {doc.full_name}</p>
                <span className={statusBadge[doc.verification_status] ?? 'badge'}>
                  {doc.verification_status_display}
                </span>
                {!doc.is_active && <span className="badge bg-gray-100 text-gray-500">Account disabled</span>}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{doc.email}</p>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-gray-400">
                <span>{doc.specialty_display}</span>
                <span>KMPDC {doc.kmpdc_number}</span>
                {doc.hospital_affiliation && (
                  <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{doc.hospital_affiliation}</span>
                )}
              </div>
            </div>

            <DoctorRowActions doctor={doc} onAction={action => setModal({ doctor: doc, action })} />
          </div>
        ))}
      </div>

      {modal && (
        <VerifyModal
          doctor={modal.doctor}
          action={modal.action}
          onClose={() => setModal(null)}
          onDone={refresh}
        />
      )}
    </div>
  )
}