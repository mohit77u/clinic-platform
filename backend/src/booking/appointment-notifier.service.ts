import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../common/notifications.service.js';
import { fmt12, fmtDay, hhmm } from './constants.js';

interface Ctx {
  id: string;
  public_id: string;
  token_no: number;
  visit_date: string;
  slot_time: string | null;
  start_time: string;
  mobile: string | null;
  clinic_id: string;
  clinic_name: string;
  doctor_name: string;
}

/** Builds and sends patient messages for an appointment. Never throws (NotificationsService swallows failures). */
@Injectable()
export class AppointmentNotifier {
  private readonly webBase: string;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.webBase = config.getOrThrow<string>('WEB_BASE_URL');
  }

  private async contexts(ids: string[]): Promise<Ctx[]> {
    if (!ids.length) return [];
    return this.ds.query(
      `SELECT a.id, a.public_id, a.token_no, a.visit_date::text AS visit_date, a.slot_time::text AS slot_time, s.start_time::text AS start_time,
              u.mobile, c.id AS clinic_id, c.name AS clinic_name, d.name AS doctor_name
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         LEFT JOIN users u ON u.id = p.user_id
         JOIN clinics c ON c.id = a.clinic_id
         JOIN doctors d ON d.id = a.doctor_id
         JOIN doctor_schedules s ON s.id = a.schedule_id
        WHERE a.id = ANY($1::bigint[])`,
      [ids],
    );
  }

  private link(publicId: string) {
    return `${this.webBase}/q/${publicId}`;
  }

  private base(c: Ctx) {
    return {
      to: c.mobile!,
      relatedAppointmentId: c.id,
      relatedClinicId: c.clinic_id,
      params: {
        clinic: c.clinic_name,
        doctor: c.doctor_name,
        date: fmtDay(c.visit_date),
        token: c.token_no,
        time: fmt12(hhmm(c.slot_time ?? c.start_time)),
        link: this.link(c.public_id),
      },
    };
  }

  async confirmed(id: string) {
    for (const c of await this.contexts([id])) if (c.mobile) await this.notifications.send({ ...this.base(c), template: 'booking_confirmed' });
  }

  async walkin(id: string) {
    for (const c of await this.contexts([id])) if (c.mobile) await this.notifications.send({ ...this.base(c), template: 'walkin_token' });
  }

  async cancelled(id: string) {
    for (const c of await this.contexts([id])) if (c.mobile) await this.notifications.send({ ...this.base(c), template: 'booking_cancelled' });
  }

  async cancelledByClinic(ids: string[], reason?: string) {
    for (const c of await this.contexts(ids)) {
      if (!c.mobile) continue;
      const b = this.base(c);
      await this.notifications.send({ ...b, params: { ...b.params, reason: reason ?? '' }, template: 'booking_cancelled_by_clinic' });
    }
  }

  /** Live clinics get "token X is N minutes away, now serving Y"; fixed-time clinics get the approximate booked time. */
  async turnNear(items: { id: string; minutes: number; serving: number; live: boolean }[]) {
    const by = new Map(items.map((i) => [i.id, i]));
    for (const c of await this.contexts(items.map((i) => i.id))) {
      if (!c.mobile) continue;
      const i = by.get(c.id)!;
      const b = this.base(c);
      await this.notifications.send({
        ...b,
        params: { ...b.params, minutes: i.minutes, serving: i.serving },
        template: i.live ? 'turn_near' : 'appointment_reminder',
      });
    }
  }
}
