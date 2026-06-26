import { ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function VerificationPending() {
  const logout   = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="card">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-yellow-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Verification Pending
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            Your KMPDC registration number is being verified. This usually takes
            1-2 business days. You will be notified once approved.
          </p>
          <div className="bg-yellow-50 rounded-xl p-4 text-left mb-6">
            <p className="text-sm text-yellow-800 font-medium mb-1">What happens next?</p>
            <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
              <li>Admin verifies your KMPDC number</li>
              <li>You receive an email confirmation</li>
              <li>Full access to the platform is granted</li>
            </ul>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="btn-secondary w-full"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
