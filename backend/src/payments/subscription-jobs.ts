import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock.js';
import { NotificationsService } from '../common/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';

const DAY = 86_400_000;

@Injectable()
export class SubscriptionJobs {
  private readonly logger = new Logger(SubscriptionJobs.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  private async ownersOf(clinicIds: string[]): Promise<Map<string, { mobile: string; clinic: string }[]>> {
    if (!clinicIds.length) return new Map();
    const rows: { clinic_id: string; mobile: string; name: string }[] = await this.ds.query(
      `SELECT cm.clinic_id, u.mobile, c.name FROM clinic_members cm JOIN users u ON u.id = cm.user_id JOIN clinics c ON c.id = cm.clinic_id
        WHERE cm.clinic_id = ANY($1::bigint[]) AND cm.role = 'clinic_owner'`,
      [clinicIds],
    );
    const map = new Map<string, { mobile: string; clinic: string }[]>();
    for (const r of rows) map.set(r.clinic_id, [...(map.get(r.clinic_id) ?? []), { mobile: r.mobile, clinic: r.name }]);
    return map;
  }

  /**
   * Marks subscriptions `expired` only once the grace period is over (the public view hides the clinic at the same moment),
   * and tells the owner once. Idempotent: only `active` rows are touched.
   */
  @Cron('0 * * * *')
  async sweep(now: Date = this.clock.now()): Promise<number> {
    const grace = await this.settings.getInt('grace_days');
    const rows: { clinic_id: string }[] = await this.ds.query(
      `WITH u AS (UPDATE subscriptions SET status = 'expired'
                   WHERE status = 'active' AND ends_at + make_interval(days => $2) < $1::timestamptz RETURNING clinic_id)
       SELECT DISTINCT clinic_id FROM u`,
      [now, grace],
    );
    // Only clinics with nothing active left are really expired (a renewal may already be queued).
    const stillActive: { clinic_id: string }[] = rows.length
      ? await this.ds.query(`SELECT DISTINCT clinic_id FROM subscriptions WHERE clinic_id = ANY($1::bigint[]) AND status = 'active'`, [rows.map((r) => r.clinic_id)])
      : [];
    const expired = rows.map((r) => r.clinic_id).filter((id) => !stillActive.some((s) => s.clinic_id === id));
    const owners = await this.ownersOf(expired);
    for (const [clinicId, list] of owners) {
      for (const o of list) await this.notifications.send({ to: o.mobile, template: 'subscription_expired', params: { clinic: o.clinic }, relatedClinicId: clinicId });
    }
    if (rows.length) this.logger.log(`subscription-sweeper expired ${rows.length} subscription rows`);
    return rows.length;
  }

  /** 7 / 3 / 1 day reminders to owners, at most once per clinic per window. */
  @Cron('0 9 * * *', { timeZone: 'Asia/Kolkata' })
  async renewalReminders(now: Date = this.clock.now()): Promise<number> {
    let sent = 0;
    for (const days of [7, 3, 1]) {
      const rows: { clinic_id: string }[] = await this.ds.query(
        `SELECT s.clinic_id FROM subscriptions s JOIN clinics c ON c.id = s.clinic_id
          WHERE s.status = 'active' AND c.status = 'approved'
          GROUP BY s.clinic_id
         HAVING MAX(s.ends_at) > $1::timestamptz + make_interval(days => $2 - 1) AND MAX(s.ends_at) <= $1::timestamptz + make_interval(days => $2)
            AND NOT EXISTS (SELECT 1 FROM notification_logs n WHERE n.related_clinic_id = s.clinic_id AND n.template = 'subscription_expiring'
                              AND n.created_at > $1::timestamptz - interval '20 hours')`,
        [now, days],
      );
      const owners = await this.ownersOf(rows.map((r) => r.clinic_id));
      for (const [clinicId, list] of owners) {
        for (const o of list) {
          await this.notifications.send({ to: o.mobile, template: 'subscription_expiring', params: { clinic: o.clinic, days }, relatedClinicId: clinicId });
          sent++;
        }
      }
    }
    return sent;
  }

  @Cron('30 3 * * *')
  async otpCleanup(): Promise<void> {
    await this.ds.query(`DELETE FROM otp_requests WHERE expires_at < now() - interval '1 day'`);
  }
}
