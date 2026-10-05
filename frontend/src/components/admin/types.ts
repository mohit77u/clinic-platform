import type { Specialization } from '@/lib/types';

export type ClinicStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface AdminClinic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  addressLine: string;
  area: string;
  city: string;
  state: string;
  pincode: string | null;
  mapUrl: string | null;
  registrationNo: string | null;
  coverUrl: string | null;
  trialDays: number | null;
  liveQueueEnabled: boolean;
  status: ClinicStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminImage {
  id: string;
  imageUrl: string;
  caption: string | null;
  sortOrder: number;
}

export interface AdminSchedule {
  id: string;
  doctorId: string;
  weekday: number;
  sessionName: string;
  startTime: string;
  endTime: string;
  mode: 'token' | 'slot';
  slotMinutes: number | null;
  maxTokens: number;
  walkinReserved: number;
  isActive: boolean;
}

export interface AdminDoctor {
  id: string;
  clinicId: string;
  specializationId: number;
  specialization?: Specialization;
  name: string;
  slug: string;
  qualification: string | null;
  experienceYears: number | null;
  medicalRegNo: string | null;
  consultationFee: string | null;
  languages: string[];
  bio: string | null;
  photoUrl: string | null;
  isActive: boolean;
  schedules: AdminSchedule[];
}

export interface AdminSubscription {
  id: string;
  planId: number | null;
  kind: 'trial' | 'paid' | 'gifted';
  startsAt: string;
  endsAt: string;
  status: string;
  createdAt: string;
}

export interface AdminMember {
  userId: string;
  role: 'clinic_owner' | 'clinic_staff';
  name: string | null;
  mobile: string;
}

export interface AdminClinicDetail extends AdminClinic {
  images: AdminImage[];
  doctors: AdminDoctor[];
  subscriptions: AdminSubscription[];
  members: AdminMember[];
}

export interface AdminPlan {
  id: number;
  name: string;
  durationMonths: number;
  price: string;
  gstPercent: string;
  isActive: boolean;
  sortOrder: number;
}

export interface AdminArea {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface AdminPayment {
  id: string;
  clinicId: string;
  clinicName: string;
  amount: string;
  gstAmount: string;
  status: 'created' | 'captured' | 'failed' | 'refunded';
  method: string;
  reference: string | null;
  invoiceNo: string | null;
  paidAt: string | null;
  createdAt: string;
  planName: string;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface PrivacyRequest {
  id: string;
  userId: string;
  name: string | null;
  mobile: string;
  reason: string | null;
  requestedAt: string;
}

export interface AdminDocument {
  id: string;
  docType: string;
  verified: boolean;
  uploadedAt: string;
}

export interface DoctorLeave {
  id: string;
  leaveDate: string;
  scheduleId: string | null;
  reason: string | null;
}

export interface AdminStats {
  clinics: { pending: number; approved: number; suspended: number; rejected: number };
  subscriptions: { on_trial: number; paying: number; expiring_7d: number };
  bookings: { today: number; last_30_days: number };
  revenue: { this_month: string; total: string };
}

export type AdminSettings = Record<'default_trial_days' | 'grace_days' | 'advance_booking_days' | 'cancel_cutoff_minutes' | 'default_reminder_minutes', number>;
