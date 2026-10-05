import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../common/audit.service.js';
import { Clock } from '../common/clock.js';
import { istDate } from '../common/dates.js';
import { PaymentStatus, SubscriptionKind } from '../common/enums.js';
import { NotificationsService } from '../common/notifications.service.js';
import { Plan } from '../database/entities/index.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { PaymentGateway } from './gateway.js';
import { InvoiceService } from './invoice.service.js';
import { financialYear, fromPaise, priceWithGst, toPaise } from './money.js';

export interface CaptureInput {
  orderId: string;
  paymentId: string;
  /** amount the provider says it collected, in paise (verified against our order) */
  amountPaise: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly gateway: PaymentGateway,
    private readonly subs: SubscriptionsService,
    private readonly invoices: InvoiceService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  /** Public plan list with GST worked out (what the clinic will actually pay). */
  async plansWithPricing() {
    const plans = await this.ds.getRepository(Plan).find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
    return plans.map((p) => {
      const pr = priceWithGst(p.price, p.gstPercent);
      return {
        id: p.id,
        name: p.name,
        durationMonths: p.durationMonths,
        price: fromPaise(pr.basePaise),
        gstPercent: pr.gstPercent,
        gstAmount: fromPaise(pr.gstPaise),
        total: fromPaise(pr.totalPaise),
        perMonth: fromPaise(Math.round(pr.basePaise / p.durationMonths)),
      };
    });
  }

  async createOrder(clinicId: string, planId: number, actorId: string) {
    const plan = await this.ds.getRepository(Plan).findOne({ where: { id: planId, isActive: true } });
    if (!plan) throw new NotFoundException('Plan not found');
    const pr = priceWithGst(plan.price, plan.gstPercent);

    const order = await this.gateway.createOrder(pr.totalPaise, `clinic-${clinicId}-plan-${plan.id}-${Date.now()}`);
    const [row] = await this.ds.query(
      `INSERT INTO payments (clinic_id, plan_id, amount, gst_amount, status, razorpay_order_id, method, created_by)
       VALUES ($1,$2,$3,$4,'created',$5,'razorpay',$6) RETURNING id`,
      [clinicId, plan.id, fromPaise(pr.totalPaise), fromPaise(pr.gstPaise), order.id, actorId],
    );
    return {
      paymentId: row.id,
      orderId: order.id,
      amountPaise: pr.totalPaise,
      currency: 'INR',
      keyId: this.gateway.keyId,
      plan: { id: plan.id, name: plan.name },
      devMode: this.gateway.isDev,
    };
  }

  /**
   * Turns a paid order into a subscription period + invoice. Idempotent: replaying the same webhook (or the
   * checkout callback racing the webhook) adds the plan duration exactly once, because the payment row is
   * locked and only a `created` payment can be captured.
   */
  async capture(input: CaptureInput): Promise<{ alreadyProcessed: boolean; paymentId?: string }> {
    const result = await this.ds.transaction(async (m) => {
      const [p] = await m.query(`SELECT id, clinic_id, plan_id, amount, status, razorpay_payment_id FROM payments WHERE razorpay_order_id = $1 FOR UPDATE`, [input.orderId]);
      if (!p) throw new NotFoundException('Unknown order');
      if (p.status === PaymentStatus.CAPTURED) return { alreadyProcessed: true as const, paymentId: p.id };
      if (p.status !== PaymentStatus.CREATED) throw new ConflictException(`Order is ${p.status}`);

      if (toPaise(p.amount) !== input.amountPaise) {
        await m.query(`UPDATE payments SET status = 'failed' WHERE id = $1`, [p.id]);
        await this.audit.log(null, 'payment.amount_mismatch', 'payment', p.id, { expected: toPaise(p.amount), got: input.amountPaise }, m);
        return { mismatch: true as const };
      }
      const done = await this.finalize(m, p, { paymentId: input.paymentId, method: 'razorpay', actorId: null });
      return { alreadyProcessed: false as const, paymentId: p.id, clinicId: p.clinic_id, ...done };
    });
    if ('mismatch' in result) throw new BadRequestException('Paid amount does not match the order');
    if (!result.alreadyProcessed) await this.afterCapture(result.paymentId!);
    return { alreadyProcessed: result.alreadyProcessed, paymentId: result.paymentId };
  }

  /** Offline payment recorded by an admin (cash / bank transfer). Same subscription + invoice path. */
  async recordManual(clinicId: string, planId: number, reference: string, adminId: string) {
    const plan = await this.ds.getRepository(Plan).findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    const pr = priceWithGst(plan.price, plan.gstPercent);
    const paymentId = await this.ds.transaction(async (m) => {
      await this.assertClinic(m, clinicId);
      const [p] = await m.query(
        `INSERT INTO payments (clinic_id, plan_id, amount, gst_amount, status, method, reference, created_by)
         VALUES ($1,$2,$3,$4,'created','manual',$5,$6) RETURNING id, clinic_id, plan_id, amount`,
        [clinicId, plan.id, fromPaise(pr.totalPaise), fromPaise(pr.gstPaise), reference, adminId],
      );
      await this.finalize(m, p, { paymentId: null, method: 'manual', actorId: adminId });
      await this.audit.log(adminId, 'payment.recorded_manually', 'payment', p.id, { clinicId, planId, reference }, m);
      return p.id as string;
    });
    await this.afterCapture(paymentId);
    return { paymentId };
  }

  private async assertClinic(m: EntityManager, clinicId: string) {
    const rows = await m.query(`SELECT 1 FROM clinics WHERE id = $1`, [clinicId]);
    if (!rows.length) throw new NotFoundException('Clinic not found');
  }

  /** Runs inside the capture transaction. Invoice numbers come from a locked counter row, so they are gapless. */
  private async finalize(
    m: EntityManager,
    p: { id: string; clinic_id: string; plan_id: number },
    o: { paymentId: string | null; method: string; actorId: string | null },
  ) {
    const [plan] = await m.query(`SELECT duration_months FROM plans WHERE id = $1`, [p.plan_id]);
    const sub = await this.subs.extend({ clinicId: p.clinic_id, kind: SubscriptionKind.PAID, planId: p.plan_id, months: plan.duration_months, createdBy: o.actorId }, m);
    const now = this.clock.now();
    const [counter] = await m.query(
      `INSERT INTO invoice_counters (fy, last_no) VALUES ($1, 1)
       ON CONFLICT (fy) DO UPDATE SET last_no = invoice_counters.last_no + 1 RETURNING last_no`,
      [financialYear(istDate(now))],
    );
    const invoiceNo = `RCP/${financialYear(istDate(now))}/${String(counter.last_no).padStart(4, '0')}`;
    await m.query(
      `UPDATE payments SET status = 'captured', razorpay_payment_id = $2, paid_at = $3, subscription_id = $4, invoice_no = $5 WHERE id = $1`,
      [p.id, o.paymentId, now, sub.id, invoiceNo],
    );
    await this.audit.log(o.actorId, 'subscription.paid', 'clinic', p.clinic_id, { paymentId: p.id, invoiceNo, endsAt: sub.endsAt }, m);
    return { invoiceNo, endsAt: sub.endsAt };
  }

  /** Post-commit side effects. Failures here must never undo a captured payment. */
  private async afterCapture(paymentId: string) {
    try {
      await this.invoices.generate(paymentId);
    } catch (e) {
      this.logger.error(`Invoice PDF failed for payment ${paymentId}: ${e instanceof Error ? e.message : e}`);
    }
    try {
      const [p] = await this.ds.query(`SELECT p.invoice_no, p.amount, p.clinic_id, c.name FROM payments p JOIN clinics c ON c.id = p.clinic_id WHERE p.id = $1`, [paymentId]);
      const owners: { mobile: string }[] = await this.ds.query(
        `SELECT u.mobile FROM clinic_members cm JOIN users u ON u.id = cm.user_id WHERE cm.clinic_id = $1 AND cm.role = 'clinic_owner'`,
        [p.clinic_id],
      );
      for (const o of owners) {
        await this.notifications.send({ to: o.mobile, template: 'payment_received', params: { clinic: p.name, amount: p.amount, invoice: p.invoice_no }, relatedClinicId: p.clinic_id });
      }
    } catch (e) {
      this.logger.error(`Payment notification failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ---- views ----

  async forClinic(clinicId: string) {
    return this.ds.query(
      `SELECT p.id, p.amount, p.gst_amount AS "gstAmount", p.status, p.method, p.invoice_no AS "invoiceNo", p.paid_at AS "paidAt",
              p.created_at AS "createdAt", pl.name AS "planName"
         FROM payments p JOIN plans pl ON pl.id = p.plan_id WHERE p.clinic_id = $1 AND p.status <> 'created' ORDER BY p.created_at DESC LIMIT 100`,
      [clinicId],
    );
  }

  async listAll(page: number, limit: number, status?: string) {
    const params: unknown[] = [];
    const where = status ? (params.push(status), `WHERE p.status = $1`) : '';
    const items = await this.ds.query(
      `SELECT p.id, p.clinic_id AS "clinicId", c.name AS "clinicName", p.amount, p.gst_amount AS "gstAmount", p.status, p.method, p.reference,
              p.invoice_no AS "invoiceNo", p.paid_at AS "paidAt", p.created_at AS "createdAt", pl.name AS "planName"
         FROM payments p JOIN clinics c ON c.id = p.clinic_id JOIN plans pl ON pl.id = p.plan_id ${where}
        ORDER BY p.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number((page - 1) * limit)}`,
      params,
    );
    const [{ n }] = await this.ds.query(`SELECT COUNT(*)::int AS n FROM payments p ${where}`, params);
    return { items, total: n, page, limit, pages: Math.ceil(n / limit) };
  }
}
