import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import {
  Search, Plus, X, User as Trash2,
  CheckCircle2, XCircle
} from 'lucide-react'
import type { AdminUser, PaginatedResponse, UserRole } from '../../types'

const roleBadge: Record<string, string> = {
  patient: 'bg-emerald-600 text-white',
  doctor:  'bg-blue-500 text-white',
  admin:   'bg-gray-500 text-white',
}

// ── Create / edit modal ─────────────────────────────────────────────────────

interface UserFormProps {
  user: AdminUser | null
  onClose: () => void
  onSaved: () => void
}

function UserFormModal({ user, onClose, onSaved }: UserFormProps) {
  const isEdit = !!user
  const [form, setForm] = useState({
    email:      user?.email ?? '',
    password:   '',
    first_name: user?.first_name ?? '',
    last_name:  user?.last_name ?? '',
    phone:      user?.phone ?? '',
    role:       user?.role ?? 'patient' as UserRole,
    is_active:  user?.is_active ?? true,
  })
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        const { password: _pw, email: _email, ...editable } = form
        await apiClient.patch(`/admin/users/${user!.id}/`, editable)
      } else {
        await apiClient.post('/admin/users/', form)
      }
      onSaved()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(
        typeof detail === 'string'
          ? detail
          : detail
            ? Object.values(detail).flat().join(' ')
            : 'Something went wrong. Please check the fields and try again.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{isEdit ? 'Edit user' : 'Add user'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name</label>
              <input className="input" value={form.first_name}
                onChange={e => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Last name</label>
              <input className="input" value={form.last_name}
                onChange={e => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Email</label>
            <input
              className="input" type="email" disabled={isEdit}
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
            {isEdit && <p className="text-xs text-gray-400 mt-1">Email can't be changed here.</p>}
          </div>

          {!isEdit && (
            <div>
              <label className="label">Password</label>
              <input
                className="input" type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            </div>
          )}

          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>

          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="patient">Patient</option>
              <option value="doctor">Doctor</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              Active
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={submit}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const queryClient = useQueryClient()
  const [search, setSearch]       = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [modalUser, setModalUser] = useState<AdminUser | null | 'new'>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search, roleFilter],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<AdminUser>>('/admin/users/', {
          params: { search: search || undefined, role: roleFilter || undefined },
        })
        .then(r => r.data),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    setModalUser(null)
  }

  const toggleActive = async (u: AdminUser) => {
    await apiClient.patch(`/admin/users/${u.id}/`, { is_active: !u.is_active })
    refresh()
  }

  const deleteUser = async (u: AdminUser) => {
    if (!confirm(`Permanently delete ${u.full_name}? This cannot be undone.`)) return
    await apiClient.delete(`/admin/users/${u.id}/`)
    refresh()
  }

  const users = data?.results ?? []

  return (
    <div className="page-container space-y-6">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="text-gray-500 text-sm mt-1">{data?.count ?? 0} accounts total</p>
        </div>
        <button className="btn-primary" onClick={() => setModalUser('new')}>
          <Plus className="w-4 h-4" /> Add user
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by name, email, phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input max-w-[160px]" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          <option value="patient">Patient</option>
          <option value="doctor">Doctor</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No users match your search.</td></tr>
            )}
            {users.map(u => (
              <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <button className="flex items-center gap-3 text-left" onClick={() => setModalUser(u)}>
                    <div>
                      <p className="font-medium text-gray-900">{u.full_name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge capitalize ${roleBadge[u.role] ?? 'bg-gray-100 text-gray-700'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(u)} className="inline-flex items-center gap-1.5">
                    {u.is_active ? (
                      <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-400 text-xs font-medium">
                        <XCircle className="w-3.5 h-3.5" /> Disabled
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(u.date_joined).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button className="text-xs font-medium text-blue-600 hover:underline" onClick={() => setModalUser(u)}>
                      Edit
                    </button>
                    <button className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => deleteUser(u)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalUser && (
        <UserFormModal
          user={modalUser === 'new' ? null : modalUser}
          onClose={() => setModalUser(null)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}