// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = 'patient' | 'doctor' | 'admin'

export interface User {
  id:                  string
  email:               string
  full_name:           string
  first_name:          string
  last_name:           string
  role:                UserRole
  phone:               string
  avatar:              string | null
  date_joined:         string
  is_verified?:        boolean
  verification_status?: 'pending' | 'verified' | 'rejected'
}

export interface AuthTokens {
  access:  string
  refresh: string
}

export interface LoginResponse {
  access:  string
  refresh: string
  user:    User
}

export interface RegisterResponse {
  message: string
  tokens:  AuthTokens
  user:    User
}

// ─── Doctor ───────────────────────────────────────────────────────────────────

export interface DoctorProfile {
  id:                   number
  user_id:              string
  full_name:            string
  email:                string
  phone:                string
  avatar:               string | null
  kmpdc_number:         string
  verification_status:  'pending' | 'verified' | 'rejected'
  is_verified:          boolean
  verification_note:    string
  specialty:            string
  specialty_display:    string
  years_of_experience:  number
  bio:                  string
  hospital_affiliation: string
  consultation_fee:     string | null
  is_accepting_patients: boolean
  average_rating:       string
  total_reviews:        number
  created_at:           string
}

// ─── Patient ──────────────────────────────────────────────────────────────────

export interface PatientProfile {
  id:                       number
  full_name:                string
  email:                    string
  avatar:                   string | null
  age:                      number | null
  date_of_birth:            string | null
  gender:                   'male' | 'female' | 'other' | ''
  blood_group:              string
  national_id:              string
  allergies:                string
  chronic_conditions:       string
  emergency_contact_name:   string
  emergency_contact_phone:  string
  created_at:               string
}

export interface MedicalRecord {
  id:                  string
  record_type:         string
  record_type_display: string
  title:               string
  description:         string
  date_of_record:      string
  attachment:          string | null
  is_private:          boolean
  doctor:              string | null
  doctor_name:         string | null
  created_at:          string
}

export interface Medication {
  id:                     string
  name:                   string
  dosage:                 string
  instructions:           string
  frequency:              number
  frequency_unit:         'daily' | 'hours'
  frequency_unit_display: string
  start_date:             string
  end_date:               string | null
  is_active:              boolean
  prescribed_by:          string | null
  prescribed_by_name:     string | null
  created_at:             string
}

export interface DosageLog {
  id:              string
  medication:      string
  medication_name: string
  scheduled_time:  string
  taken_at:        string | null
  status:          'taken' | 'missed' | 'skipped'
  status_display:  string
  notes:           string
  created_at:      string
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'
export type AppointmentType   = 'virtual' | 'in_person'

export interface Appointment {
  id:                  string
  patient:             string
  patient_name:        string
  patient_avatar:      string | null
  doctor:              string
  doctor_name:         string
  doctor_avatar:       string | null
  doctor_specialty:    string
  appointment_date:    string
  appointment_time:    string
  duration_minutes:    number
  appointment_type:    AppointmentType
  type_display:        string
  status:              AppointmentStatus
  status_display:      string
  is_upcoming:         boolean
  reason:              string
  notes:               string
  cancellation_reason: string
  cancelled_by:        string | null
  cancelled_by_name:   string | null
  created_at:          string
  updated_at:          string
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatRoom {
  id:                       string
  other_participant_id:     string
  other_participant_name:   string
  other_participant_avatar: string | null
  last_message:             string | null
  last_message_time:        string | null
  unread_count:             number
  appointment:              string
  appointment_date:         string
  appointment_status:       string
  is_active:                boolean
  updated_at:               string
}

export interface Message {
  id:            string
  content:       string
  sender:        string
  sender_name:   string
  sender_avatar: string | null
  is_read:       boolean
  created_at:    string
}

export interface WSHistoryPayload {
  type:     'history'
  messages: Message[]
}

export interface WSMessagePayload {
  type:          'message'
  message_id:    string
  content:       string
  sender_id:     string
  sender_name:   string
  sender_avatar: string | null
  created_at:    string
  is_read:       boolean
}

export interface WSErrorPayload {
  type:  'error'
  error: string
}

export type WSPayload = WSHistoryPayload | WSMessagePayload | WSErrorPayload

// ─── API response wrappers ────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count:    number
  next:     string | null
  previous: string | null
  results:  T[]
}

export interface APIError {
  error:    boolean
  status:   number
  message?: string
  detail?:  Record<string, string[]> | string[]
}
