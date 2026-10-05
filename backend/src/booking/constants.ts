import { AppointmentStatus as S } from '../common/enums.js';

/** Statuses that no longer occupy capacity (their token number is never reused). */
export const CANCELLED_STATUSES = [S.CANCELLED_BY_PATIENT, S.CANCELLED_BY_CLINIC];
export const CANCELLED_SQL = `('${S.CANCELLED_BY_PATIENT}','${S.CANCELLED_BY_CLINIC}')`;
/** Patients still waiting for their turn. */
export const WAITING_STATUSES = [S.BOOKED, S.CHECKED_IN];

export const DEFAULT_MINUTES_PER_PATIENT = 10;

export const hhmm = (t: string) => t.slice(0, 5);

/** "09:30" / "14:05:00" -> "9:30 AM" / "2:05 PM" */
export function fmt12(t: string): string {
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

export function addMinutesToTime(t: string, minutes: number): string {
  const total = Math.min(23 * 60 + 59, Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
}

/** "2026-10-05" -> "5 Oct" */
export function fmtDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
