import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import {
  ArrowLeft, Star, MapPin, Briefcase, Calendar,
  Clock, CheckCircle, AlertCircle, User
} from 'lucide-react'
import type { DoctorProfile, Appointment } from '../../types'

export default function DoctorDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [showBooking,    setShowBooking]    = useState(false)
  const [bookingForm,    setBookingForm]    = useState({
    appointment_date: '',
    appointment_time: '',
    appointment_type: 'virtual',
    reason:           '',
  })
  const [bookingError,   setBookingError]   = useState('')
  const [bookingSuccess, setBookingSuccess] = useState(false)

  const { data: doctor, isLoading } = useQuery({
    queryKey: ['doctor', id],
    queryFn: () => apiClient.get<DoctorProfile>(`/doctors/${id}/`).then(r => r.data),
    enabled: !!id,
  })

  const bookMutation = useMutation({
    mutationFn: (data: typeof bookingForm & { doctor: string }) =>
      apiClient.post<Appointment>('/appointments/', data).then(r => r.data),
    onSuccess: () => {
      setBookingSuccess(true)
      setBookingError('')
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail
      if (typeof detail === 'object' && !Array.isArray(detail)) {
        const msgs = Object.values(detail).flat()
        setBookingError(msgs[0] as string)
      } else {
        setBookingError(
          err.response?.data?.message || 'Booking failed. Please try again.'
        )
      }
    },
  })

  const handleBook = () => {
    setBookingError('')
    if (!bookingForm.appointment_date) { setBookingError('Please select a date.');  return }
    if (!bookingForm.appointment_time) { setBookingError('Please select a time.');  return }
    if (!bookingForm.reason.trim())    { setBookingError('Please describe the reason.'); return }

    // ✅ Use doctor.user (UUID) not the profile id (integer)
    if (!doctor?.user_id) { setBookingError('Doctor information missing.'); return }

    bookMutation.mutate({ ...bookingForm, doctor: doctor.user_id })
  }

  const timeSlots = [
    '08:00','08:30','09:00','09:30','10:00','10:30',
    '11:00','11:30','13:00','13:30','14:00','14:30',
    '15:00','15:30','16:00','16:30',
  ]

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  if (isLoading) return (
    <div className="page-container">
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-1/4" />
        <div className="card space-y-4">
          <div className="flex gap-4">
            <div className="w-20 h-20 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-gray-200 rounded w-1/2" />
              <div className="h-4 bg-gray-200 rounded w-1/3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  if (!doctor) return (
    <div className="page-container text-center py-16">
      <p className="text-gray-500">Doctor not found.</p>
      <button onClick={() => navigate(-1)} className="btn-secondary mt-4">Go back</button>
    </div>
  )

  return (
    <div className="page-container space-y-6 max-w-3xl">

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to doctors
      </button>

      {/* Profile card */}
      <div className="card space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            {doctor.avatar ? (
              <img src={doctor.avatar} className="w-20 h-20 rounded-full object-cover" alt="" />
            ) : (
              <User className="w-8 h-8 text-blue-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-gray-900">Dr. {doctor.full_name}</h1>
            <p className="text-blue-600 font-medium">{doctor.specialty_display}</p>
            <div className="flex flex-wrap gap-3 mt-2">
              {doctor.hospital_affiliation && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="w-3.5 h-3.5" />{doctor.hospital_affiliation}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Briefcase className="w-3.5 h-3.5" />{doctor.years_of_experience} yrs experience
              </span>
              {parseFloat(doctor.average_rating) > 0 && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                  {doctor.average_rating} ({doctor.total_reviews} reviews)
                </span>
              )}
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${
            doctor.is_accepting_patients
              ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {doctor.is_accepting_patients ? 'Available' : 'Unavailable'}
          </span>
        </div>

        {doctor.bio && (
          <div>
            <h2 className="text-sm font-medium text-gray-700 mb-1">About</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{doctor.bio}</p>
          </div>
        )}

        {doctor.consultation_fee && (
          <div className="flex items-center justify-between py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">Consultation fee</span>
            <span className="font-semibold text-gray-900">
              KES {parseFloat(doctor.consultation_fee).toLocaleString()}
            </span>
          </div>
        )}

        {doctor.is_accepting_patients && !showBooking && !bookingSuccess && (
          <button onClick={() => setShowBooking(true)} className="btn-primary w-full py-3">
            <Calendar className="w-4 h-4" /> Book Appointment
          </button>
        )}
      </div>

      {/* Success */}
      {bookingSuccess && (
        <div className="card text-center py-8">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Appointment Requested!</h2>
          <p className="text-sm text-gray-500 mb-6">
            Dr. {doctor.full_name} will confirm your appointment shortly.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/patient/appointments')} className="btn-primary">
              View appointments
            </button>
            <button
              onClick={() => { setBookingSuccess(false); setShowBooking(false) }}
              className="btn-secondary"
            >
              Book another
            </button>
          </div>
        </div>
      )}

      {/* Booking form */}
      {showBooking && !bookingSuccess && (
        <div className="card space-y-4">
          <h2 className="section-title">Book an Appointment</h2>

          {bookingError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {bookingError}
            </div>
          )}

          <div>
            <label className="label"><Calendar className="w-3.5 h-3.5 inline mr-1" />Preferred date</label>
            <input
              type="date" className="input" min={minDate}
              value={bookingForm.appointment_date}
              onChange={(e) => setBookingForm({ ...bookingForm, appointment_date: e.target.value })}
            />
          </div>

          <div>
            <label className="label"><Clock className="w-3.5 h-3.5 inline mr-1" />Preferred time</label>
            <div className="grid grid-cols-4 gap-2">
              {timeSlots.map((slot) => (
                <button
                  key={slot} type="button"
                  onClick={() => setBookingForm({ ...bookingForm, appointment_time: `${slot}:00` })}
                  className={`py-2 text-sm rounded-xl border transition-colors ${
                    bookingForm.appointment_time === `${slot}:00`
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Appointment type</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'virtual',   label: 'Virtual',   desc: 'Video or phone call' },
                { value: 'in_person', label: 'In Person', desc: 'Visit the clinic' },
              ].map(({ value, label, desc }) => (
                <button
                  key={value} type="button"
                  onClick={() => setBookingForm({ ...bookingForm, appointment_type: value })}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    bookingForm.appointment_type === value
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    bookingForm.appointment_type === value ? 'text-blue-700' : 'text-gray-900'
                  }`}>{label}</p>
                  <p className="text-xs text-gray-400">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Reason for visit</label>
            <textarea
              className="input resize-none" rows={3}
              placeholder="Describe your symptoms or reason for the appointment..."
              value={bookingForm.reason}
              onChange={(e) => setBookingForm({ ...bookingForm, reason: e.target.value })}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleBook}
              disabled={bookMutation.isPending}
              className="btn-primary flex-1 py-2.5"
            >
              {bookMutation.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Booking...
                </>
              ) : 'Confirm Booking'}
            </button>
            <button
              onClick={() => { setShowBooking(false); setBookingError('') }}
              className="btn-secondary px-6"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
