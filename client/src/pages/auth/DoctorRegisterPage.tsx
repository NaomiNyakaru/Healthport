import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { apiClient } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import type { RegisterResponse, APIError } from '../../types'

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

export default function DoctorRegisterPage() {
  const navigate = useNavigate()
  const login    = useAuthStore((s) => s.login)

  const [form, setForm] = useState({
    first_name:          '',
    last_name:           '',
    email:               '',
    phone:               '',
    password:            '',
    password2:           '',
    kmpdc_number:        '',
    specialty:           'general_practice',
    years_of_experience: '0',
  })
  const [errors, setErrors]   = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrors({})
    setLoading(true)

    try {
      const { data } = await apiClient.post<RegisterResponse>(
        '/auth/register/doctor/',
        { ...form, years_of_experience: parseInt(form.years_of_experience) }
      )
      login(data.user, data.tokens)
      // New doctors always go to verification pending screen
      navigate('/doctor/verification')
    } catch (err) {
      const axiosError = err as AxiosError<APIError>
      const detail = axiosError.response?.data?.detail

      if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        const fieldErrors: Record<string, string> = {}
        Object.entries(detail).forEach(([key, val]) => {
          fieldErrors[key] = Array.isArray(val) ? val[0] : String(val)
        })
        setErrors(fieldErrors)
      } else {
        setErrors({ general: axiosError.response?.data?.message || 'Registration failed.' })
      }
    } finally {
      setLoading(false)
    }
  }

  const f = (key: string) => form[key as keyof typeof form]
  const setF = (key: string, val: string) => setForm({ ...form, [key]: val })

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Doctor Registration</h1>
          <p className="text-gray-500 mt-1">Register with your KMPDC credentials</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.general && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {errors.general}
              </div>
            )}

            {/* Personal info */}
            <div className="grid grid-cols-2 gap-4">
              {['first_name', 'last_name'].map((key) => (
                <div key={key}>
                  <label className="label" htmlFor={key}>
                    {key === 'first_name' ? 'First name' : 'Last name'}
                  </label>
                  <input id={key} type="text" className={`input ${errors[key] ? 'border-red-500' : ''}`}
                    value={f(key)} onChange={(e) => setF(key, e.target.value)} required />
                  {errors[key] && <p className="error-text">{errors[key]}</p>}
                </div>
              ))}
            </div>

            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input id="email" type="email" className={`input ${errors.email ? 'border-red-500' : ''}`}
                placeholder="dr.you@example.com" value={f('email')}
                onChange={(e) => setF('email', e.target.value)} required />
              {errors.email && <p className="error-text">{errors.email}</p>}
            </div>

            <div>
              <label className="label" htmlFor="phone">Phone number</label>
              <input id="phone" type="tel" className="input"
                placeholder="+254 7XX XXX XXX" value={f('phone')}
                onChange={(e) => setF('phone', e.target.value)} />
            </div>

            {/* KMPDC section */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">
                KMPDC Registration
              </p>

              <div>
                <label className="label" htmlFor="kmpdc_number">
                  KMPDC Registration Number
                </label>
                <input id="kmpdc_number" type="text" className={`input ${errors.kmpdc_number ? 'border-red-500' : ''}`}
                  placeholder="KMPDC/001/2020" value={f('kmpdc_number')}
                  onChange={(e) => setF('kmpdc_number', e.target.value)} required />
                {errors.kmpdc_number && <p className="error-text">{errors.kmpdc_number}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  Your registration will be verified against the KMPDC registry.
                </p>
              </div>

              <div className="mt-4">
                <label className="label" htmlFor="specialty">Specialty</label>
                <select id="specialty" className="input"
                  value={f('specialty')} onChange={(e) => setF('specialty', e.target.value)}>
                  {SPECIALTIES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <label className="label" htmlFor="years_of_experience">
                  Years of experience
                </label>
                <input id="years_of_experience" type="number" min="0" max="60"
                  className="input" value={f('years_of_experience')}
                  onChange={(e) => setF('years_of_experience', e.target.value)} />
              </div>
            </div>

            {/* Password */}
            <div className="border-t border-gray-100 pt-4 space-y-4">
              <div>
                <label className="label" htmlFor="password">Password</label>
                <input id="password" type="password" className={`input ${errors.password ? 'border-red-500' : ''}`}
                  placeholder="••••••••" value={f('password')}
                  onChange={(e) => setF('password', e.target.value)} required />
                {errors.password && <p className="error-text">{errors.password}</p>}
              </div>
              <div>
                <label className="label" htmlFor="password2">Confirm password</label>
                <input id="password2" type="password" className={`input ${errors.password2 ? 'border-red-500' : ''}`}
                  placeholder="••••••••" value={f('password2')}
                  onChange={(e) => setF('password2', e.target.value)} required />
                {errors.password2 && <p className="error-text">{errors.password2}</p>}
              </div>
            </div>

            <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Registering...
                </>
              ) : 'Register as Doctor'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Already registered?{' '}
              <Link to="/login" className="text-primary-600 font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
