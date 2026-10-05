export type Role = 'super_admin' | 'clinic_owner' | 'clinic_staff' | 'patient';

export interface SessionUser {
  id: string;
  role: Role;
  name: string | null;
  mobile: string;
  email?: string | null;
}

export interface Specialization {
  id: number;
  name: string;
  nameHi: string | null;
  slug: string;
}

export interface PublicSchedule {
  id: string;
  weekday: number;
  sessionName: string;
  startTime: string;
  endTime: string;
  mode: 'token' | 'slot';
}

export interface PublicDoctor {
  id: string;
  slug: string;
  name: string;
  qualification: string | null;
  experienceYears: number | null;
  consultationFee: string | null;
  languages: string[];
  bio: string | null;
  photoUrl: string | null;
  specialization?: Specialization;
  schedules: PublicSchedule[];
}

export interface PublicClinicCore {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  phone: string;
  whatsapp: string | null;
  addressLine: string;
  area: string;
  city: string;
  state: string;
  pincode: string | null;
  mapUrl: string | null;
  latitude: string | null;
  longitude: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  updatedAt: string;
}

export interface ClinicListItem extends PublicClinicCore {
  specializations: string[];
  doctorCount: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ClinicDetail extends PublicClinicCore {
  images: { id: string; url: string; thumbUrl: string; caption: string | null }[];
  doctors: PublicDoctor[];
}

export interface DoctorDetail extends PublicDoctor {
  clinic: PublicClinicCore;
}

export interface SessionAvailability {
  scheduleId: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  mode: string;
  capacity: number;
  onlineLeft: number;
  state: 'open' | 'full' | 'closed';
  closedReason?: 'past' | 'too_far' | 'wrong_weekday' | 'ended' | 'leave';
}

export interface Availability {
  doctorId: string;
  doctorName: string;
  consultationFee: string | null;
  defaultReminderMinutes: number;
  days: { date: string; weekday: number; sessions: SessionAvailability[] }[];
}

export interface BookingResult {
  publicId: string;
  tokenNo: number;
  estimatedTime: string;
  visitDate: string;
  status: string;
  clinic: { name: string; slug: string };
  doctor: { name: string; slug: string };
  session: { name: string; startTime: string; endTime: string };
  remindBeforeMinutes: number;
  queueUrl: string;
}

export interface MyBooking {
  publicId: string;
  tokenNo: number;
  status: AppointmentStatus;
  source: string;
  visitDate: string;
  slotTime: string | null;
  patientName: string;
  doctorName: string;
  doctorSlug: string;
  clinicName: string;
  clinicSlug: string;
  mapUrl: string | null;
  sessionName: string;
  startTime: string;
  endTime: string;
}

export type AppointmentStatus =
  | 'booked'
  | 'checked_in'
  | 'in_consultation'
  | 'completed'
  | 'cancelled_by_patient'
  | 'cancelled_by_clinic'
  | 'no_show'
  | 'skipped';

export interface PatientProfile {
  id: string;
  name: string;
  age: number | null;
  gender: 'M' | 'F' | 'O' | null;
}

export interface QueueView {
  tokenNo: number;
  status: AppointmentStatus;
  visitDate: string;
  /** false => the clinic shows only token + approximate time (counters below are null) */
  liveQueue: boolean;
  nowServing: number | null;
  patientsAhead: number | null;
  etaMinutes: number | null;
  estimatedTime: string | null;
  yourTurn: boolean;
  cancelled: boolean;
  clinic: { name: string; slug: string; mapUrl: string | null };
  doctor: { name: string };
  session: { name: string; startTime: string; endTime: string };
  serverTime: string;
}

// ---- clinic panel ----
export interface PanelClinic {
  id: string;
  name: string;
  slug: string;
  status: string;
  role: 'clinic_owner' | 'clinic_staff';
}

export interface PanelAppointment {
  id: string;
  scheduleId: string;
  tokenNo: number;
  status: AppointmentStatus;
  source: 'online' | 'walkin';
  slotTime: string | null;
  feeAmount: string | null;
  publicId: string;
  patientName: string;
  patientAge: number | null;
  patientGender: string | null;
  patientMobile: string | null;
}

export interface PanelSession {
  scheduleId: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  maxTokens: number;
  walkinReserved: number;
  mode: string;
  doctorId: string;
  doctorName: string;
  lastToken: number;
  nowServing: number;
  onLeave: boolean;
  booked: number;
  appointments: PanelAppointment[];
}

export interface SubscriptionStatus {
  state: 'none' | 'trial' | 'active' | 'expiring' | 'grace' | 'expired';
  kind: string | null;
  endsAt: string | null;
  daysLeft: number | null;
  graceEndsAt: string | null;
  listed: boolean;
}
