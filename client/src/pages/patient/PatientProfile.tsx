import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useUser, useAuthStore } from '../../store/authStore'
import { apiClient } from '../../api/client'
import {
  User, Mail, Phone, Shield, Heart,
  AlertCircle, CheckCircle, Camera, Edit3, Save, X
} from 'lucide-react'
import type { PatientProfile } from '../../types'

// ─── Field helpers ─────────────────────────────────────────────────────────────

const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const GENDERS      = [
  { value: '',       label: 'Prefer not to say' },
  { value: 'male',   label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other',  label: 'Other' },
]

// ─── Inline field components ───────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value || <span className="text-gray-400 italic">Not set</span>}</p>
    </div>
  )
}

function TextField({
  label, value, onChange, placeholder = '', textarea = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  textarea?: boolean
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {textarea ? (
        <textarea
          className="input resize-none"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          type="text"
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PatientProfile() {
  const user         = useUser()
  const updateUser   = useAuthStore((s) => s.updateUser)
  const queryClient  = useQueryClient()

  const [editing, setEditing]   = useState(false)
  const [toast, setToast]       = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [avatarLoading, setAvatarLoading] = useState(false)

  // Local draft state — only committed on save
  const [draft, setDraft] = useState({
    date_of_birth:            '',
    gender:                   '' as '' | 'male' | 'female' | 'other',
    blood_group:              '',
    national_id:              '',
    allergies:                '',
    chronic_conditions:       '',
    emergency_contact_name:   '',
    emergency_contact_phone:  '',
  })

  // ── Fetch profile ────────────────────────────────────────────────────────────

  const { data: profile, isLoading } = useQuery({
    queryKey: ['patient-profile'],
    queryFn: () => apiClient.get<PatientProfile>('/patients/me/').then(r => r.data),
  })

  // Sync draft when profile loads
  useEffect(() => {
    if (profile) {
      setDraft({
        date_of_birth:           profile.date_of_birth   ?? '',
        gender:                  (profile.gender         ?? '') as typeof draft.gender,
        blood_group:             profile.blood_group     ?? '',
        national_id:             profile.national_id     ?? '',
        allergies:               profile.allergies       ?? '',
        chronic_conditions:      profile.chronic_conditions ?? '',
        emergency_contact_name:  profile.emergency_contact_name  ?? '',
        emergency_contact_phone: profile.emergency_contact_phone ?? '',
      })
    }
  }, [profile])

  // ── Save mutation ────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (data: typeof draft) =>
      apiClient.patch<PatientProfile>('/patients/me/', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-profile'] })
      setEditing(false)
      showToast('success', 'Profile updated.')
    },
    onError: () => {
      showToast('error', 'Failed to save. Please try again.')
    },
  })

  // ── Avatar upload ────────────────────────────────────────────────────────────

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
      queryClient.invalidateQueries({ queryKey: ['patient-profile'] })
      showToast('success', 'Photo updated.')
    } catch {
      showToast('error', 'Photo upload failed.')
    } finally {
      setAvatarLoading(false)
    }
  }

  // ── Toast ────────────────────────────────────────────────────────────────────

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  const handleCancel = () => {
    // Reset draft to last saved state
    if (profile) {
      setDraft({
        date_of_birth:           profile.date_of_birth   ?? '',
        gender:                  (profile.gender         ?? '') as typeof draft.gender,
        blood_group:             profile.blood_group     ?? '',
        national_id:             profile.national_id     ?? '',
        allergies:               profile.allergies       ?? '',
        chronic_conditions:      profile.chronic_conditions ?? '',
        emergency_contact_name:  profile.emergency_contact_name  ?? '',
        emergency_contact_phone: profile.emergency_contact_phone ?? '',
      })
    }
    setEditing(false)
  }

  const d = (key: keyof typeof draft) => draft[key] as string
  const set = (key: keyof typeof draft) => (v: string) => setDraft({ ...draft, [key]: v })

  // ── Skeleton ─────────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="page-container space-y-6 max-w-2xl">
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-1/4" />
        <div className="card space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-gray-200 rounded-full" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-200 rounded" />)}
        </div>
      </div>
    </div>
  )

  // ── Completion indicator ─────────────────────────────────────────────────────

  const filledFields = [
    profile?.date_of_birth, profile?.gender, profile?.blood_group,
    profile?.national_id, profile?.emergency_contact_name, profile?.emergency_contact_phone,
  ].filter(Boolean).length
  const totalFields   = 6
  const pct           = Math.round((filledFields / totalFields) * 100)
  const profileComplete = pct === 100

  return (
    <div className="page-container space-y-6 max-w-2xl">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
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
          <p className="text-gray-500 text-sm mt-1">Your personal health information</p>
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

      {/* Profile completeness nudge */}
      {!profileComplete && !editing && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-start gap-3">
          <div className="mt-0.5 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">
              Your profile is {pct}% complete
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              Completing your health profile helps doctors give you better care.
            </p>
            <div className="mt-2 h-1.5 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-blue-600 hover:underline flex-shrink-0 mt-1"
          >
            Complete now
          </button>
        </div>
      )}

      {/* ── Account card ──────────────────────────────────────────────────────── */}
      <div className="card space-y-5">
        <div className="flex items-center gap-3 mb-1">
          <User className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Account</h2>
        </div>

        {/* Avatar + name */}
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
            <p className="text-lg font-semibold text-gray-900">{user?.full_name}</p>
            <p className="text-sm text-gray-400">Patient</p>
            {profile?.age && (
              <p className="text-sm text-gray-500 mt-0.5">{profile.age} years old</p>
            )}
          </div>
        </div>

        {/* Read-only account fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
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
        </div>
        <p className="text-xs text-gray-400">
          To update your name, email, or phone number, contact support.
        </p>
      </div>

      {/* ── Health info card ───────────────────────────────────────────────── */}
      <div className="card space-y-5">
        <div className="flex items-center gap-3 mb-1">
          <Heart className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Health Information</h2>
        </div>

        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date of birth */}
              <div>
                <label className="label">Date of birth</label>
                <input
                  type="date"
                  className="input"
                  value={d('date_of_birth')}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => set('date_of_birth')(e.target.value)}
                />
              </div>

              {/* Gender */}
              <div>
                <label className="label">Gender</label>
                <select
                  className="input"
                  value={d('gender')}
                  onChange={(e) => set('gender')(e.target.value)}
                >
                  {GENDERS.map(g => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>

              {/* Blood group */}
              <div>
                <label className="label">Blood group</label>
                <select
                  className="input"
                  value={d('blood_group')}
                  onChange={(e) => set('blood_group')(e.target.value)}
                >
                  {BLOOD_GROUPS.map(bg => (
                    <option key={bg} value={bg}>{bg || 'Unknown'}</option>
                  ))}
                </select>
              </div>

              {/* National ID */}
              <TextField
                label="National ID / Passport"
                value={d('national_id')}
                onChange={set('national_id')}
                placeholder="e.g. 12345678"
              />
            </div>

            <TextField
              label="Allergies"
              value={d('allergies')}
              onChange={set('allergies')}
              placeholder="e.g. Penicillin, Peanuts, Latex (comma-separated)"
              textarea
            />

            <TextField
              label="Chronic conditions"
              value={d('chronic_conditions')}
              onChange={set('chronic_conditions')}
              placeholder="e.g. Diabetes Type 2, Hypertension (comma-separated)"
              textarea
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ReadField
                label="Date of birth"
                value={profile?.date_of_birth
                  ? new Date(profile.date_of_birth).toLocaleDateString('en-KE', {
                      day: 'numeric', month: 'long', year: 'numeric'
                    })
                  : ''}
              />
              <ReadField
                label="Age"
                value={profile?.age ? `${profile.age} yrs` : ''}
              />
              <ReadField
                label="Gender"
                value={GENDERS.find(g => g.value === profile?.gender)?.label || ''}
              />
              <ReadField
                label="Blood group"
                value={profile?.blood_group || ''}
              />
            </div>

            <div>
              <ReadField label="National ID / Passport" value={profile?.national_id || ''} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400 mb-1">Allergies</p>
                {profile?.allergies ? (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.allergies.split(',').map((a, i) => (
                      <span key={i} className="text-xs bg-red-50 text-red-700 px-2.5 py-0.5 rounded-full border border-red-100">
                        {a.trim()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">None recorded</p>
                )}
              </div>

              <div>
                <p className="text-xs text-gray-400 mb-1">Chronic conditions</p>
                {profile?.chronic_conditions ? (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.chronic_conditions.split(',').map((c, i) => (
                      <span key={i} className="text-xs bg-orange-50 text-orange-700 px-2.5 py-0.5 rounded-full border border-orange-100">
                        {c.trim()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">None recorded</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Emergency contact card ─────────────────────────────────────────── */}
      <div className="card space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <AlertCircle className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Emergency Contact</h2>
        </div>

        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              label="Contact name"
              value={d('emergency_contact_name')}
              onChange={set('emergency_contact_name')}
              placeholder="e.g. Grace Mwangi"
            />
            <TextField
              label="Contact phone"
              value={d('emergency_contact_phone')}
              onChange={set('emergency_contact_phone')}
              placeholder="e.g. +254 7XX XXX XXX"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadField
              label="Name"
              value={profile?.emergency_contact_name || ''}
            />
            <ReadField
              label="Phone"
              value={profile?.emergency_contact_phone || ''}
            />
          </div>
        )}

        {!profile?.emergency_contact_name && !editing && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-800">
            Add an emergency contact so medical staff can reach someone on your behalf.
          </div>
        )}
      </div>

      {/* Bottom save bar (sticky when editing on mobile) */}
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
          <button onClick={handleCancel} className="btn-secondary px-5">
            Cancel
          </button>
        </div>
      )}

      {/* Bottom padding when sticky bar is shown */}
      {editing && <div className="sm:hidden h-20" />}
    </div>
  )
}