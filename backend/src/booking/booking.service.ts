import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth.types.js';
import { Clock } from '../common/clock.js';
import { istDate } from '../common/dates.js';
import { AppointmentSource, AppointmentStatus } from '../common/enums.js';
import { Clinic, Doctor, DoctorSchedule, Patient } from '../database/entities/index.js';
import { SettingsService } from '../settings/settings.service.js';
import { AppointmentNotifier } from './appointment-notifier.service.js';
import { AvailabilityService } from './availability.service.js';
import { CANCELLED_STATUSES, DEFAULT_MINUTES_PER_PATIENT, hhmm } from './constants.js';
import { CreateBookingDto, PatientInputDto } from './dto.js';
import { mapAllocationError, TokenAllocator } from './token-allocator.service.js';

const CLINIC_CLOSED = 'This clinic is not accepting bookings right now';

const REASON_TEXT: Record<string, string> = {
  past: 'This date has already passed',
  too_far: 'Bookings open only a few days in advance',
  wrong_weekday: 'The doctor does not sit on this day',
  ended: 'This session has already ended today',
  leave: 'The doctor is on leave on this day',
};

@Injectable()
export class BookingService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly allocator: TokenAllocator,
    private readonly availability: AvailabilityService,
    private readonly settings: SettingsService,
    private readonly notifier: AppointmentNotifier,
    private readonly clock: Clock,
    private readonly config: ConfigService,
  ) {}

  // ---- patient profiles ----
  listPatients(userId: string) {
    return this.ds.getRepository(Patient).find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  createPatient(userId: string, dto: PatientInputDto) {
    return this.ds.getRepository(Patient).save({ userId, name: dto.name.trim(), age: dto.age ?? null, gender: dto.gender ?? null });
  }

  // ---- booking ----
  async book(user: AuthUser, dto: CreateBookingDto) {
    const schedule = await this.ds.getRepository(DoctorSchedule).findOne({ where: { id: dto.scheduleId }, relations: { doctor: { clinic: true } } });
    if (!schedule || !schedule.isActive || !schedule.doctor.isActive) throw new NotFoundException('Session not found');
    const doctor: Doctor = schedule.doctor;
    const clinic: Clinic = doctor.clinic;

    // Subscription gating: only clinics visible in the public view accept bookings.
    const listed = await this.ds.query(`SELECT 1 FROM v_public_clinics WHERE id = $1`, [clinic.id]);
    if (!listed.length) throw new ConflictException(CLINIC_CLOSED);

    const advance = await this.settings.getInt('advance_booking_days');
    const reason = this.availability.windowReason(schedule, dto.date, advance);
    if (reason) throw new BadRequestException(REASON_TEXT[reason]);

    const patientId = await this.resolvePatient(user.id, dto);
    const remind = dto.remindBeforeMinutes ?? (await this.settings.getInt('default_reminder_minutes'));

    try {
      const appt = await this.ds.transaction(async (m) => {
        // Leave is checked after the transaction starts; LeavesService locks the same counter row, so there is no gap.
        await m.query(`INSERT INTO token_counters (schedule_id, visit_date) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [schedule.id, dto.date]);
        if (await this.availability.isOnLeave(schedule.id, doctor.id, dto.date, m)) throw new BadRequestException(REASON_TEXT.leave);
        return this.allocator.allocate(m, {
          clinicId: clinic.id,
          doctorId: doctor.id,
          scheduleId: schedule.id,
          patientId,
          visitDate: dto.date,
          source: AppointmentSource.ONLINE,
          feeAmount: doctor.consultationFee,
          startTime: schedule.startTime,
          maxTokens: schedule.maxTokens,
          walkinReserved: schedule.walkinReserved,
          slotMinutes: schedule.slotMinutes,
          remindBeforeMinutes: remind,
        });
      });
      void this.notifier.confirmed(appt.id);
      return {
        publicId: appt.publicId,
        tokenNo: appt.tokenNo,
        estimatedTime: hhmm(appt.slotTime),
        visitDate: dto.date,
        status: AppointmentStatus.BOOKED,
        clinic: { name: clinic.name, slug: clinic.slug },
        doctor: { name: doctor.name, slug: doctor.slug },
        session: { name: schedule.sessionName, startTime: hhmm(schedule.startTime), endTime: hhmm(schedule.endTime) },
        remindBeforeMinutes: remind,
        queueUrl: `${this.config.getOrThrow<string>('WEB_BASE_URL')}/q/${appt.publicId}`,
      };
    } catch (e) {
      return mapAllocationError(e);
    }
  }

  private async resolvePatient(userId: string, dto: CreateBookingDto): Promise<string> {
    if (dto.patientId) {
      const p = await this.ds.getRepository(Patient).findOne({ where: { id: dto.patientId, userId } });
      if (!p) throw new ForbiddenException('Unknown patient profile');
      return p.id;
    }
    if (!dto.patient) throw new BadRequestException('Provide patientId or patient details');
    return (await this.createPatient(userId, dto.patient)).id;
  }

  // ---- my bookings ----
  async mine(userId: string, scope: 'upcoming' | 'past' = 'upcoming') {
    const today = istDate(this.clock.now());
    const rows = await this.ds.query(
      `SELECT a.public_id AS "publicId", a.token_no AS "tokenNo", a.status, a.source, a.visit_date::text AS "visitDate", a.slot_time::text AS "slotTime",
              p.name AS "patientName", d.name AS "doctorName", d.slug AS "doctorSlug", c.name AS "clinicName", c.slug AS "clinicSlug", c.map_url AS "mapUrl",
              s.session_name AS "sessionName", s.start_time::text AS "startTime", s.end_time::text AS "endTime"
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id AND p.user_id = $1
         JOIN doctors d ON d.id = a.doctor_id
         JOIN clinics c ON c.id = a.clinic_id
         JOIN doctor_schedules s ON s.id = a.schedule_id
        WHERE ${scope === 'past' ? 'a.visit_date < $2' : 'a.visit_date >= $2'}
        ORDER BY a.visit_date ${scope === 'past' ? 'DESC' : 'ASC'}, a.token_no ASC
        LIMIT 100`,
      [userId, today],
    );
    return rows.map((r: Record<string, string>) => ({ ...r, slotTime: r.slotTime ? hhmm(r.slotTime) : null, startTime: hhmm(r.startTime), endTime: hhmm(r.endTime) }));
  }

  async cancel(userId: string, publicId: string) {
    const [row] = await this.ds.query(
      `SELECT a.id, a.status, a.visit_date::text AS visit_date, s.start_time::text AS start_time
         FROM appointments a JOIN patients p ON p.id = a.patient_id AND p.user_id = $1 JOIN doctor_schedules s ON s.id = a.schedule_id
        WHERE a.public_id = $2`,
      [userId, publicId],
    );
    if (!row) throw new NotFoundException('Booking not found');
    if (row.status !== AppointmentStatus.BOOKED) throw new ConflictException('This booking can no longer be cancelled online');

    const cutoffMin = await this.settings.getInt('cancel_cutoff_minutes');
    const sessionStart = new Date(`${row.visit_date}T${row.start_time}+05:30`);
    if (this.clock.now().getTime() > sessionStart.getTime() - cutoffMin * 60_000) {
      throw new ConflictException(`Online cancellation closes ${cutoffMin} minutes before the session. Please call the clinic.`);
    }
    // Guarded update: if the clinic checked the patient in meanwhile, this affects 0 rows.
    const res = await this.ds.query(
      `WITH u AS (UPDATE appointments SET status = $1, cancelled_reason = 'Cancelled by patient' WHERE id = $2 AND status = 'booked' RETURNING id)
       SELECT id FROM u`,
      [AppointmentStatus.CANCELLED_BY_PATIENT, row.id],
    );
    if (!res.length) throw new ConflictException('This booking can no longer be cancelled online');
    void this.notifier.cancelled(row.id);
    return { ok: true };
  }

  // ---- public live queue ----
  async queueView(publicId: string) {
    const [a] = await this.ds.query(
      `SELECT a.id, a.token_no, a.status, a.visit_date::text AS visit_date, a.slot_time::text AS slot_time, a.schedule_id,
              s.session_name, s.start_time::text AS start_time, s.end_time::text AS end_time, s.slot_minutes,
              d.name AS doctor_name, c.name AS clinic_name, c.slug AS clinic_slug, c.map_url, c.live_queue_enabled
         FROM appointments a
         JOIN doctor_schedules s ON s.id = a.schedule_id JOIN doctors d ON d.id = a.doctor_id JOIN clinics c ON c.id = a.clinic_id
        WHERE a.public_id = $1`,
      [publicId],
    );
    if (!a) throw new NotFoundException('Booking not found');
    const common = {
      tokenNo: a.token_no,
      visitDate: a.visit_date,
      estimatedTime: a.slot_time ? hhmm(a.slot_time) : null,
      cancelled: CANCELLED_STATUSES.includes(a.status),
    };
    const rest = {
      clinic: { name: a.clinic_name, slug: a.clinic_slug, mapUrl: a.map_url },
      doctor: { name: a.doctor_name },
      session: { name: a.session_name, startTime: hhmm(a.start_time), endTime: hhmm(a.end_time) },
      serverTime: this.clock.now().toISOString(),
    };

    if (!a.live_queue_enabled) {
      // Fixed-time clinic: only the token and the approximate time. Status hides in-clinic movement (check-in / call / skip).
      const hidden = [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_CONSULTATION, AppointmentStatus.SKIPPED] as string[];
      return {
        ...common,
        ...rest,
        liveQueue: false,
        status: hidden.includes(a.status) ? AppointmentStatus.BOOKED : a.status,
        nowServing: null,
        patientsAhead: null,
        etaMinutes: null,
        yourTurn: false,
      };
    }

    const [counter] = await this.ds.query(`SELECT now_serving FROM token_counters WHERE schedule_id = $1 AND visit_date = $2`, [a.schedule_id, a.visit_date]);
    const [ahead] = await this.ds.query(
      `SELECT COUNT(*)::int AS n FROM appointments WHERE schedule_id = $1 AND visit_date = $2 AND token_no < $3 AND status IN ('booked','checked_in')`,
      [a.schedule_id, a.visit_date, a.token_no],
    );
    const waiting = a.status === AppointmentStatus.BOOKED || a.status === AppointmentStatus.CHECKED_IN;
    const minutes = a.slot_minutes ?? DEFAULT_MINUTES_PER_PATIENT;
    return {
      ...common,
      ...rest,
      liveQueue: true,
      status: a.status,
      nowServing: counter?.now_serving ?? 0,
      patientsAhead: waiting ? ahead.n : 0,
      etaMinutes: waiting ? ahead.n * minutes : null,
      yourTurn: a.status === AppointmentStatus.IN_CONSULTATION,
    };
  }
}
