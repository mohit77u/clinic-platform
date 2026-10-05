import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppointmentSource } from '../common/enums.js';
import { addMinutesToTime, CANCELLED_SQL, DEFAULT_MINUTES_PER_PATIENT } from './constants.js';

export interface AllocateParams {
  clinicId: string;
  doctorId: string;
  scheduleId: string;
  patientId: string;
  visitDate: string;
  source: AppointmentSource;
  feeAmount: string | null;
  startTime: string;
  maxTokens: number;
  walkinReserved: number;
  slotMinutes: number | null;
  notes?: string | null;
  remindBeforeMinutes?: number | null;
}

export interface AllocatedAppointment {
  id: string;
  publicId: string;
  tokenNo: number;
  slotTime: string;
}

export const SESSION_FULL = 'This session is full. Please choose another session or day.';

/**
 * The only place tokens are issued. Must run inside the caller's transaction:
 *   1. ensure the counter row exists
 *   2. UPDATE ... last_token + 1 (takes the row lock; concurrent bookings for the same session queue up here)
 *   3. with the lock held, count live appointments and enforce capacity (throwing rolls back the increment => no gaps)
 *   4. insert; UNIQUE(schedule_id, visit_date, token_no) and uq_active_patient_session are the safety nets
 */
@Injectable()
export class TokenAllocator {
  async allocate(m: EntityManager, p: AllocateParams): Promise<AllocatedAppointment> {
    await m.query(`INSERT INTO token_counters (schedule_id, visit_date) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [p.scheduleId, p.visitDate]);
    const [counter] = await m.query(
      `WITH u AS (UPDATE token_counters SET last_token = last_token + 1 WHERE schedule_id = $1 AND visit_date = $2 RETURNING last_token)
       SELECT last_token FROM u`,
      [p.scheduleId, p.visitDate],
    );
    const tokenNo: number = counter.last_token;

    const [c] = await m.query(
      `SELECT COUNT(*) FILTER (WHERE status NOT IN ${CANCELLED_SQL})::int AS total,
              COUNT(*) FILTER (WHERE status NOT IN ${CANCELLED_SQL} AND source = 'online')::int AS online
         FROM appointments WHERE schedule_id = $1 AND visit_date = $2`,
      [p.scheduleId, p.visitDate],
    );
    if (c.total >= p.maxTokens) throw new ConflictException(SESSION_FULL);
    if (p.source === AppointmentSource.ONLINE && c.online >= p.maxTokens - p.walkinReserved) throw new ConflictException(SESSION_FULL);

    // Approximate time: start + people already waiting x minutes per patient.
    const slotTime = addMinutesToTime(p.startTime, c.total * (p.slotMinutes ?? DEFAULT_MINUTES_PER_PATIENT));

    const [row] = await m.query(
      `WITH i AS (
         INSERT INTO appointments (clinic_id, doctor_id, schedule_id, patient_id, visit_date, token_no, slot_time, source, fee_amount, notes, remind_before_minutes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, public_id)
       SELECT id, public_id FROM i`,
      [p.clinicId, p.doctorId, p.scheduleId, p.patientId, p.visitDate, tokenNo, slotTime, p.source, p.feeAmount, p.notes ?? null, p.remindBeforeMinutes ?? null],
    );
    return { id: row.id, publicId: row.public_id, tokenNo, slotTime };
  }
}

/** Maps Postgres unique violations from the insert to friendly errors. */
export function mapAllocationError(e: unknown): never {
  const err = e as { code?: string; driverError?: { code?: string; constraint?: string }; constraint?: string };
  const code = err.code ?? err.driverError?.code;
  const constraint = err.constraint ?? err.driverError?.constraint;
  if (code === '23505' && constraint === 'uq_active_patient_session') {
    throw new ConflictException('This patient already has an active booking for this session');
  }
  throw e;
}
