import request from 'supertest';
import { UserRole } from '../../src/common/enums.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { TestApp } from './app.js';

export interface Session {
  cookies: string[];
  userId: string;
  mobile: string;
}

/** Ensures a user with this role exists (staff/owner/admin are admin-created in prod) and logs in through the real OTP flow. */
export async function loginAs(t: TestApp, role: UserRole, ten: string): Promise<Session> {
  const mobile = `91${ten}`;
  await t.ds.query(
    `INSERT INTO users (role, mobile, name) VALUES ($1, $2, $3) ON CONFLICT (mobile) DO UPDATE SET role = EXCLUDED.role`,
    [role, mobile, `${role} ${ten}`],
  );
  const http = request(t.app.getHttpServer());
  await http.post('/auth/otp/send').send({ mobile: ten }).expect(204);
  const res = await http.post('/auth/otp/verify').send({ mobile: ten, code: t.notifier.lastOtp(mobile) }).expect(200);
  return { cookies: res.headers['set-cookie'] as unknown as string[], userId: res.body.id, mobile };
}

export async function resetData(t: TestApp) {
  await t.redis.flushdb();
  await t.ds.query(`TRUNCATE notification_logs, audit_logs, payments, invoice_counters, subscriptions, appointments, token_counters, patients,
    doctor_leaves, doctor_schedules, doctors, clinic_images, clinic_documents, clinic_members, clinics, otp_requests, users RESTART IDENTITY CASCADE`);
  // reference data that tests are allowed to edit
  await t.ds.query(`TRUNCATE plans RESTART IDENTITY CASCADE`);
  await t.ds.query(`INSERT INTO plans (name,duration_months,price,sort_order) VALUES ('Monthly',1,1199,1),('Quarterly',3,2999,2),('Half-Yearly',6,5499,3),('Annual',12,9999,4)`);
  await t.ds.query(`UPDATE app_settings SET value = CASE key WHEN 'default_trial_days' THEN '30' WHEN 'grace_days' THEN '3' WHEN 'advance_booking_days' THEN '7' WHEN 'default_reminder_minutes' THEN '30' ELSE '60' END`);
}

/** Creates a user directly and returns a Bearer header (skips the OTP flow and its per-IP rate limit). */
export async function tokenFor(t: TestApp, role: UserRole, ten: string): Promise<{ Authorization: string; userId: string }> {
  const mobile = `91${ten}`;
  const [u] = await t.ds.query(
    `INSERT INTO users (role, mobile) VALUES ($1, $2) ON CONFLICT (mobile) DO UPDATE SET role = EXCLUDED.role RETURNING id`,
    [role, mobile],
  );
  const { accessToken } = await t.app.get(AuthService).issueTokens({ id: u.id, role });
  return { Authorization: `Bearer ${accessToken}`, userId: u.id };
}
