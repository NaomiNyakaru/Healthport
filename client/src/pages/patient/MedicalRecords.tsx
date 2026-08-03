import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import {
  Download, Image as ImageIcon, FileType2,
  FolderOpen, Lock,
} from 'lucide-react'
import type { MedicalRecord, PaginatedResponse } from '../../types'

const RECORD_TYPE_FILTERS = [
  { value: '',             label: 'All' },
  { value: 'lab_result',   label: 'Lab Results' },
  { value: 'prescription', label: 'Prescriptions' },
  { value: 'diagnosis',    label: 'Diagnosis' },
  { value: 'surgery',      label: 'Surgeries' },
  { value: 'allergy',      label: 'Allergies' },
  { value: 'vaccination',  label: 'Vaccinations' },
  { value: 'note',         label: 'Notes' },
]

const typeStyle: Record<string, { chip: string; accent: string }> = {
  lab_result:   { chip: 'bg-blue-50 text-blue-600',     accent: 'border-l-blue-400' },
  prescription: { chip: 'bg-green-50 text-green-600',   accent: 'border-l-green-400' },
  diagnosis:    { chip: 'bg-amber-50 text-amber-600',   accent: 'border-l-amber-400' },
  surgery:      { chip: 'bg-red-50 text-red-600',       accent: 'border-l-red-400' },
  allergy:      { chip: 'bg-orange-50 text-orange-600', accent: 'border-l-orange-400' },
  vaccination:  { chip: 'bg-purple-50 text-purple-600', accent: 'border-l-purple-400' },
  note:         { chip: 'bg-gray-100 text-gray-500',    accent: 'border-l-gray-300' },
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif'])

const fileExt = (name: string) => (name.split('.').pop() ?? '').toLowerCase()

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })

export default function MedicalRecords() {
  const [filter, setFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['medical-records', filter],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<MedicalRecord>>('/patients/me/records/', {
          params: filter ? { record_type: filter } : undefined,
        })
        .then(r => r.data),
  })

  const records = (data?.results ?? []).filter(r => !filter || r.record_type === filter)

  const groups: { label: string; items: MedicalRecord[] }[] = []
  for (const record of records) {
    const label = monthLabel(record.date_of_record)
    const current = groups[groups.length - 1]
    if (current && current.label === label) {
      current.items.push(record)
    } else {
      groups.push({ label, items: [record] })
    }
  }

  const activeFilterLabel = RECORD_TYPE_FILTERS.find(f => f.value === filter)?.label

  return (
    <div className="page-container space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Medical Records</h1>
          <p className="text-gray-500 text-sm mt-1">
            Logged by your doctors after appointments
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {RECORD_TYPE_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
              filter === value
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!isLoading && (
        <p className="text-sm text-gray-500">
          {records.length} record{records.length !== 1 ? 's' : ''}
        </p>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card border-l-4 border-l-gray-200 animate-pulse">
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 bg-gray-200 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && records.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <FolderOpen className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-700">
            {filter ? `No ${activeFilterLabel?.toLowerCase()} yet` : 'No records found'}
          </p>
          <p className="text-sm text-gray-400 mt-1 mb-6">
            {filter
              ? 'Try a different filter, or check back after your next appointment'
              : 'Your doctor will add records here after your appointments'}
          </p>
        </div>
      )}

      {!isLoading && records.length > 0 && (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.label} className="space-y-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
                {group.label}
              </h2>

              {group.items.map((record) => {
                const style = typeStyle[record.record_type] ?? typeStyle.note
                return (
                  <div
                    key={record.id}
                    className={`card border-l-4 ${style.accent} flex items-start gap-4`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{record.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {record.record_type_display} · {formatDate(record.date_of_record)}
                          </p>
                        </div>
                        {record.is_private && (
                          <span className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                            <Lock className="w-3 h-3" /> Private
                          </span>
                        )}
                      </div>

                      {record.description && (
                        <p className="text-sm text-gray-600 mt-2 leading-relaxed whitespace-pre-line">
                          {record.description}
                        </p>
                      )}

                      {record.doctor_name && (
                        <div className="flex items-center gap-1.5 mt-3">
                          <p className="text-xs text-gray-400">
                            Added by <span className="font-medium text-gray-600">Dr. {record.doctor_name}</span>
                          </p>
                        </div>
                      )}

                      {record.attachments?.length > 0 && (
                        <div className="flex gap-2 mt-3 flex-wrap">
                          {record.attachments.map(att => {
                            const isImage = IMAGE_EXTENSIONS.has(fileExt(att.original_filename))
                            return (
                              <a
                                key={att.id}
                                href={att.file}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={att.original_filename}
                                className="inline-flex items-center gap-1.5 text-xs bg-gray-50 border border-gray-200 text-gray-600 rounded-lg pl-2 pr-3 py-1.5 max-w-[180px] hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                {isImage
                                  ? <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                  : <FileType2 className="w-3.5 h-3.5 flex-shrink-0" />
                                }
                                <span className="truncate">{att.original_filename || 'View file'}</span>
                                <Download className="w-3 h-3 flex-shrink-0 opacity-50" />
                              </a>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}