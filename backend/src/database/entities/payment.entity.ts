import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { PaymentStatus } from '../../common/enums.js';
import { Clinic } from './clinic.entity.js';
import { Plan } from './plan.entity.js';
import { Subscription } from './subscription.entity.js';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'clinic_id', type: 'bigint' })
  clinicId: string;

  @ManyToOne(() => Clinic)
  @JoinColumn({ name: 'clinic_id' })
  clinic: Relation<Clinic>;

  @Column({ name: 'subscription_id', type: 'bigint', nullable: true })
  subscriptionId: string | null;

  @ManyToOne(() => Subscription, { nullable: true })
  @JoinColumn({ name: 'subscription_id' })
  subscription: Relation<Subscription> | null;

  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @ManyToOne(() => Plan)
  @JoinColumn({ name: 'plan_id' })
  plan: Relation<Plan>;

  /** incl. GST */
  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount: string;

  @Column({ name: 'gst_amount', type: 'numeric', precision: 10, scale: 2 })
  gstAmount: string;

  @Column({ type: 'enum', enum: PaymentStatus, enumName: 'payment_status', default: PaymentStatus.CREATED })
  status: PaymentStatus;

  @Column({ name: 'razorpay_order_id', type: 'text', nullable: true, unique: true })
  razorpayOrderId: string | null;

  @Column({ name: 'razorpay_payment_id', type: 'text', nullable: true, unique: true })
  razorpayPaymentId: string | null;

  /** e.g. RCP/2026-27/0001 */
  @Column({ name: 'invoice_no', type: 'text', nullable: true, unique: true })
  invoiceNo: string | null;

  @Column({ name: 'invoice_url', type: 'text', nullable: true })
  invoiceUrl: string | null;

  /** razorpay | manual */
  @Column({ type: 'text', default: 'razorpay' })
  method: string;

  /** bank ref / UTR for manual payments */
  @Column({ type: 'text', nullable: true })
  reference: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdById: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
