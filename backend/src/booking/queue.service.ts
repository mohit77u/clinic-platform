import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { normalizeMobile } from '../auth/mobile.js';
import { AuditService } from '../common/audit.service.js';
import { Clock } from '../common/clock.js';
import { istDate, weekdayOf } from '../common/dates.js';
import { AppointmentSource, AppointmentStatus as S, UserRole } from '../common/enums.js';
import { Patient, User } from '../database/entities/index.js';
import { AppointmentNotifier } from './appointment-notifier.service.js';
import { AvailabilityService } from './availability.service.js';
import { DEFAULT_MINUTES_PER_PATIENT, hhmm } from './constants.js';
import { WalkinDto } from './dto.js';
import { mapAllocationError, TokenAllocator } from './token-allocator.service.js';

export interface Moved {
  id: string;
  schedule_id: string;
  visit_date: string;
  token_no: number;
}

@Injectable()
export class QueueService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly allocator: TokenAllocator,
    private readonly availability: AvailabilityService,
    private readonly notifier: AppointmentNotifier,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  today() {
    return istDate(this.clock.now());
  }

  /** All of a clinic's sessions for a day, with every appointment, for the reception screen. */
  async day(clinicId: string, date: string) {
    const dow = weekdayOf(date);
    const sessions = await this.ds.query(
      `SELECT s.id AS "scheduleId", s.session_name AS "sessionName", s.start_time::text AS "startTime", s.end_time::text AS "endTime",
              s.max_tokens AS "maxTokens", s.walkin_reserved AS "walkinReserved", s.mode, s.slot_minutes AS "slotMinutes",
              d.id AS "doctorId", d.name AS "doctorName",
              COALESCE(tc.last_token, 0) AS "lastToken", COALESCE(tc.now_serving, 0) AS "nowServing"
         FROM doctor_schedules s
         JOIN doctors d ON d.id = s.doctor_id
         LEFT JOIN token_counters tc ON tc.schedule_id = s.id AND tc.visit_date = $2
        WHERE d.clinic_id = $1
          AND ((s.is_active AND d.is_active AND s.weekday = $3)
               OR EXISTS (SELECT 1 FROM appointments a WHERE a.schedule_id = s.id AND a.visit_date = $2))
        ORDER BY s.start_time, d.name`,
      [clinicId, date, dow],
    );
    const appts = await this.ds.query(
      `SELECT a.id, a.schedule_id AS "scheduleId", a.token_no AS "tokenNo", a.status, a.source, a.slot_time::text AS "slotTime",
              a.fee_amount AS "feeAmount", a.public_id AS "publicId", a.checked_in_at AS "checkedInAt",
              p.name AS "patientName", p.age AS "patientAge", p.gender AS "patientGender", u.mobile AS "patientMobile"
         FROM appointments a JOIN patients p ON p.id = a.patient_id LEFT JOIN users u ON u.id = p.user_id
        WHERE a.clinic_id = $1 AND a.visit_date = $2 ORDER BY a.token_no`,
      [clinicId, date],
    );
    const leaves = await this.ds.query(
      `SELECT l.doctor_id AS "doctorId", l.schedule_id AS "scheduleId" FROM doctor_leaves l JOIN doctors d ON d.id = l.doctor_id
        WHERE d.clinic_id = $1 AND l.leave_date = $2`,
      [clinicId, date],
    );
    return {
      date,
      sessions: sessions.map((s: Record<string, any>) => {
        const list = appts.filter((a: { scheduleId: string }) => a.scheduleId === s.scheduleId);
        const live = list.filter((a: { status: S }) => !['cancelled_by_patient', 'cancelled_by_clinic'].includes(a.status));
        return {
          ...s,
          startTime: hhmm(s.startTime),
          endTime: hhmm(s.endTime),
          onLeave: leaves.some((l: { doctorId: string; scheduleId: string | null }) => l.doctorId === s.doctorId && (l.scheduleId === null || l.scheduleId === s.scheduleId)),
          booked: live.length,
          appointments: list,
        };
      }),
    };
  }

  // ---- state transitions (all guarded by "UPDATE ... WHERE status IN (...)" so concurrent taps cannot double-apply) ----

  private async transition(m: EntityManager, clinicId: string, id: string, from: S[], to: S, setSql = '', extra: unknown[] = []): Promise<Moved> {
    const rows: Moved[] = await m.query(
      `WITH u AS (UPDATE appointments SET status = $1 ${setSql} WHERE id = $2 AND clinic_id = $3 AND status = ANY($4::appointment_status[])
                  RETURNING id, schedule_id, visit_date::text AS visit_date, token_no)
       SELECT * FROM u`,
      [to, id, clinicId, from, ...extra],
    );
    if (rows.length) return rows[0];
    const [cur] = await m.query(`SELECT status FROM appointments WHERE id = $1 AND clinic_id = $2`, [id, clinicId]);
    if (!cur) throw new NotFoundException('Appointment not found');
    throw new ConflictException(`Cannot move a "${cur.status}" appointment to "${to}"`);
  }

  checkIn(clinicId: string, id: string) {
    return this.ds.transaction((m) => this.transition(m, clinicId, id, [S.BOOKED], S.CHECKED_IN, `, checked_in_at = now()`));
  }

  skip(clinicId: string, id: string) {
    return this.ds.transaction((m) => this.transition(m, clinicId, id, [S.BOOKED, S.CHECKED_IN, S.IN_CONSULTATION], S.SKIPPED));
  }

  noShow(clinicId: string, id: string) {
    return this.ds.transaction((m) => this.transition(m, clinicId, id, [S.BOOKED, S.CHECKED_IN, S.SKIPPED], S.NO_SHOW));
  }

  complete(clinicId: string, id: string) {
    return this.ds.transaction((m) => this.transition(m, clinicId, id, [S.IN_CONSULTATION], S.COMPLETED, `, completed_at = now()`));
  }

  async cancelByClinic(clinicId: string, id: string, reason: string | undefined, actorId: string) {
    const moved = await this.ds.transaction(async (m) => {
      const r = await this.transition(m, clinicId, id, [S.BOOKED, S.CHECKED_IN, S.SKIPPED], S.CANCELLED_BY_CLINIC, `, cancelled_reason = $5`, [reason || 'Cancelled by clinic']);
      await this.audit.log(actorId, 'appointment.cancelled_by_clinic', 'appointment', id, { reason }, m);
      return r;
    });
    void this.notifier.cancelledByClinic([id], reason);
    return moved;
  }

  /** Serializes all queue movement for one session by taking the counter row lock. */
  private async lockCounter(m: EntityManager, scheduleId: string, date: string): Promise<void> {
    await m.query(`INSERT INTO token_counters (schedule_id, visit_date) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [scheduleId, date]);
    await m.query(`SELECT 1 FROM token_counters WHERE schedule_id = $1 AND visit_date = $2 FOR UPDATE`, [scheduleId, date]);
  }

  private async assertSessionInClinic(clinicId: string, scheduleId: string): Promise<void> {
    const rows = await this.ds.query(`SELECT 1 FROM doctor_schedules s JOIN doctors d ON d.id = s.doctor_id WHERE s.id = $1 AND d.clinic_id = $2`, [scheduleId, clinicId]);
    if (!rows.length) throw new NotFoundException('Session not found');
  }

  /** Call one specific patient (also used to bring back a skipped patient). Finishes whoever is currently inside. */
  async call(clinicId: string, id: string) {
    const [a] = await this.ds.query(`SELECT schedule_id, visit_date::text AS visit_date FROM appointments WHERE id = $1 AND clinic_id = $2`, [id, clinicId]);
    if (!a) throw new NotFoundException('Appointment not found');
    const moved = await this.ds.transaction(async (m) => {
      await this.lockCounter(m, a.schedule_id, a.visit_date);
      await this.finishCurrent(m, a.schedule_id, a.visit_date);
      const r = await this.transition(m, clinicId, id, [S.BOOKED, S.CHECKED_IN, S.SKIPPED], S.IN_CONSULTATION);
      await m.query(`UPDATE token_counters SET now_serving = $3 WHERE schedule_id = $1 AND visit_date = $2`, [a.schedule_id, a.visit_date, r.token_no]);
      return r;
    });
    await this.afterCall(moved);
    return moved;
  }

  /** "Call next": completes the current patient, then calls the lowest token that is checked in (falls back to booked). */
  async callNext(clinicId: string, scheduleId: string, date: string) {
    await this.assertSessionInClinic(clinicId, scheduleId);
    const moved = await this.ds.transaction(async (m) => {
      await this.lockCounter(m, scheduleId, date);
      await this.finishCurrent(m, scheduleId, date);
      for (const status of [S.CHECKED_IN, S.BOOKED]) {
        const [next] = await m.query(
          `SELECT id FROM appointments WHERE schedule_id = $1 AND visit_date = $2 AND status = $3 ORDER BY token_no LIMIT 1 FOR UPDATE`,
          [scheduleId, date, status],
        );
        if (next) {
          const r = await this.transition(m, clinicId, next.id, [status], S.IN_CONSULTATION);
          await m.query(`UPDATE token_counters SET now_serving = $3 WHERE schedule_id = $1 AND visit_date = $2`, [scheduleId, date, r.token_no]);
          return r;
        }
      }
      return null;
    });
    if (moved) await this.afterCall(moved);
    return { called: moved ? { id: moved.id, tokenNo: moved.token_no } : null };
  }

  private async finishCurrent(m: EntityManager, scheduleId: string, date: string) {
    await m.query(`UPDATE appointments SET status = 'completed', completed_at = now() WHERE schedule_id = $1 AND visit_date = $2 AND status = 'in_consultation'`, [scheduleId, date]);
  }

  /** Queue just moved: re-evaluate who is now within their chosen reminder window. */
  private async afterCall(_moved: Moved) {
    await this.sendTurnReminders(this.clock.now()).catch(() => 0);
  }

  // ---- walk-ins ----

  async walkin(clinicId: string, dto: WalkinDto, actorId: string) {
    const [s] = await this.ds.query(
      `SELECT s.id, s.weekday, s.start_time::text AS start_time, s.max_tokens, s.walkin_reserved, s.slot_minutes, s.is_active,
              d.id AS doctor_id, d.consultation_fee, d.is_active AS doctor_active
         FROM doctor_schedules s JOIN doctors d ON d.id = s.doctor_id WHERE s.id = $1 AND d.clinic_id = $2`,
      [dto.scheduleId, clinicId],
    );
    if (!s || !s.is_active || !s.doctor_active) throw new NotFoundException('Session not found');

    const listed = await this.ds.query(`SELECT 1 FROM v_public_clinics WHERE id = $1`, [clinicId]);
    if (!listed.length) throw new HttpException('Your plan has expired. Renew to add patients.', HttpStatus.PAYMENT_REQUIRED);

    const date = this.today();
    if (weekdayOf(date) !== s.weekday) throw new BadRequestException('This doctor has no session today');
    if (await this.availability.isOnLeave(s.id, s.doctor_id, date)) throw new BadRequestException('The doctor is on leave today');

    try {
      const appt = await this.ds.transaction(async (m) => {
        const patientId = await this.walkinPatient(m, clinicId, dto);
        const a = await this.allocator.allocate(m, {
          clinicId, doctorId: s.doctor_id, scheduleId: s.id, patientId, visitDate: date, source: AppointmentSource.WALKIN,
          feeAmount: s.consultation_fee, startTime: s.start_time, maxTokens: s.max_tokens, walkinReserved: s.walkin_reserved, slotMinutes: s.slot_minutes,
        });
        // Walk-ins are physically present.
        await m.query(`UPDATE appointments SET status = 'checked_in', checked_in_at = now() WHERE id = $1`, [a.id]);
        await this.audit.log(actorId, 'appointment.walkin', 'appointment', a.id, { tokenNo: a.tokenNo }, m);
        return a;
      });
      void this.notifier.walkin(appt.id);
      return { id: appt.id, publicId: appt.publicId, tokenNo: appt.tokenNo, estimatedTime: hhmm(appt.slotTime) };
    } catch (e) {
      return mapAllocationError(e);
    }
  }

  /** Reuses the patient profile for a known mobile+name, otherwise creates one (with an account only when a mobile is given). */
  private async walkinPatient(m: EntityManager, clinicId: string, dto: WalkinDto): Promise<string> {
    let userId: string | null = null;
    if (dto.mobile) {
      const mobile = normalizeMobile(dto.mobile);
      let user = await m.getRepository(User).findOne({ where: { mobile } });
      if (!user) {
        await m.getRepository(User).createQueryBuilder().insert().values({ mobile, role: UserRole.PATIENT }).orIgnore().execute();
        user = await m.getRepository(User).findOneByOrFail({ mobile });
      }
      // Never attach a walk-in to a staff/admin account.
      if (user.role === UserRole.PATIENT) userId = user.id;
    }
    if (userId) {
      const existing = await m.getRepository(Patient).createQueryBuilder('p').where('p.user_id = :userId AND LOWER(p.name) = LOWER(:name)', { userId, name: dto.name.trim() }).getOne();
      if (existing) return existing.id;
    }
    const p = await m.getRepository(Patient).save({ userId, name: dto.name.trim(), age: dto.age ?? null, gender: dto.gender ?? null, createdByClinicId: clinicId });
    return p.id;
  }

  // ---- background jobs ----

  /** Anything still "booked" 30 min after its session ended never showed up. */
  async closeNoShows(now: Date): Promise<number> {
    const rows = await this.ds.query(
      `WITH u AS (UPDATE appointments a SET status = 'no_show' FROM doctor_schedules s
                   WHERE s.id = a.schedule_id AND a.status = 'booked'
                     AND ((a.visit_date + s.end_time) AT TIME ZONE 'Asia/Kolkata') < $1::timestamptz - interval '30 minutes'
                   RETURNING a.id)
       SELECT id FROM u`,
      [now],
    );
    return rows.length;
  }

  /**
   * One WhatsApp reminder per online booking, `remind_before_minutes` ahead of the patient's turn.
   *  - Live-queue clinics: estimated turn = max(now, session start) + (waiting patients with a smaller token) x minutes per
   *    patient, so it follows the real queue (doctor late => reminder later, queue moving fast => sooner).
   *  - Fixed-time clinics (live queue off): estimated turn = the approximate time shown at booking (`slot_time`), no queue input.
   * Claimed with UPDATE ... RETURNING so a second instance, a retry or a queue tap can never send it twice.
   */
  async sendTurnReminders(now: Date): Promise<number> {
    const rows: { id: string; minutes: number; serving: number; live: boolean }[] = await this.ds.query(
      `WITH due AS (
         SELECT a.id, c.live_queue_enabled AS live,
                CASE WHEN c.live_queue_enabled THEN
                  GREATEST($1::timestamptz, ((a.visit_date + s.start_time) AT TIME ZONE 'Asia/Kolkata'))
                    + make_interval(mins => (SELECT COUNT(*)::int FROM appointments b
                                              WHERE b.schedule_id = a.schedule_id AND b.visit_date = a.visit_date
                                                AND b.token_no < a.token_no AND b.status IN ('booked','checked_in'))
                                             * COALESCE(s.slot_minutes, ${DEFAULT_MINUTES_PER_PATIENT}))
                ELSE ((a.visit_date + COALESCE(a.slot_time, s.start_time)) AT TIME ZONE 'Asia/Kolkata') END AS eta
           FROM appointments a JOIN doctor_schedules s ON s.id = a.schedule_id JOIN clinics c ON c.id = a.clinic_id
          WHERE a.status IN ('booked','checked_in') AND a.source = 'online'
            AND a.turn_near_sent_at IS NULL AND a.remind_before_minutes IS NOT NULL
            AND ((a.visit_date + s.end_time) AT TIME ZONE 'Asia/Kolkata') > $1::timestamptz),
       u AS (
         UPDATE appointments a SET turn_near_sent_at = now()
           FROM due WHERE due.id = a.id AND a.turn_near_sent_at IS NULL
            AND due.eta <= $1::timestamptz + make_interval(mins => a.remind_before_minutes)
         RETURNING a.id, a.schedule_id, a.visit_date, due.live, GREATEST(0, CEIL(EXTRACT(EPOCH FROM (due.eta - $1::timestamptz)) / 60))::int AS minutes)
       SELECT u.id, u.minutes, u.live, COALESCE(tc.now_serving, 0) AS serving
         FROM u LEFT JOIN token_counters tc ON tc.schedule_id = u.schedule_id AND tc.visit_date = u.visit_date`,
      [now],
    );
    if (rows.length) await this.notifier.turnNear(rows.map((r) => ({ id: r.id, minutes: r.minutes, serving: r.serving, live: r.live })));
    return rows.length;
  }
}
