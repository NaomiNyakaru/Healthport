import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useUser, useAuthStore } from '../../store/authStore'
import { apiClient } from '../../api/client'
import {
  User, Mail, Phone, ShieldCheck, Star,
  Briefcase, MapPin, DollarSign, Edit3, Save, X,
  CheckCircle, AlertCircle, Camera, ToggleLeft, ToggleRight,
  Clock
} from 'lucide-react'
import type { DoctorProfile } from '../../types'

// ─── Constants ─────────────────────────────────────────────────────────────────

const SPECIALTIES = [
  { value: 'general_practice', label: 'General Practice' },
  { value: 'cardiology',       label: 'Cardiology' },
  { value: 'dermatology',      label: 'Dermatology' },
  { value: 'gynaecology',      label: 'Gynaecology & Obstetrics' },
  { value: 'neurology',        label: 'Neurology' },
  { value: 'oncology',         label: 'Oncology' },
  { value: 'ophthalmology',    label: 'Ophthalmology' },
  { value: 'orthopaedics',     label: 'Orthopaedics' },
  { value: 'paediatrics',      label: 'Paediatrics' },
  { value: 'psychiatry',       label: 'Psychiatry' },
  { value: 'radiology',        label: 'Radiology' },
  { value: 'surgery',          label: 'Surgery' },
  { value: 'dentistry',        label: 'Dentistry' },
  { value: 'other',            label: 'Other' },
]

// ─── Small helpers ──────────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">
        {value || <span className="italic text-gray-400">Not set</span>}
      </p>
    </div>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function DoctorProfile() {
  const user       = useUser()
  const updateUser = useAuthStore((s) => s.updateUser)
  const queryClient = useQueryClient()

  const [editing, setEditing]       = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [toast, setToast]           = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const [draft, setDraft] = useState({
    bio:                   '',
    hospital_affiliation:  '',
    consultation_fee:      '',
    is_accepting_patients: true,
    specialty:             'general_practice',
    years_of_experience:   0,
  })

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const { data: profile, isLoading } = useQuery({
    queryKey: ['doctor-profile-me'],
    queryFn: () => apiClient.get<DoctorProfile>('/doctors/me/').then(r => r.data),
  })

  useEffect(() => {
    if (profile) {
      setDraft({
        bio:                   profile.bio                   ?? '',
        hospital_affiliation:  profile.hospital_affiliation  ?? '',
        consultation_fee:      profile.consultation_fee      ?? '',
        is_accepting_patients: profile.is_accepting_patients ?? true,
        specialty:             profile.specialty             ?? 'general_practice',
        years_of_experience:   profile.years_of_experience   ?? 0,
      })
    }
  }, [profile])

  // ── Save ──────────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (data: typeof draft) =>
      apiClient.patch<DoctorProfile>('/doctors/me/', {
        ...data,
        consultation_fee: data.consultation_fee === '' ? null : data.consultation_fee,
      }).then(r => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['doctor-profile-me'], updated)
      // Also update sidebar verification badge info via authStore
      updateUser({ is_verified: updated.is_verified })
      setEditing(false)
      showToast('success', 'Profile updated.')
    },
    onError: () => showToast('error', 'Failed to save. Please try again.'),
  })

  // ── Availability quick-toggle (outside edit mode) ─────────────────────────────

  const toggleMutation = useMutation({
    mutationFn: (val: boolean) =>
      apiClient.patch<DoctorProfile>('/doctors/me/', { is_accepting_patients: val }).then(r => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['doctor-profile-me'], updated)
      showToast(
        'success',
        updated.is_accepting_patients ? 'You are now accepting patients.' : 'You are no longer accepting new patients.'
      )
    },
    onError: () => showToast('error', 'Could not update availability.'),
  })

  // ── Avatar ────────────────────────────────────────────────────────────────────

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarLoading(true)
    try {
      const form = new FormData()
      form.append('avatar', file)
      const { data } = await apiClient.patch('/auth/me/avatar/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      updateUser({ avatar: data.avatar })
      queryClient.invalidateQueries({ queryKey: ['doctor-profile-me'] })
      showToast('success', 'Photo updated.')
    } catch {
      showToast('error', 'Photo upload failed.')
    } finally {
      setAvatarLoading(false)
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────────────

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const handleCancel = () => {
    if (profile) {
      setDraft({
        bio:                   profile.bio                   ?? '',
        hospital_affiliation:  profile.hospital_affiliation  ?? '',
        consultation_fee:      profile.consultation_fee      ?? '',
        is_accepting_patients: profile.is_accepting_patients ?? true,
        specialty:             profile.specialty             ?? 'general_practice',
        years_of_experience:   profile.years_of_experience   ?? 0,
      })
    }
    setEditing(false)
  }

  const set = <K extends keyof typeof draft>(key: K) => (val: typeof draft[K]) =>
    setDraft(d => ({ ...d, [key]: val }))

  // ── Skeleton ──────────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="page-container space-y-6 max-w-2xl">
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-1/4" />
        <div className="card space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-200 rounded" />)}
        </div>
      </div>
    </div>
  )

  const verificationStatus = profile?.verification_status ?? 'pending'

  return (
    <div className="page-container space-y-6 max-w-2xl">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4" />
            : <AlertCircle className="w-4 h-4" />
          }
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="text-gray-500 text-sm mt-1">Your professional information</p>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="btn-secondary">
            <Edit3 className="w-4 h-4" /> Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
              className="btn-primary"
            >
              {saveMutation.isPending ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
              ) : (
                <><Save className="w-4 h-4" /> Save</>
              )}
            </button>
            <button onClick={handleCancel} className="btn-secondary">
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        )}
      </div>

      {/* Verification banner */}
      {verificationStatus !== 'verified' && (
        <div className={`rounded-2xl px-5 py-4 flex items-start gap-3 ${
          verificationStatus === 'rejected'
            ? 'bg-red-50 border border-red-100'
            : 'bg-yellow-50 border border-yellow-100'
        }`}>
          <ShieldCheck className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
            verificationStatus === 'rejected' ? 'text-red-500' : 'text-yellow-500'
          }`} />
          <div>
            <p className={`text-sm font-medium ${
              verificationStatus === 'rejected' ? 'text-red-800' : 'text-yellow-800'
            }`}>
              {verificationStatus === 'rejected'
                ? 'Verification rejected'
                : 'Verification pending'
              }
            </p>
            <p className={`text-xs mt-0.5 ${
              verificationStatus === 'rejected' ? 'text-red-600' : 'text-yellow-600'
            }`}>
              {profile?.verification_note ||
                (verificationStatus === 'rejected'
                  ? 'Your KMPDC number could not be confirmed.'
                  : 'Your KMPDC number is being reviewed. Usually takes 1–2 business days.')
              }
            </p>
          </div>
        </div>
      )}

      {/* ── Account card ─────────────────────────────────────────────────────── */}
      <div className="card space-y-5">
        <div className="flex items-center gap-3 mb-1">
          <User className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Account</h2>
        </div>

        {/* Avatar + identity */}
        <div className="flex items-center gap-5">
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden">
              {user?.avatar ? (
                <img src={user.avatar} className="w-20 h-20 object-cover" alt="" />
              ) : (
                <span className="text-2xl font-bold text-blue-600">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </span>
              )}
            </div>
            <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center cursor-pointer shadow-sm hover:bg-gray-50 transition-colors">
              {avatarLoading
                ? <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                : <Camera className="w-3.5 h-3.5 text-gray-500" />
              }
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-gray-900">Dr. {user?.full_name}</p>
              {profile?.is_verified && (
                <ShieldCheck className="w-4 h-4 text-green-500" aria-label="Verified" />
              )}
            </div>
            <p className="text-sm text-blue-600">{profile?.specialty_display}</p>
            {(profile?.average_rating && parseFloat(profile.average_rating) > 0) ? (
              <div className="flex items-center gap-1 mt-1">
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                <span className="text-sm text-gray-600">
                  {profile.average_rating} · {profile.total_reviews} review{profile.total_reviews !== 1 ? 's' : ''}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Read-only account fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="truncate">{user?.email}</span>
          </div>
          {user?.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span>{user.phone}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-600 sm:col-span-2">
            <ShieldCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
              {profile?.kmpdc_number}
            </span>
            <span className="text-xs text-gray-400">KMPDC number · locked</span>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Name, email, phone, and KMPDC number cannot be changed here. Contact support if needed.
        </p>
      </div>

      {/* ── Availability card ─────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Availability</h2>
            </div>
            <p className="text-sm text-gray-600">
              {profile?.is_accepting_patients
                ? 'You are currently accepting new patients.'
                : 'You are not accepting new patients right now.'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              When off, patients cannot book appointments with you.
            </p>
          </div>
          <button
            onClick={() => {
              if (!editing) {
                toggleMutation.mutate(!profile?.is_accepting_patients)
              } else {
                set('is_accepting_patients')(!draft.is_accepting_patients)
              }
            }}
            disabled={toggleMutation.isPending}
            className="flex-shrink-0 ml-4"
            title={
              (editing ? draft.is_accepting_patients : profile?.is_accepting_patients)
                ? 'Turn off'
                : 'Turn on'
            }
          >
            {(editing ? draft.is_accepting_patients : profile?.is_accepting_patients) ? (
              <ToggleRight className="w-10 h-10 text-green-500 hover:text-green-600 transition-colors" />
            ) : (
              <ToggleLeft className="w-10 h-10 text-gray-300 hover:text-gray-400 transition-colors" />
            )}
          </button>
        </div>
      </div>

      {/* ── Professional card ─────────────────────────────────────────────────── */}
      <div className="card space-y-5">
        <div className="flex items-center gap-3 mb-1">
          <Briefcase className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Professional Details</h2>
        </div>

        {editing ? (
          <div className="space-y-4">
            {/* Specialty + experience */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Specialty</label>
                <select
                  className="input"
                  value={draft.specialty}
                  onChange={(e) => set('specialty')(e.target.value)}
                >
                  {SPECIALTIES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Years of experience</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  className="input"
                  value={draft.years_of_experience}
                  onChange={(e) => set('years_of_experience')(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Hospital */}
            <div>
              <label className="label">Hospital / clinic affiliation</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Kenyatta National Hospital"
                value={draft.hospital_affiliation}
                onChange={(e) => set('hospital_affiliation')(e.target.value)}
              />
            </div>

            {/* Consultation fee */}
            <div>
              <label className="label">Consultation fee (KES)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">KES</span>
                <input
                  type="number"
                  min={0}
                  className="input pl-12"
                  placeholder="e.g. 2500"
                  value={draft.consultation_fee}
                  onChange={(e) => set('consultation_fee')(e.target.value)}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Leave blank to display "Fee on request"</p>
            </div>

            {/* Bio */}
            <div>
              <label className="label">Bio</label>
              <textarea
                className="input resize-none"
                rows={4}
                placeholder="Tell patients about your background, approach to care, and areas of expertise..."
                value={draft.bio}
                onChange={(e) => set('bio')(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                {draft.bio.length}/500 characters — shown on your public profile
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <ReadField
                label="Specialty"
                value={profile?.specialty_display}
              />
              <ReadField
                label="Experience"
                value={profile?.years_of_experience != null ? `${profile.years_of_experience} years` : null}
              />
              <ReadField
                label="Consultation fee"
                value={
                  profile?.consultation_fee
                    ? `KES ${parseFloat(profile.consultation_fee).toLocaleString()}`
                    : 'Fee on request'
                }
              />
            </div>

            <div className="flex items-start gap-2 text-sm text-gray-600 pt-2 border-t border-gray-100">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <span>{profile?.hospital_affiliation || <span className="italic text-gray-400">No affiliation set</span>}</span>
            </div>

            {profile?.bio ? (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">Bio</p>
                <p className="text-sm text-gray-700 leading-relaxed">{profile.bio}</p>
              </div>
            ) : (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">Bio</p>
                <p className="text-sm italic text-gray-400">
                  No bio yet — add one to help patients understand your expertise.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile sticky save bar */}
      {editing && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 z-30">
          <button
            onClick={() => saveMutation.mutate(draft)}
            disabled={saveMutation.isPending}
            className="btn-primary flex-1 py-2.5"
          >
            {saveMutation.isPending
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
              : <><Save className="w-4 h-4" /> Save changes</>
            }
          </button>
          <button onClick={handleCancel} className="btn-secondary px-5">Cancel</button>
        </div>
      )}
      {editing && <div className="sm:hidden h-20" />}
    </div>
  )
}
