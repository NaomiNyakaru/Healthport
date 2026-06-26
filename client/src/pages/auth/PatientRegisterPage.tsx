import { useState} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'
import { apiClient } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import type { RegisterResponse, APIError } from '../../types'

export default function PatientRegisterPage() {
  const navigate = useNavigate()
  const login    = useAuthStore((s) => s.login)

  const [form, setForm] = useState({
    first_name: '',
    last_name:  '',
    email:      '',
    phone:      '',
    password:   '',
    password2:  '',
  })
  const [errors, setErrors]   = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrors({})
    setLoading(true)

    try {
      const { data } = await apiClient.post<RegisterResponse>(
        '/auth/register/patient/', form
      )
      login(data.user, data.tokens)
      navigate('/patient/dashboard')
    } catch (err) {
      const axiosError = err as AxiosError<APIError>
      const detail = axiosError.response?.data?.detail

      if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        // Field-level errors — map each field to its first error message
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

  const field = (key: string, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="label" htmlFor={key}>{label}</label>
      <input
        id={key}
        type={type}
        className={`input ${errors[key] ? 'border-red-500 focus:ring-red-500' : ''}`}
        placeholder={placeholder}
        value={form[key as keyof typeof form]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        required={key !== 'phone'}
      />
      {errors[key] && <p className="error-text">{errors[key]}</p>}
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 mt-1">Join HealthPort as a patient</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.general && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {errors.general}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {field('first_name', 'First name', 'text', 'Jane')}
              {field('last_name',  'Last name',  'text', 'Wanjiku')}
            </div>

            {field('email', 'Email address', 'email', 'you@example.com')}
            {field('phone', 'Phone number (optional)', 'tel', '+254 7XX XXX XXX')}
            {field('password',  'Password',         'password', '••••••••')}
            {field('password2', 'Confirm password', 'password', '••••••••')}

            <button
              type="submit"
              className="btn-primary w-full py-2.5 mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating account...
                </>
              ) : 'Create account'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
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
