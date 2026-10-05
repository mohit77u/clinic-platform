import request from 'supertest';
import { UserRole } from '../src/common/enums.js';
import { DevGateway, PaymentGateway } from '../src/payments/gateway.js';
import { SubscriptionJobs } from '../src/payments/subscription-jobs.js';
import { createTestApp, TestApp } from './helpers/app.js';
import { loginAs, resetData, Session, tokenFor } from './helpers/auth.js';
import { seedClinic, SeededClinic } from './helpers/seed.js';

describe('Subscriptions & payments (e2e)', () => {
  let t: TestApp;
  let admin: Session;
  let gw: DevGateway;
  const http = () => request(t.app.getHttpServer());
  const A = () => ({ Cookie: admin.cookies });
  const DAY = 86_400_000;

  beforeAll(async () => {
    t = await createTestApp();
    gw = t.app.get(PaymentGateway) as DevGateway;
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetData(t);
    t.notifier.sent = [];
    t.clock.set(new Date());
    admin = await loginAs(t, UserRole.SUPER_ADMIN, '9000000001');
  });

  /** Time travel: move all of a clinic's subscription dates into the past. */
  const age = (clinicId: string, days: number) =>
    t.ds.query(`UPDATE subscriptions SET starts_at = starts_at - make_interval(days => $2), ends_at = ends_at - make_interval(days => $2) WHERE clinic_id = $1`, [clinicId, days]);

  const withOwner = async (s: SeededClinic, ten = '9444444441') => {
    await http().post(`/admin/clinics/${s.clinic.id}/members`).set(A()).send({ mobile: ten, role: 'clinic_owner', name: 'Dr Owner' }).expect(201);
    return loginAs(t, UserRole.CLINIC_OWNER, ten);
  };

  const order = async (clinicId: string, planId: number, cookies: string[]) =>
    (await http().post(`/clinic-panel/${clinicId}/billing/orders`).set({ Cookie: cookies }).send({ planId }).expect(201)).body;

  const webhook = (orderId: string, paymentId: string, amountPaise: number, event = 'payment.captured') => {
    const body = JSON.stringify({ event, payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: amountPaise, status: 'captured' } } } });
    return http().post('/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-signature', gw.sign(Buffer.from(body))).send(body);
  };

  const status = async (clinicId: string) => (await http().get(`/clinic-panel/${clinicId}/subscription-status`).set(A()).expect(200)).body;
  const publicVisible = async (slug: string) => (await http().get(`/clinics/${slug}`)).status === 200;

  describe('plans & access', () => {
    it('owner sees plans with GST; staff only see status; other clinics are off limits', async () => {
      const s = await seedClinic(t, admin);
      const owner = await withOwner(s);
      const billing = (await http().get(`/clinic-panel/${s.clinic.id}/billing`).set({ Cookie: owner.cookies }).expect(200)).body;
      expect(billing.plans.map((p: { name: string; total: string }) => [p.name, p.total])).toEqual([
        ['Monthly', '1414.82'], ['Quarterly', '3538.82'], ['Half-Yearly', '6488.82'], ['Annual', '11798.82'],
      ]);
      expect(billing.plans[3]).toMatchObject({ price: '9999.00', gstAmount: '1799.82', perMonth: '833.25' });

      await http().post(`/admin/clinics/${s.clinic.id}/members`).set(A()).send({ mobile: '9444444442', role: 'clinic_staff' }).expect(201);
      const staff = await loginAs(t, UserRole.CLINIC_STAFF, '9444444442');
      await http().get(`/clinic-panel/${s.clinic.id}/subscription-status`).set({ Cookie: staff.cookies }).expect(200);
      await http().get(`/clinic-panel/${s.clinic.id}/billing`).set({ Cookie: staff.cookies }).expect(403);
      await http().post(`/clinic-panel/${s.clinic.id}/billing/orders`).set({ Cookie: staff.cookies }).send({ planId: 1 }).expect(403);

      const other = await seedClinic(t, admin, { name: 'Other Clinic', doctorName: 'Dr Other' });
      const otherOwner = await withOwner(other, '9444444443');
      await http().get(`/clinic-panel/${s.clinic.id}/billing`).set({ Cookie: otherOwner.cookies }).expect(403);
    });
  });

  describe('paying', () => {
    it('order -> pay: extends from the existing end date, issues invoice RCP/FY/0001 and a downloadable PDF', async () => {
      const s = await seedClinic(t, admin);
      const owner = await withOwner(s);
      const before = await status(s.clinic.id);
      expect(before.state).toBe('trial');

      const o = await order(s.clinic.id, 1, owner.cookies);
      expect(o).toMatchObject({ amountPaise: 141482, devMode: true });
      const paid = await http().post(`/clinic-panel/${s.clinic.id}/billing/orders/${o.orderId}/dev-pay`).set({ Cookie: owner.cookies }).expect(200);
      expect(paid.body.alreadyProcessed).toBe(false);

      const subs = await t.ds.query(`SELECT kind, starts_at, ends_at FROM subscriptions WHERE clinic_id = $1 ORDER BY ends_at`, [s.clinic.id]);
      expect(subs.map((x: { kind: string }) => x.kind)).toEqual(['trial', 'paid']);
      expect(new Date(subs[1].starts_at).getTime()).toBe(new Date(subs[0].ends_at).getTime()); // early renewal loses nothing
      expect(Math.round((new Date(subs[1].ends_at).getTime() - new Date(subs[1].starts_at).getTime()) / DAY)).toBeGreaterThanOrEqual(28);

      const [pay] = await t.ds.query(`SELECT id, invoice_no, status, invoice_url FROM payments`);
      expect(pay.status).toBe('captured');
      expect(pay.invoice_no).toMatch(/^RCP\/\d{4}-\d{2}\/0001$/);
      expect(pay.invoice_url).toMatch(/^invoices\//);
      const pdf = await http().get(`/clinic-panel/${s.clinic.id}/billing/invoices/${pay.id}`).set({ Cookie: owner.cookies }).expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(Buffer.from(pdf.body).subarray(0, 4).toString()).toBe('%PDF');

      await waitForMessage('payment_received');
      const list = (await http().get(`/clinic-panel/${s.clinic.id}/billing`).set({ Cookie: owner.cookies }).expect(200)).body.payments;
      expect(list).toHaveLength(1);
    });

    const waitForMessage = async (template: string) => {
      const end = Date.now() + 2000;
      while (!t.notifier.sent.some((x) => x.template === template)) {
        if (Date.now() > end) throw new Error(`no ${template} message`);
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    it('another clinic cannot download this clinic\'s invoice', async () => {
      const s = await seedClinic(t, admin);
      const owner = await withOwner(s);
      const o = await order(s.clinic.id, 1, owner.cookies);
      await http().post(`/clinic-panel/${s.clinic.id}/billing/orders/${o.orderId}/dev-pay`).set({ Cookie: owner.cookies }).expect(200);
      const [pay] = await t.ds.query(`SELECT id FROM payments`);
      const other = await seedClinic(t, admin, { name: 'Other Clinic', doctorName: 'Dr Other' });
      const otherOwner = await withOwner(other, '9444444443');
      await http().get(`/clinic-panel/${other.clinic.id}/billing/invoices/${pay.id}`).set({ Cookie: otherOwner.cookies }).expect(404);
      await http().get(`/clinic-panel/${s.clinic.id}/billing/invoices/${pay.id}`).set({ Cookie: otherOwner.cookies }).expect(403);
    });

    it('checkout verification: bad signature rejected, good signature captures once even if the webhook also arrives', async () => {
      const s = await seedClinic(t, admin);
      const owner = await withOwner(s);
      const o = await order(s.clinic.id, 2, owner.cookies);
      const verify = (signature: string) => http().post(`/clinic-panel/${s.clinic.id}/billing/verify`).set({ Cookie: owner.cookies }).send({ orderId: o.orderId, paymentId: 'pay_X1', signature });
      await verify('deadbeef').expect(404);
      await verify(gw.sign(`${o.orderId}|pay_X1`)).expect(200);
      await webhook(o.orderId, 'pay_X1', o.amountPaise).expect(200);
      expect((await t.ds.query(`SELECT COUNT(*)::int AS n FROM subscriptions WHERE kind = 'paid'`))[0].n).toBe(1);
    });
  });

  describe('webhook', () => {
    it('replaying the same webhook 5x (even in parallel) adds the plan duration exactly once', async () => {
      const s = await seedClinic(t, admin);
      const owner = await withOwner(s);
      const o = await order(s.clinic.id, 1, owner.cookies);
      const results = await Promise.all(Array.from({ length: 5 }, () => webhook(o.orderId, 'pay_REPLAY', o.amountPaise)));
      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(results.filter((r) => r.body.duplicate === false)).toHaveLength(1);
      await webhook(o.orderId, 'pay_REPLAY', o.amountPaise).expect(200);
      expect((await t.ds.query(`SELECT COUNT(*)::int AS n FROM subscriptions WHERE kind = 'paid'`))[0].n).toBe(1);
      expect((await t.ds.query(`SELECT COUNT(*)::int AS n FROM payments WHERE invoice_no IS NOT NULL`))[0].n).toBe(1);
    });

    it('rejects bad/missing signatures, tampered bodies, amount mismatches; ignores unknown orders and other events', async () => {
      const s = await seedClinic(t, admin);
      const owner = await withOwner(s);
      const o = await order(s.clinic.id, 1, owner.cookies);
      const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: o.orderId, amount: o.amountPaise } } } });
      await http().post('/webhooks/razorpay').set('content-type', 'application/json').send(body).expect(401);
      await http().post('/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-signature', 'abc').send(body).expect(401);
      // signature of a different body
      await http().post('/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-signature', gw.sign(Buffer.from('{}'))).send(body).expect(401);

      await webhook(o.orderId, 'pay_2', 100).expect(400); // paid 1 rupee for a 1414 order
      expect((await t.ds.query(`SELECT status FROM payments`))[0].status).toBe('failed');
      expect((await t.ds.query(`SELECT COUNT(*)::int AS n FROM subscriptions WHERE kind = 'paid'`))[0].n).toBe(0);

      const r = await webhook('order_unknown', 'pay_3', 100).expect(200);
      expect(r.body.ignored).toBe(true);
      expect((await webhook(o.orderId, 'pay_4', 1, 'payment.failed').expect(200)).body.ignored).toBe(true);
    });
  });

  describe('lifecycle with time travel', () => {
    it('trial -> expiring -> grace -> hidden -> sweeper -> renewed -> visible again', async () => {
      const s = await seedClinic(t, admin);
      const owner = await withOwner(s);
      const jobs = t.app.get(SubscriptionJobs);

      expect((await status(s.clinic.id)).state).toBe('trial');
      expect(await publicVisible(s.clinic.slug)).toBe(true);

      await age(s.clinic.id, 25); // 5 days left
      expect(await status(s.clinic.id)).toMatchObject({ state: 'expiring', daysLeft: 5 });

      await age(s.clinic.id, 6); // ended 1 day ago, grace is 3 days
      expect(await status(s.clinic.id)).toMatchObject({ state: 'grace', listed: true });
      expect(await publicVisible(s.clinic.slug)).toBe(true);
      expect(await jobs.sweep(t.clock.now())).toBe(0); // still in grace: not expired yet

      await age(s.clinic.id, 3); // ended 4 days ago
      expect((await status(s.clinic.id)).state).toBe('expired');
      expect(await publicVisible(s.clinic.slug)).toBe(false);
      await http().post(`/bookings`).set('Authorization', (await tokenFor(t, UserRole.PATIENT, '7000000001')).Authorization)
        .send({ scheduleId: s.schedule.id, date: t.clock.now().toISOString().slice(0, 10), patient: { name: 'Late' }, consent: true }).expect(409);

      t.notifier.sent = [];
      expect(await jobs.sweep(t.clock.now())).toBe(1);
      expect(await jobs.sweep(t.clock.now())).toBe(0); // idempotent
      expect(t.notifier.sent.filter((x) => x.template === 'subscription_expired')).toHaveLength(1);

      // owner can still log in to renew; renewal starts from now (expired time is not "banked")
      const o = await order(s.clinic.id, 1, owner.cookies);
      await http().post(`/clinic-panel/${s.clinic.id}/billing/orders/${o.orderId}/dev-pay`).set({ Cookie: owner.cookies }).expect(200);
      const st = await status(s.clinic.id);
      expect(st.state).toBe('active');
      expect(Math.abs(new Date(st.endsAt).getTime() - (t.clock.now().getTime() + 30 * DAY))).toBeLessThan(3 * DAY);
      expect(await publicVisible(s.clinic.slug)).toBe(true);
    });

    it('renewal reminders at 7/3/1 days, once per window', async () => {
      const s = await seedClinic(t, admin);
      await withOwner(s);
      const jobs = t.app.get(SubscriptionJobs);
      const setEndsIn = (days: number) => t.ds.query(`UPDATE subscriptions SET starts_at = now() - interval '1 day', ends_at = now() + make_interval(secs => $2) WHERE clinic_id = $1`, [s.clinic.id, days * 86400]);

      await setEndsIn(20);
      expect(await jobs.renewalReminders(t.clock.now())).toBe(0);
      await setEndsIn(6.5);
      expect(await jobs.renewalReminders(t.clock.now())).toBe(1);
      expect(await jobs.renewalReminders(t.clock.now())).toBe(0); // already told today
      await t.ds.query(`DELETE FROM notification_logs`);
      await setEndsIn(2.5);
      expect(await jobs.renewalReminders(t.clock.now())).toBe(1);
      await t.ds.query(`DELETE FROM notification_logs`);
      await setEndsIn(0.5);
      expect(await jobs.renewalReminders(t.clock.now())).toBe(1);
      expect(t.notifier.sent.filter((x) => x.template === 'subscription_expiring').length).toBe(3);
    });
  });

  describe('invoice numbering', () => {
    it('10 concurrent payments on 10 clinics get gapless, unique numbers', async () => {
      const clinics: SeededClinic[] = [];
      for (let i = 0; i < 10; i++) clinics.push(await seedClinic(t, admin, { name: `Clinic ${i}`, doctorName: `Dr Concurrent ${i}` }));
      const orders = await Promise.all(clinics.map((c) => order(c.clinic.id, 1, admin.cookies)));
      const results = await Promise.all(orders.map((o, i) => http().post(`/clinic-panel/${clinics[i].clinic.id}/billing/orders/${o.orderId}/dev-pay`).set(A())));
      expect(results.every((r) => r.status === 200)).toBe(true);
      const rows = await t.ds.query(`SELECT invoice_no FROM payments ORDER BY invoice_no`);
      const nums = rows.map((r: { invoice_no: string }) => Number(r.invoice_no.split('/')[2]));
      expect(nums).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
      expect(new Set(rows.map((r: { invoice_no: string }) => r.invoice_no)).size).toBe(10);
    });
  });

  describe('admin', () => {
    it('records a manual payment (invoice + paid subscription + audit); lists payments; revenue shows in stats', async () => {
      const s = await seedClinic(t, admin);
      const owner = await withOwner(s);
      await http().post(`/admin/clinics/${s.clinic.id}/manual-payment`).set({ Cookie: owner.cookies }).send({ planId: 4, reference: 'UTR123' }).expect(403);
      await http().post(`/admin/clinics/${s.clinic.id}/manual-payment`).set(A()).send({ planId: 4, reference: 'UTR123456' }).expect(201);
      const [pay] = await t.ds.query(`SELECT * FROM payments`);
      expect(pay).toMatchObject({ method: 'manual', status: 'captured', reference: 'UTR123456', amount: '11798.82' });
      expect(pay.invoice_no).toMatch(/\/0001$/);
      expect((await t.ds.query(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'payment.recorded_manually'`))[0].n).toBe(1);

      const list = (await http().get('/admin/payments?status=captured').set(A()).expect(200)).body;
      expect(list.total).toBe(1);
      const stats = (await http().get('/admin/stats').set(A()).expect(200)).body;
      expect(stats.revenue.total).toBe('11798.82');
      expect(stats.subscriptions.paying).toBe(1);
      await http().post(`/admin/clinics/99999/manual-payment`).set(A()).send({ planId: 4, reference: 'UTR123456' }).expect(404);
    });
  });
});
