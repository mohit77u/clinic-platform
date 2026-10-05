import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock.js';
import { SettingsService } from '../settings/settings.service.js';

export type SubscriptionState = 'none' | 'trial' | 'active' | 'expiring' | 'grace' | 'expired';

const DAY = 86_400_000;
export const EXPIRING_DAYS = 7;

@Injectable()
export class BillingService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  /** Drives the dashboard banners (trial / expiring / grace / expired). */
  async status(clinicId: string) {
    const [latest] = await this.ds.query(
      `SELECT kind, ends_at FROM subscriptions WHERE clinic_id = $1 AND status <> 'cancelled' ORDER BY ends_at DESC LIMIT 1`,
      [clinicId],
    );
    const graceDays = await this.settings.getInt('grace_days');
    if (!latest) return { state: 'none' as SubscriptionState, kind: null, endsAt: null, daysLeft: null, graceEndsAt: null, listed: false };

    const now = this.clock.now().getTime();
    const ends = new Date(latest.ends_at).getTime();
    const graceEnds = ends + graceDays * DAY;
    let state: SubscriptionState;
    if (ends > now) {
      const daysLeft = Math.ceil((ends - now) / DAY);
      state = daysLeft <= EXPIRING_DAYS ? 'expiring' : latest.kind === 'trial' ? 'trial' : 'active';
    } else {
      state = graceEnds > now ? 'grace' : 'expired';
    }
    return {
      state,
      kind: latest.kind as string,
      endsAt: new Date(ends).toISOString(),
      daysLeft: ends > now ? Math.ceil((ends - now) / DAY) : 0,
      graceEndsAt: new Date(graceEnds).toISOString(),
      listed: state !== 'expired',
    };
  }
}
