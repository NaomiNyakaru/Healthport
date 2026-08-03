import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { useUser } from '../../store/authStore'
import {
  Users, Stethoscope, Calendar, ShieldAlert, ChevronRight, Clock
} from 'lucide-react'
import type { AdminStats, AdminDoctor, PaginatedResponse } from '../../types'

export default function AdminDashboard() {
  const user = useUser()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiClient.get<AdminStats>('/admin/stats/').then(r => r.data),
  })

  const { data: pendingDoctors } = useQuery({
    queryKey: ['admin', 'doctors', 'pending'],
    queryFn: () =>
      apiClient
        .get<PaginatedResponse<AdminDoctor>>('/admin/doctors/?verification_status=pending')
        .then(r => r.data),
  })

  const cards = [
    { label: 'Total users',       value: stats?.total_users,       icon: Users,       to: '/admin/users',    color: 'bg-blue-50 text-blue-600' },
    { label: 'Patients',          value: stats?.total_patients,    icon: Users,       to: '/admin/patients', color: 'bg-cyan-50 text-cyan-600' },
    { label: 'Doctors',           value: stats?.total_doctors,     icon: Stethoscope, to: '/admin/doctors',  color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Pending verification', value: stats?.pending_doctors, icon: ShieldAlert, to: '/admin/doctors?status=pending', color: 'bg-yellow-50 text-yellow-600' },
    { label: 'Upcoming appointments', value: stats?.upcoming_appointments, icon: Calendar, to: '/admin/appointments', color: 'bg-purple-50 text-purple-600' }
  ]

  return (
    <div className="page-container space-y-6">

      <div>
        <h1 className="page-title">Welcome {user?.first_name}</h1>
        <p className="text-gray-500 mt-1 text-sm">Here's what's happening across HealthPort.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, to, color }) => (
          <Link key={label} to={to} className="card-hover flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {isLoading ? '—' : value}
              </p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Doctors awaiting verification</h2>
          <Link to="/admin/doctors?status=pending" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>

        {(!pendingDoctors || pendingDoctors.results.length === 0) ? (
          <div className="card text-center py-10">
            <p className="text-sm text-gray-400">No doctors waiting on KMPDC verification right now.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingDoctors.results.slice(0, 5).map((doc) => (
              <Link
                key={doc.id}
                to="/admin/doctors?status=pending"
                className="card-hover flex items-center gap-4 p-4"
              >
                <div className="w-9 h-9 bg-yellow-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-yellow-700">
                    {doc.full_name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Dr. {doc.full_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {doc.specialty_display} · KMPDC {doc.kmpdc_number}
                  </p>
                </div>
                <span className="badge-pending flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Pending
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}