import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import request from 'supertest';
import sharp from 'sharp';
import { RateLimitGuard } from '../src/common/security.guards.js';
import { NotificationsService } from '../src/common/notifications.service.js';
import { UserRole } from '../src/common/enums.js';
import { createTestApp, TestApp } from './helpers/app.js';
import { loginAs, resetData, Session, tokenFor } from './helpers/auth.js';
import { seedClinic } from './helpers/seed.js';

interface RouteInfo {
  method: string;
  path: string;
  isPublic: boolean;
  roles: UserRole[] | undefined;
}

function inventory(t: TestApp): RouteInfo[] {
  const discovery = t.app.get(DiscoveryService);
  const scanner = t.app.get(MetadataScanner);
  const verbs = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  const routes: RouteInfo[] = [];
  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const base = (Reflect.getMetadata(PATH_METADATA, metatype) as string) ?? '';
    for (const name of scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
      const handler = instance[name];
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const sub = (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? '';
      const path = `/${base}/${sub}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      routes.push({
        method: verbs[method],
        path,
        isPublic: Boolean(Reflect.getMetadata('isPublic', handler) ?? Reflect.getMetadata('isPublic', metatype)),
        roles: (Reflect.getMetadata('roles', handler) ?? Reflect.getMetadata('roles', metatype)) as UserRole[] | undefined,
      });
    }
  }
  return routes;
}

const concrete = (p: string) => p.replace(/:\w+/g, '1');

describe('Security (e2e)', () => {
  let t: TestApp;
  let admin: Session;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetData(t);
    t.clock.set(new Date('2026-10-05T04:30:00Z'));
    admin = await loginAs(t, UserRole.SUPER_ADMIN, '9000000001');
  });

  describe('route inventory', () => {
    it('the set of public routes is exactly the reviewed list', () => {
      const publicRoutes = inventory(t).filter((r) => r.isPublic).map((r) => `${r.method} ${r.path}`).sort();
      expect(publicRoutes).toEqual(
        [
          'GET /health', 'GET /specializations', 'GET /areas', 'GET /clinics', 'GET /clinics/:slug', 'GET /doctors/:slug',
          'GET /sitemap-data', 'GET /doctors/:slug/availability', 'GET /queue/:publicId', 'GET /documents/:docId',
          'GET /auth/session', 'POST /auth/otp/send', 'POST /auth/otp/verify', 'POST /auth/refresh', 'POST /auth/logout', 'POST /webhooks/razorpay',
        ].sort(),
      );
    });

    it('every non-public route answers 401 without a session', async () => {
      const routes = inventory(t).filter((r) => !r.isPublic);
      expect(routes.length).toBeGreaterThan(40);
      for (const r of routes) {
        const res = await (http() as unknown as Record<string, (u: string) => request.Test>)[r.method.toLowerCase()](concrete(r.path));
        expect(res.status, `${r.method} ${r.path}`).toBe(401);
      }
    });

    it('patients get 403 on every route restricted to other roles', async () => {
      const patient = await tokenFor(t, UserRole.PATIENT, '7000000001');
      const restricted = inventory(t).filter((r) => !r.isPublic && r.roles && !r.roles.includes(UserRole.PATIENT));
      expect(restricted.length).toBeGreaterThan(30);
      for (const r of restricted) {
        const res = await (http() as unknown as Record<string, (u: string) => request.Test>)[r.method.toLowerCase()](concrete(r.path)).set('Authorization', patient.Authorization);
        expect(res.status, `${r.method} ${r.path}`).toBe(403);
      }
    });

    it('clinic owners/staff get 403 on every admin-only route', async () => {
      const owner = await tokenFor(t, UserRole.CLINIC_OWNER, '9555555551');
      const adminOnly = inventory(t).filter((r) => !r.isPublic && r.roles?.length === 1 && r.roles[0] === UserRole.SUPER_ADMIN);
      expect(adminOnly.length).toBeGreaterThan(25);
      for (const r of adminOnly) {
        const res = await (http() as unknown as Record<string, (u: string) => request.Test>)[r.method.toLowerCase()](concrete(r.path)).set('Authorization', owner.Authorization);
        expect(res.status, `${r.method} ${r.path}`).toBe(403);
      }
    });
  });

  describe('abuse controls', () => {
    it('blocks cross-site state changes that ride on session cookies', async () => {
      await http().post('/auth/logout').set({ Cookie: admin.cookies, Origin: 'https://evil.example' }).expect(403);
      await http().post('/auth/logout').set({ Cookie: admin.cookies, Origin: 'http://localhost:3000' }).expect(204);
      await http().post('/auth/logout').set({ Cookie: admin.cookies }).expect(204); // non-browser clients send no Origin
    });

    it('rate limits per IP and reports headers', async () => {
      const guard = t.app.get(RateLimitGuard);
      const original = guard.limit;
      guard.limit = 3;
      await t.redis.flushdb();
      try {
        const get = () => http().get('/areas');
        expect((await get()).headers['x-ratelimit-limit']).toBe('3');
        await get();
        await get();
        const res = await get();
        expect(res.status).toBe(429);
        expect(res.headers['retry-after']).toBeDefined();
        await http().get('/health').expect(200); // health is exempt
      } finally {
        guard.limit = original;
      }
    });

    it('sets security headers and does not leak the framework', async () => {
      const res = await http().get('/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('rejects unknown JSON fields and oversized uploads', async () => {
      await http().post('/auth/otp/send').send({ mobile: '9876543210', admin: true }).expect(400);
      const c = await seedClinic(t, admin);
      const big = Buffer.alloc(9 * 1024 * 1024, 1);
      await http().post(`/admin/clinics/${c.clinic.id}/images`).set({ Cookie: admin.cookies }).attach('file', big, 'big.png').expect(413);
    });
  });

  describe('patient data isolation & privacy', () => {
    it('a patient cannot see or act on another patient\'s data', async () => {
      const s = await seedClinic(t, admin);
      const a = await tokenFor(t, UserRole.PATIENT, '7000000001');
      const b = await tokenFor(t, UserRole.PATIENT, '7000000002');
      const booked = await http().post('/bookings').set('Authorization', a.Authorization).send({ scheduleId: s.schedule.id, date: '2026-10-12', patient: { name: 'Secret Name' }, consent: true }).expect(201);
      expect((await http().get('/bookings/mine').set('Authorization', b.Authorization).expect(200)).body).toEqual([]);
      expect((await http().get('/patients').set('Authorization', b.Authorization).expect(200)).body).toEqual([]);
      await http().post(`/bookings/${booked.body.publicId}/cancel`).set('Authorization', b.Authorization).expect(404);
      const exp = (await http().get('/me/data-export').set('Authorization', b.Authorization).expect(200)).body;
      expect(JSON.stringify(exp)).not.toContain('Secret Name');
      expect((await http().get(`/queue/${booked.body.publicId}`).expect(200)).body).not.toHaveProperty('patientName');
    });

    it('export -> delete request -> admin anonymization removes personal data but keeps clinic records', async () => {
      const s = await seedClinic(t, admin);
      const a = await tokenFor(t, UserRole.PATIENT, '7000000001');
      await http().post('/bookings').set('Authorization', a.Authorization).send({ scheduleId: s.schedule.id, date: '2026-10-12', patient: { name: 'Sunita Verma', age: 33 }, consent: true }).expect(201);
      const exp = (await http().get('/me/data-export').set('Authorization', a.Authorization).expect(200)).body;
      expect(exp.patients[0].name).toBe('Sunita Verma');
      expect(exp.appointments).toHaveLength(1);

      expect((await http().post('/me/delete-request').set('Authorization', a.Authorization).send({ reason: 'privacy' }).expect(200)).body.status).toBe('requested');
      expect((await http().post('/me/delete-request').set('Authorization', a.Authorization).send({}).expect(200)).body.status).toBe('already_requested');
      const pending = (await http().get('/admin/privacy-requests').set({ Cookie: admin.cookies }).expect(200)).body;
      expect(pending).toHaveLength(1);

      // upcoming booking blocks erasure until it is cancelled
      await http().post(`/admin/users/${a.userId}/anonymize`).set({ Cookie: admin.cookies }).expect(409);
      await t.ds.query(`UPDATE appointments SET status = 'cancelled_by_patient'`);
      await http().post(`/admin/users/${a.userId}/anonymize`).set({ Cookie: admin.cookies }).expect(200);

      const [u] = await t.ds.query(`SELECT name, mobile, is_active FROM users WHERE id = $1`, [a.userId]);
      expect(u).toMatchObject({ name: 'Deleted user', is_active: false });
      expect(u.mobile).toBe(`del${a.userId}`);
      const [p] = await t.ds.query(`SELECT name, age FROM patients WHERE user_id = $1`, [a.userId]);
      expect(p).toMatchObject({ name: 'Deleted patient', age: null });
      expect((await t.ds.query(`SELECT COUNT(*)::int AS n FROM appointments`))[0].n).toBe(1);
      expect((await http().get('/admin/privacy-requests').set({ Cookie: admin.cookies }).expect(200)).body).toHaveLength(0);

      const staff = await tokenFor(t, UserRole.CLINIC_STAFF, '9555555552');
      await http().post(`/admin/users/${staff.userId}/anonymize`).set({ Cookie: admin.cookies }).expect(409); // staff accounts are not patients
    });
  });

  describe('KYC documents', () => {
    it('admin uploads, verifies and gets short-lived signed links; links cannot be forged or reused after expiry', async () => {
      const s = await seedClinic(t, admin);
      const C = { Cookie: admin.cookies };
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

      await http().post(`/admin/clinics/${s.clinic.id}/documents`).set(C).field('docType', 'id_proof').attach('file', Buffer.from('MZ\x90\x00 not a document'), 'evil.pdf').expect(400);
      await http().post(`/admin/clinics/${s.clinic.id}/documents`).set(C).field('docType', 'selfie').attach('file', pdf, 'a.pdf').expect(400);
      const doc = (await http().post(`/admin/clinics/${s.clinic.id}/documents`).set(C).field('docType', 'clinic_registration').attach('file', pdf, 'reg.pdf').expect(201)).body;
      expect(doc).toMatchObject({ docType: 'clinic_registration', verified: false });
      expect(JSON.stringify(doc)).not.toContain('documents/');

      await http().post(`/admin/documents/${doc.id}/verify`).set(C).send({ verified: true }).expect(201);
      const { url, expiresAt } = (await http().get(`/admin/clinics/${s.clinic.id}/documents/${doc.id}/link`).set(C).expect(200)).body;
      const path = new URL(url).pathname + new URL(url).search;
      expect(new Date(expiresAt).getTime() - t.clock.now().getTime()).toBe(5 * 60_000);

      const ok = await http().get(path).expect(200);
      expect(ok.headers['content-type']).toContain('application/pdf');
      expect(ok.headers['cache-control']).toContain('no-store');
      await http().get(path.replace(/sig=\w+/, 'sig=' + 'a'.repeat(64))).expect(403);
      await http().get(path.replace(/exp=\d+/, 'exp=9999999999999')).expect(403);
      await http().get(`/documents/${doc.id}`).expect(400);
      t.clock.advanceMs(6 * 60_000);
      await http().get(path).expect(403);

      // not reachable through the public uploads folder
      await http().get('/uploads/../private/documents').expect(404);
      const owner = await tokenFor(t, UserRole.CLINIC_OWNER, '9555555551');
      await http().get(`/admin/clinics/${s.clinic.id}/documents`).set('Authorization', owner.Authorization).expect(403);
    });
  });

  describe('notification delivery', () => {
    it('retries WhatsApp with backoff, reports failure (no SMS fallback) and never logs the OTP', async () => {
      const svc = t.app.get(NotificationsService);
      svc.sleep = async () => {};
      await t.ds.query('DELETE FROM notification_logs');
      t.notifier.sent = [];
      t.notifier.attempts = [];
      t.notifier.failChannels = new Set(['whatsapp']);
      expect(await svc.send({ to: '919876543210', template: 'walkin_token', params: { clinic: 'C', token: 1, link: 'L' } })).toBe(false);
      expect(t.notifier.attempts).toEqual(['whatsapp', 'whatsapp', 'whatsapp']);
      expect(await t.ds.query(`SELECT channel, status FROM notification_logs`)).toEqual([{ channel: 'whatsapp', status: 'failed' }]);

      t.notifier.failChannels = new Set();
      expect(await svc.send({ to: '919876543210', template: 'otp', params: { code: '654321', minutes: 5 } })).toBe(true);
      const payloads = await t.ds.query(`SELECT payload FROM notification_logs WHERE template = 'otp'`);
      expect(JSON.stringify(payloads)).not.toContain('654321');
      svc.sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    });

    it('OTP send reports failure instead of pretending when delivery is impossible', async () => {
      const svc = t.app.get(NotificationsService);
      svc.sleep = async () => {};
      t.notifier.failChannels = new Set(['whatsapp']);
      await request(t.app.getHttpServer()).post('/auth/otp/send').send({ mobile: '9876543210' }).expect(503);
      t.notifier.failChannels = new Set();
      svc.sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    });
  });

  it('keeps image uploads honest (sharp re-encodes, SVG/script payloads rejected)', async () => {
    const s = await seedClinic(t, admin);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await http().post(`/admin/clinics/${s.clinic.id}/images`).set({ Cookie: admin.cookies }).attach('file', svg, 'x.svg').expect(400);
    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#abc' } }).png().toBuffer();
    await http().post(`/admin/clinics/${s.clinic.id}/images`).set({ Cookie: admin.cookies }).attach('file', png, 'x.png').expect(201);
  });
});
