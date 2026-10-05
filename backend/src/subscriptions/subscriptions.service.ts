import { Injectable } from '@nestjs/common';
import { EntityManager, DataSource } from 'typeorm';
import { Clock } from '../common/clock.js';
import { addDays, addMonths } from '../common/dates.js';
import { SubscriptionKind, SubscriptionStatus } from '../common/enums.js';
import { Subscription } from '../database/entities/index.js';

export interface ExtendParams {
  clinicId: string;
  kind: SubscriptionKind;
  planId?: number | null;
  /** exactly one of these */
  months?: number;
  days?: number;
  createdBy?: string | null;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
  ) {}

  /** Latest end of any active subscription for the clinic (null if none). */
  async currentEnd(clinicId: string, m: EntityManager = this.ds.manager): Promise<Date | null> {
    const row = await m
      .getRepository(Subscription)
      .createQueryBuilder('s')
      .select('MAX(s.ends_at)', 'max')
      .where('s.clinic_id = :clinicId AND s.status = :status', { clinicId, status: SubscriptionStatus.ACTIVE })
      .getRawOne<{ max: Date | null }>();
    return row?.max ? new Date(row.max) : null;
  }

  /**
   * New period starts at max(current end, now) and lasts the requested duration, so renewing early never loses time.
   * The clinic row is locked so concurrent extensions serialize instead of overlapping.
   */
  async extend(p: ExtendParams, manager?: EntityManager): Promise<Subscription> {
    const run = async (m: EntityManager) => {
      await m.query('SELECT id FROM clinics WHERE id = $1 FOR UPDATE', [p.clinicId]);
      const now = this.clock.now();
      const end = await this.currentEnd(p.clinicId, m);
      const startsAt = end && end > now ? end : now;
      const endsAt = p.months ? addMonths(startsAt, p.months) : addDays(startsAt, p.days ?? 0);
      return m.getRepository(Subscription).save({
        clinicId: p.clinicId,
        planId: p.planId ?? null,
        kind: p.kind,
        startsAt,
        endsAt,
        status: SubscriptionStatus.ACTIVE,
        createdById: p.createdBy ?? null,
      });
    };
    return manager ? run(manager) : this.ds.transaction(run);
  }

  async hasAny(clinicId: string, m: EntityManager = this.ds.manager): Promise<boolean> {
    return (await m.getRepository(Subscription).count({ where: { clinicId } })) > 0;
  }
}
