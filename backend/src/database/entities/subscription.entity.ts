import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { SubscriptionKind, SubscriptionStatus } from '../../common/enums.js';
import { Clinic } from './clinic.entity.js';
import { Plan } from './plan.entity.js';

// Index (clinic_id, ends_at DESC) and CHECK (ends_at > starts_at) live in the SQL migration.
@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'clinic_id', type: 'bigint' })
  clinicId: string;

  @ManyToOne(() => Clinic)
  @JoinColumn({ name: 'clinic_id' })
  clinic: Relation<Clinic>;

  /** null for trial / gifted */
  @Column({ name: 'plan_id', type: 'int', nullable: true })
  planId: number | null;

  @ManyToOne(() => Plan, { nullable: true })
  @JoinColumn({ name: 'plan_id' })
  plan: Relation<Plan> | null;

  @Column({ type: 'enum', enum: SubscriptionKind, enumName: 'subscription_kind' })
  kind: SubscriptionKind;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    enumName: 'subscription_status',
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  /** admin for gifted / manual */
  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
