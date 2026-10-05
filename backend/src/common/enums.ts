export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  CLINIC_OWNER = 'clinic_owner',
  CLINIC_STAFF = 'clinic_staff',
  PATIENT = 'patient',
}
export enum ProviderType {
  CLINIC = 'clinic',
  DIAGNOSTIC_CENTRE = 'diagnostic_centre',
}
export enum ClinicStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}
export enum BookingMode {
  TOKEN = 'token',
  SLOT = 'slot',
}
export enum AppointmentStatus {
  BOOKED = 'booked',
  CHECKED_IN = 'checked_in',
  IN_CONSULTATION = 'in_consultation',
  COMPLETED = 'completed',
  CANCELLED_BY_PATIENT = 'cancelled_by_patient',
  CANCELLED_BY_CLINIC = 'cancelled_by_clinic',
  NO_SHOW = 'no_show',
  SKIPPED = 'skipped',
}
export enum AppointmentSource {
  ONLINE = 'online',
  WALKIN = 'walkin',
}
export enum SubscriptionKind {
  TRIAL = 'trial',
  PAID = 'paid',
  GIFTED = 'gifted',
}
export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}
export enum PaymentStatus {
  CREATED = 'created',
  CAPTURED = 'captured',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
