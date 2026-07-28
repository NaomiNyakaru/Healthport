import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { tokenStorage } from '../api/client'

// ── Loading spinner ────────────────────────────────────────────────────────
const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
)

const S = (C: React.LazyExoticComponent<any>) => (
  <Suspense fallback={<Spinner />}><C /></Suspense>
)

// ── Auth pages ─────────────────────────────────────────────────────────────
const LoginPage           = lazy(() => import('../pages/auth/LoginPage'))
const PatientRegisterPage = lazy(() => import('../pages/auth/PatientRegisterPage'))
const DoctorRegisterPage  = lazy(() => import('../pages/auth/DoctorRegisterPage'))

// ── Patient pages ──────────────────────────────────────────────────────────
const PatientLayout       = lazy(() => import('../pages/patient/PatientLayout'))
const PatientDashboard    = lazy(() => import('../pages/patient/PatientDashboard'))
const BrowseDoctors       = lazy(() => import('../pages/patient/BrowseDoctors'))
const DoctorDetailPage    = lazy(() => import('../pages/patient/DoctorDetailPage'))
const PatientAppointments = lazy(() => import('../pages/patient/PatientAppointments'))
const MedicalRecords      = lazy(() => import('../pages/patient/MedicalRecords'))
const Medications         = lazy(() => import('../pages/patient/Medications'))
const PatientProfile      = lazy(() => import('../pages/patient/PatientProfile'))
const PatientChatInbox    = lazy(() => import('../pages/patient/ChatInbox'))
const PatientChatRoom     = lazy(() => import('../pages/patient/ChatRoom'))

// ── Doctor pages ───────────────────────────────────────────────────────────
const DoctorLayout        = lazy(() => import('../pages/doctor/DoctorLayout'))
const DoctorDashboard     = lazy(() => import('../pages/doctor/DoctorDashboard'))
const DoctorAppointments  = lazy(() => import('../pages/doctor/DoctorAppointments'))
const DoctorPatients      = lazy(() => import('../pages/doctor/DoctorPatients'))
const PatientDetailPage   = lazy(() => import('../pages/doctor/PatientDetailPage'))
const DoctorProfile       = lazy(() => import('../pages/doctor/DoctorProfile'))
const DoctorChatInbox     = lazy(() => import('../pages/doctor/ChatInbox'))
const DoctorChatRoom      = lazy(() => import('../pages/doctor/ChatRoom'))
const VerificationPending = lazy(() => import('../pages/doctor/VerificationPending'))

// ── Admin pages ────────────────────────────────────────────────────────────
const AdminLayout         = lazy(() => import('../pages/admin/AdminLayout'))
const AdminDashboard      = lazy(() => import('../pages/admin/AdminDashboard'))
const AdminUsers          = lazy(() => import('../pages/admin/AdminUsers'))
const AdminDoctors        = lazy(() => import('../pages/admin/AdminDoctors'))
const AdminAppointments   = lazy(() => import('../pages/admin/AdminAppointments'))
const AdminPatients       = lazy(() => import('../pages/admin/AdminPatients'))

// ── Simple token-based guards (no Zustand in router) ──────────────────────
// Reading from Zustand inside the router caused the infinite loop.
// We use localStorage directly here — Zustand is only used inside pages.

const RequireAuth = () => {
  const token = tokenStorage.getAccess()
  if (!token) return <Navigate to="/login" replace />
  return <Outlet />
}

const RequirePatient = () => {
  const role = localStorage.getItem('hp_role')
  if (role === 'doctor') return <Navigate to="/doctor/dashboard" replace />
  if (role === 'admin') return <Navigate to="/admin/dashboard" replace />
  return <Outlet />
}

const RequireDoctor = () => {
  const role = localStorage.getItem('hp_role')
  if (role === 'patient') return <Navigate to="/patient/dashboard" replace />
  if (role === 'admin') return <Navigate to="/admin/dashboard" replace />
  return <Outlet />
}

const RequireAdmin = () => {
  const role = localStorage.getItem('hp_role')
  if (role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

const RootRedirect = () => {
  const token = tokenStorage.getAccess()
  if (!token) return <Navigate to="/login" replace />
  const role = localStorage.getItem('hp_role')
  if (role === 'doctor') return <Navigate to="/doctor/dashboard" replace />
  if (role === 'admin') return <Navigate to="/admin/dashboard" replace />
  return <Navigate to="/patient/dashboard" replace />
}

export const router = createBrowserRouter([
  { path: '/',                   element: <RootRedirect /> },
  { path: '/login',              element: S(LoginPage) },
  { path: '/register/patient',   element: S(PatientRegisterPage) },
  { path: '/register/doctor',    element: S(DoctorRegisterPage) },

  // Patient routes
  {
    element: <RequireAuth />,
    children: [{
      element: <RequirePatient />,
      children: [{
        path: '/patient',
        element: S(PatientLayout),
        children: [
          { index: true,             element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard',       element: S(PatientDashboard) },
          { path: 'doctors',         element: S(BrowseDoctors) },
          { path: 'doctors/:id',     element: S(DoctorDetailPage) },
          { path: 'appointments',    element: S(PatientAppointments) },
          { path: 'records',         element: S(MedicalRecords) },
          { path: 'medications',     element: S(Medications) },
          { path: 'chat',            element: S(PatientChatInbox) },
          { path: 'chat/:roomId',    element: S(PatientChatRoom) },
          { path: 'profile',         element: S(PatientProfile) },
        ],
      }],
    }],
  },

  // Doctor routes
  {
    element: <RequireAuth />,
    children: [{
      element: <RequireDoctor />,
      children: [{
        path: '/doctor',
        element: S(DoctorLayout),
        children: [
          { index: true,             element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard',       element: S(DoctorDashboard) },
          { path: 'appointments',    element: S(DoctorAppointments) },
          { path: 'patients',        element: S(DoctorPatients) },
          { path: 'patients/:id',    element: S(PatientDetailPage) },
          { path: 'chat',            element: S(DoctorChatInbox) },
          { path: 'chat/:roomId',    element: S(DoctorChatRoom) },
          { path: 'profile',         element: S(DoctorProfile) },
          { path: 'verification',    element: S(VerificationPending) },
        ],
      }],
    }],
  },

  // Admin routes
  {
    element: <RequireAuth />,
    children: [{
      element: <RequireAdmin />,
      children: [{
        path: '/admin',
        element: S(AdminLayout),
        children: [
          { index: true,               element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard',         element: S(AdminDashboard) },
          { path: 'users',             element: S(AdminUsers) },
          { path: 'doctors',           element: S(AdminDoctors) },
          { path: 'appointments',      element: S(AdminAppointments) },
          { path: 'patients',          element: S(AdminPatients) },
        ],
      }],
    }],
  },

  { path: '*', element: <Navigate to="/" replace /> },
])
