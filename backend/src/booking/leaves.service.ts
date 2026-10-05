import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../common/audit.service.js';
import { Clock } from '../common/clock.js';
import { istDate, weekdayOf } from '../common/dates.js';
import { AppointmentNotifier } from './appointment-notifier.service.js';
import { LeaveDto } from './dto.js';

@Injectable()
export class LeavesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly notifier: AppointmentNotifier,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  list(doctorId: string) {
    return this.ds.query(
      `SELECT id, leave_date::text AS "leaveDate", schedule_id AS "scheduleId", reason FROM doctor_leaves
        WHERE doctor_id = $1 AND leave_date >= $2 ORDER BY leave_date`,
      [doctorId, istDate(this.clock.now())],
    );
  }

  /**
   * Marks a leave and cancels every live booking it covers (patients are notified).
   * The affected sessions' counter rows are locked first, so a booking racing with this either finishes before
   * (and is cancelled here) or starts after (and is rejected because the leave is visible).
   */
  async create(doctorId: string, dto: LeaveDto, actorId: string, clinicId?: string) {
    const doctors = await this.ds.query(`SELECT id, clinic_id FROM doctors WHERE id = $1`, [doctorId]);
    if (!doctors.length || (clinicId && doctors[0].clinic_id !== clinicId)) throw new NotFoundException('Doctor not found');
    if (dto.date < istDate(this.clock.now())) throw new BadRequestException('Cannot add a leave in the past');

    const cancelledIds: string[] = await this.ds.transaction(async (m) => {
      const scheduleFilter = dto.scheduleId ? `AND id = $3` : '';
      const schedules: { id: string }[] = await m.query(
        `SELECT id FROM doctor_schedules WHERE doctor_id = $1 AND weekday = $2 ${scheduleFilter}`,
        dto.scheduleId ? [doctorId, weekdayOf(dto.date), dto.scheduleId] : [doctorId, weekdayOf(dto.date)],
      );
      if (dto.scheduleId && !schedules.length) throw new BadRequestException('That session does not run on this weekday');
      for (const s of schedules) {
        await m.query(`INSERT INTO token_counters (schedule_id, visit_date) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [s.id, dto.date]);
        await m.query(`SELECT 1 FROM token_counters WHERE schedule_id = $1 AND visit_date = $2 FOR UPDATE`, [s.id, dto.date]);
      }
      try {
        await m.query(`INSERT INTO doctor_leaves (doctor_id, leave_date, schedule_id, reason) VALUES ($1,$2,$3,$4)`, [doctorId, dto.date, dto.scheduleId ?? null, dto.reason ?? null]);
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw new ConflictException('A leave already exists for this day');
        throw e;
      }
      const ids = schedules.map((s) => s.id);
      const rows: { id: string }[] = ids.length
        ? await m.query(
            `WITH u AS (UPDATE appointments SET status = 'cancelled_by_clinic', cancelled_reason = 'Doctor on leave'
                         WHERE schedule_id = ANY($1::bigint[]) AND visit_date = $2 AND status IN ('booked','checked_in')
                         RETURNING id)
             SELECT id FROM u`,
            [ids, dto.date],
          )
        : [];
      await this.audit.log(actorId, 'doctor.leave_added', 'doctor', doctorId, { date: dto.date, scheduleId: dto.scheduleId ?? null, cancelled: rows.length }, m);
      return rows.map((r) => r.id);
    });

    if (cancelledIds.length) void this.notifier.cancelledByClinic(cancelledIds, 'Doctor is on leave.');
    return { ok: true, cancelledBookings: cancelledIds.length };
  }

  async remove(doctorId: string, leaveId: string, actorId: string, clinicId?: string) {
    const rows = await this.ds.query(
      `DELETE FROM doctor_leaves l USING doctors d WHERE l.id = $1 AND l.doctor_id = $2 AND d.id = l.doctor_id ${clinicId ? 'AND d.clinic_id = $3' : ''} RETURNING l.id`,
      clinicId ? [leaveId, doctorId, clinicId] : [leaveId, doctorId],
    );
    // TypeORM returns [rows, count] for DELETE
    const deleted = Array.isArray(rows[0]) ? rows[0].length : rows.length;
    if (!deleted) throw new NotFoundException('Leave not found');
    await this.audit.log(actorId, 'doctor.leave_removed', 'doctor', doctorId, { leaveId });
    return { ok: true };
  }
}
