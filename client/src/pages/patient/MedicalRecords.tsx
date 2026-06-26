import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import {
  Upload, Trash2, Download, AlertCircle,
  FlaskConical, Pill, Stethoscope, Syringe,
  FileText, FolderOpen, X, Lock, Unlock
} from 'lucide-react'
import type { MedicalRecord, PaginatedResponse } from '../../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const RECORD_TYPE_FILTERS = [
  { value: '',             label: 'All' },
  { value: 'lab_result',  label: 'Lab Results' },
  { value: 'prescription',label: 'Prescriptions' },
  { value: 'diagnosis',   label: 'Diagnoses' },
  { value: 'vaccination', label: 'Vaccinations' },
  { value: 'note',        label: 'Notes' },
]

const RECORD_TYPE_OPTIONS = [
  { value: 'lab_result',  label: 'Lab Result' },
  { value: 'prescription',label: 'Prescription' },
  { value: 'diagnosis',   label: 'Diagnosis' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'note',        label: 'General Note' },
]

const typeIcon: Record<string, React.ReactNode> = {
  lab_result:   <FlaskConical className="w-5 h-5" />,
  prescription: <Pill         className="w-5 h-5" />,
  diagnosis:    <Stethoscope  className="w-5 h-5" />,
  vaccination:  <Syringe      className="w-5 h-5" />,
  note:         <FileText     className="w-5 h-5" />,
}

const typeColour: Record<string, string> = {
  lab_result:   'bg-blue-100 text-blue-700',
  prescription: 'bg-green-100 text-green-700',
  diagnosis:    'bg-amber-100 text-amber-700',
  vaccination:  'bg-purple-100 text-purple-700',
  note:         'bg-gray-100 text-gray-600',
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

// ── Component ─────────────────────────────────────────────────────────────────

export default function MedicalRecords() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [filter,      setFilter]      = useState('')
  const [showUpload,  setShowUpload]  = useState(false)
  const [deleteId,    setDeleteId]    = useState<string | null>(null)
  const [uploadError, setUploadError] = useState('')

  // Upload form state
  const [title,        setTitle]        = useState('')
  const [recordType,   setRecordType]   = useState('lab_result')
  const [description,  setDescription]  = useState('')
  const [dateOfRecord, setDateOfRecord] = useState('')
  const [isPrivate,    setIsPrivate]    = useState(false)
  const [file,         setFile]         = useState<File | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['medical-records', filter],
    queryFn: () => {
      const params = filter ? `?record_type=${filter}` : ''
      return apiClient
        .get<PaginatedResponse<MedicalRecord>>(`/patients/me/records/${params}`)
        .then(r => r.data)
    },
  })

  const records = data?.results ?? []

  // ── Upload ─────────────────────────────────────────────────────────────────

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) =>
      apiClient.post('/patients/me/records/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-records'] })
      setShowUpload(false)
      resetForm()
    },
    onError: (err: any) => {
      const d = err.response?.data
      setUploadError(
        d?.title?.[0] || d?.date_of_record?.[0] || d?.attachment?.[0] ||
        d?.message || 'Upload failed. Please try again.'
      )
    },
  })

  // ── Delete ─────────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/patients/me/records/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-records'] })
      setDeleteId(null)
    },
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setTitle('')
    setRecordType('lab_result')
    setDescription('')
    setDateOfRecord('')
    setIsPrivate(false)
    setFile(null)
    setUploadError('')
  }

  const handleUpload = () => {
    if (!title.trim())   { setUploadError('Title is required.'); return }
    if (!dateOfRecord)   { setUploadError('Date is required.'); return }
    setUploadError('')
    const fd = new FormData()
    fd.append('title',          title.trim())
    fd.append('record_type',    recordType)
    fd.append('description',    description.trim())
    fd.append('date_of_record', dateOfRecord)
    fd.append('is_private',     String(isPrivate))
    if (file) fd.append('attachment', file)
    uploadMutation.mutate(fd)
  }

  const today = new Date().toISOString().split('T')[0]

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-container space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Medical Records</h1>
          <p className="text-gray-500 text-sm mt-1">Your personal health vault</p>
        </div>
        <button
          onClick={() => { setShowUpload(true); setUploadError('') }}
          className="btn-primary"
        >
          <Upload className="w-4 h-4" /> Add record
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {RECORD_TYPE_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === value
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Count */}
      {!isLoading && (
        <p className="text-sm text-gray-500">
          {data?.count ?? 0} record{(data?.count ?? 0) !== 1 ? 's' : ''}
        </p>
      )}

      {/* Skeletons */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card animate-pulse">
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

      {/* Empty state */}
      {!isLoading && records.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <FolderOpen className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-700">No records found</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">
            {filter ? 'Try a different filter' : 'Upload your first medical document'}
          </p>
          {!filter && (
            <button onClick={() => setShowUpload(true)} className="btn-primary">
              <Upload className="w-4 h-4" /> Add record
            </button>
          )}
        </div>
      )}

      {/* Records list */}
      {!isLoading && records.length > 0 && (
        <div className="space-y-3">
          {records.map((record) => (
            <div key={record.id} className="card flex items-start gap-4">

              {/* Icon */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                typeColour[record.record_type] ?? 'bg-gray-100 text-gray-600'
              }`}>
                {typeIcon[record.record_type] ?? <FileText className="w-5 h-5" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{record.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {record.record_type_display} · {formatDate(record.date_of_record)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {record.is_private && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Lock className="w-3 h-3" /> Private
                      </span>
                    )}
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      typeColour[record.record_type] ?? 'bg-gray-100 text-gray-600'
                    }`}>
                      {record.record_type_display}
                    </span>
                  </div>
                </div>

                {record.description && (
                  <p className="text-sm text-gray-500 mt-2 line-clamp-2">{record.description}</p>
                )}

                {record.doctor_name && (
                  <p className="text-xs text-gray-400 mt-2">
                    Added by <span className="font-medium text-gray-600">Dr. {record.doctor_name}</span>
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  {record.attachment && (
                    <a
                      href={record.attachment}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> View file
                    </a>
                  )}
                  <button
                    onClick={() => setDeleteId(record.id)}
                    className="btn-danger text-xs px-3 py-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Upload modal ──────────────────────────────────────────────────── */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Add Medical Record</h2>
              <button
                onClick={() => { setShowUpload(false); resetForm() }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {uploadError}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="label">Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="input"
                placeholder='e.g. "CBC Results – Jan 2025"'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Record type */}
            <div>
              <label className="label">Record Type <span className="text-red-500">*</span></label>
              <select
                className="input"
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
              >
                {RECORD_TYPE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="label">Date of Record <span className="text-red-500">*</span></label>
              <input
                type="date"
                className="input"
                max={today}
                value={dateOfRecord}
                onChange={(e) => setDateOfRecord(e.target.value)}
              />
            </div>

            {/* Description */}
            <div>
              <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                className="input resize-none"
                rows={2}
                placeholder="Any notes or context about this record..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* File */}
            <div>
              <label className="label">Attachment <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full border-2 border-dashed rounded-xl px-4 py-5 text-sm transition-colors ${
                  file
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500'
                }`}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span className="font-medium truncate max-w-xs">{file.name}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="w-5 h-5" />
                    <span>Click to attach file</span>
                    <span className="text-xs text-gray-300">PDF, JPG or PNG</span>
                  </div>
                )}
              </button>
            </div>

            {/* Privacy toggle */}
            <label className="flex items-center gap-3 cursor-pointer px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                className="w-4 h-4 accent-blue-600"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              <div className="flex items-center gap-2">
                {isPrivate
                  ? <Lock   className="w-4 h-4 text-gray-500" />
                  : <Unlock className="w-4 h-4 text-gray-400" />
                }
                <div>
                  <p className="text-sm font-medium text-gray-700">Private record</p>
                  <p className="text-xs text-gray-400">Only visible to you, not your doctors</p>
                </div>
              </div>
            </label>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
                className="btn-primary flex-1"
              >
                {uploadMutation.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <><Upload className="w-4 h-4" /> Save record</>
                )}
              </button>
              <button
                onClick={() => { setShowUpload(false); resetForm() }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Delete modal ──────────────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Delete Record</h2>
            <p className="text-sm text-gray-500">
              This will permanently delete the record and any attached file. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="btn-danger flex-1"
              >
                {deleteMutation.isPending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : 'Yes, delete'}
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="btn-secondary flex-1"
              >
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
