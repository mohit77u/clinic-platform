import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock.js';
import { addDaysToDate, istDate, istTime, weekdayOf } from '../common/dates.js';
import { Doctor, DoctorSchedule } from '../database/entities/index.js';
import { SettingsService } from '../settings/settings.service.js';
import { CANCELLED_SQL, hhmm } from './constants.js';

export type ClosedReason = 'past' | 'too_far' | 'wrong_weekday' | 'ended' | 'leave';

export interface SessionAvailability {
  scheduleId: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  mode: string;
  capacity: number;
  /** online tokens still bookable */
  onlineLeft: number;
  state: 'open' | 'full' | 'closed';
  closedReason?: ClosedReason;
}

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  /** Reason a session can't take bookings on `date`, or null if the date itself is fine. Leaves are checked separately. */
  windowReason(s: Pick<DoctorSchedule, 'weekday' | 'endTime'>, date: string, advanceDays: number): ClosedReason | null {
    const now = this.clock.now();
    const today = istDate(now);
    if (date < today) return 'past';
    if (date > addDaysToDate(today, advanceDays)) return 'too_far';
    if (weekdayOf(date) !== s.weekday) return 'wrong_weekday';
    if (date === today && istTime(now) >= s.endTime) return 'ended';
    return null;
  }

  async isOnLeave(scheduleId: string, doctorId: string, date: string, m: DataSource | import('typeorm').EntityManager = this.ds): Promise<boolean> {
    const rows = await m.query(
      `SELECT 1 FROM doctor_leaves WHERE doctor_id = $1 AND leave_date = $2 AND (schedule_id IS NULL OR schedule_id = $3) LIMIT 1`,
      [doctorId, date, scheduleId],
    );
    return rows.length > 0;
  }

  /** Next `advance_booking_days + 1` days of sessions with remaining online capacity, for the public booking page. */
  async forDoctorSlug(slug: string) {
    const doctor = await this.ds.getRepository(Doctor).findOne({ where: { slug, isActive: true }, relations: { schedules: true, clinic: true } });
    if (!doctor) throw new NotFoundException('Doctor not available');
    const visible = await this.ds.query(`SELECT 1 FROM v_public_clinics WHERE id = $1`, [doctor.clinicId]);
    if (!visible.length) throw new NotFoundException('Doctor not available');

    const advance = await this.settings.getInt('advance_booking_days');
    const today = istDate(this.clock.now());
    const dates = Array.from({ length: advance + 1 }, (_, i) => addDaysToDate(today, i));
    const schedules = doctor.schedules.filter((s) => s.isActive);

    const counts = await this.ds.query(
      `SELECT schedule_id, visit_date::text AS visit_date,
              COUNT(*) FILTER (WHERE status NOT IN ${CANCELLED_SQL})::int AS total,
              COUNT(*) FILTER (WHERE status NOT IN ${CANCELLED_SQL} AND source = 'online')::int AS online
         FROM appointments WHERE doctor_id = $1 AND visit_date BETWEEN $2 AND $3 GROUP BY schedule_id, visit_date`,
      [doctor.id, dates[0], dates[dates.length - 1]],
    );
    const leaves = await this.ds.query(
      `SELECT leave_date::text AS leave_date, schedule_id FROM doctor_leaves WHERE doctor_id = $1 AND leave_date BETWEEN $2 AND $3`,
      [doctor.id, dates[0], dates[dates.length - 1]],
    );

    const days = dates.map((date) => {
      const sessions: SessionAvailability[] = schedules
        .filter((s) => s.weekday === weekdayOf(date))
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((s) => {
          const c = counts.find((x: { schedule_id: string; visit_date: string }) => x.schedule_id === s.id && x.visit_date === date);
          const total = c?.total ?? 0;
          const online = c?.online ?? 0;
          const onlineLeft = Math.max(0, Math.min(s.maxTokens - total, s.maxTokens - s.walkinReserved - online));
          const onLeave = leaves.some((l: { leave_date: string; schedule_id: string | null }) => l.leave_date === date && (l.schedule_id === null || l.schedule_id === s.id));
          const reason = onLeave ? 'leave' : this.windowReason(s, date, advance);
          return {
            scheduleId: s.id,
            sessionName: s.sessionName,
            startTime: hhmm(s.startTime),
            endTime: hhmm(s.endTime),
            mode: s.mode,
            capacity: s.maxTokens,
            onlineLeft,
            state: reason ? 'closed' : onlineLeft === 0 ? 'full' : 'open',
            ...(reason ? { closedReason: reason as ClosedReason } : {}),
          } satisfies SessionAvailability;
        });
      return { date, weekday: weekdayOf(date), sessions };
    });
    return { doctorId: doctor.id, doctorName: doctor.name, consultationFee: doctor.consultationFee, defaultReminderMinutes: await this.settings.getInt('default_reminder_minutes'), days };
  }
}
