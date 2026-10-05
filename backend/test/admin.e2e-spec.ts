import request from 'supertest';
import sharp from 'sharp';
import { UserRole } from '../src/common/enums.js';
import { createTestApp, TestApp } from './helpers/app.js';
import { loginAs, resetData, Session } from './helpers/auth.js';

describe('Admin: clinics, doctors, schedules (e2e)', () => {
  let t: TestApp;
  let admin: Session;
  const http = () => request(t.app.getHttpServer());
  const A = () => ({ Cookie: admin.cookies });

  const clinicBody = {
    name: 'Sharma Clinic',
    phone: '07662 400123',
    addressLine: '12 Main Road',
    area: 'Civil Lines',
    mapUrl: 'https://maps.app.goo.gl/abc123',
  };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetData(t);
    admin = await loginAs(t, UserRole.SUPER_ADMIN, '9000000001');
  });

  const createClinic = async (over: object = {}) => (await http().post('/admin/clinics').set(A()).send({ ...clinicBody, ...over }).expect(201)).body;

  describe('access control', () => {
    it('401 without session, 403 for non-admins', async () => {
      await http().get('/admin/clinics').expect(401);
      const patient = await loginAs(t, UserRole.PATIENT, '9000000002');
      await http().get('/admin/clinics').set({ Cookie: patient.cookies }).expect(403);
      const owner = await loginAs(t, UserRole.CLINIC_OWNER, '9000000003');
      await http().post('/admin/clinics').set({ Cookie: owner.cookies }).send(clinicBody).expect(403);
    });
  });

  describe('clinic CRUD & validation', () => {
    it('creates a pending clinic with a slug and strips spaces from phone', async () => {
      const c = await createClinic();
      expect(c.status).toBe('pending');
      expect(c.slug).toBe('sharma-clinic');
      expect(c.phone).toBe('07662400123');
      const second = await createClinic();
      expect(second.slug).toBe('sharma-clinic-2');
    });

    it.each([
      ['http://maps.app.goo.gl/x', 'non-https'],
      ['https://evil.com/maps', 'wrong host'],
      ['https://www.google.com/search?q=x', 'not /maps path'],
    ])('rejects map url %s (%s)', async (mapUrl) => {
      await http().post('/admin/clinics').set(A()).send({ ...clinicBody, mapUrl }).expect(400);
    });

    it('accepts google.com/maps links', async () => {
      await createClinic({ mapUrl: 'https://www.google.com/maps/place/Rewa' });
    });

    it('rejects unknown areas and unknown fields', async () => {
      await http().post('/admin/clinics').set(A()).send({ ...clinicBody, area: 'Atlantis' }).expect(400);
      await http().post('/admin/clinics').set(A()).send({ ...clinicBody, status: 'approved' }).expect(400);
    });

    it('updates and lists with filters', async () => {
      const c = await createClinic();
      await http().patch(`/admin/clinics/${c.id}`).set(A()).send({ description: 'Hello' }).expect(200);
      const list = await http().get('/admin/clinics?status=pending&q=sharma').set(A()).expect(200);
      expect(list.body.total).toBe(1);
      const none = await http().get('/admin/clinics?status=approved').set(A()).expect(200);
      expect(none.body.total).toBe(0);
    });
  });

  describe('images', () => {
    const png = (color: string) => sharp({ create: { width: 2400, height: 1800, channels: 3, background: color } }).png().toBuffer();

    it('converts to WebP, caps size, sets first as cover, reorders, deletes', async () => {
      const c = await createClinic();
      const ids: string[] = [];
      for (const color of ['#f00', '#0f0', '#00f']) {
        const res = await http().post(`/admin/clinics/${c.id}/images`).set(A()).attach('file', await png(color), 'x.png').expect(201);
        expect(res.body.imageUrl).toMatch(/\.webp$/);
        ids.push(res.body.id);
      }
      const first = (await http().get(`/admin/clinics/${c.id}`).set(A())).body;
      expect(first.coverUrl).toBe(first.images[0].imageUrl);

      const fetched = await http().get(new URL(first.images[0].imageUrl).pathname).expect(200);
      const meta = await sharp(fetched.body).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBeLessThanOrEqual(1600);
      await http().get(new URL(first.images[0].imageUrl).pathname.replace('.webp', '-thumb.webp')).expect(200);

      await http().put(`/admin/clinics/${c.id}/images/order`).set(A()).send({ ids: [ids[2], ids[0], ids[1]] }).expect(200);
      const after = (await http().get(`/admin/clinics/${c.id}/images`).set(A())).body;
      expect(after.map((i: { id: string }) => i.id)).toEqual([ids[2], ids[0], ids[1]]);
      await http().put(`/admin/clinics/${c.id}/images/order`).set(A()).send({ ids: [ids[0]] }).expect(400);

      await http().post(`/admin/clinics/${c.id}/images/${ids[1]}/cover`).set(A()).expect(201);
      await http().delete(`/admin/clinics/${c.id}/images/${ids[1]}`).set(A()).expect(200);
      const detail = (await http().get(`/admin/clinics/${c.id}`).set(A())).body;
      expect(detail.coverUrl).toBe(detail.images[0].imageUrl);
    });

    it('rejects non-images and wrong file types', async () => {
      const c = await createClinic();
      await http().post(`/admin/clinics/${c.id}/images`).set(A()).attach('file', Buffer.from('<script>alert(1)</script>'), 'x.png').expect(400);
      const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).gif().toBuffer();
      await http().post(`/admin/clinics/${c.id}/images`).set(A()).attach('file', gif, 'x.gif').expect(400);
      await http().post(`/admin/clinics/${c.id}/images`).set(A()).expect(400);
    });
  });

  describe('doctors & schedules', () => {
    it('creates doctors and rejects unknown specialization', async () => {
      const c = await createClinic();
      await http().post(`/admin/clinics/${c.id}/doctors`).set(A()).send({ specializationId: 999, name: 'Dr X' }).expect(400);
      const d = await http().post(`/admin/clinics/${c.id}/doctors`).set(A()).send({ specializationId: 1, name: 'Dr Anil Sharma', consultationFee: '400', languages: ['Hindi'] }).expect(201);
      expect(d.body.slug).toBe('dr-anil-sharma');
    });

    it('rejects overlapping sessions on the same weekday, allows adjacent and other days', async () => {
      const c = await createClinic();
      const d = (await http().post(`/admin/clinics/${c.id}/doctors`).set(A()).send({ specializationId: 1, name: 'Dr A' }).expect(201)).body;
      const s = (over: object) => http().post(`/admin/doctors/${d.id}/schedules`).set(A()).send({ weekday: 1, startTime: '09:00', endTime: '13:00', maxTokens: 30, ...over });
      await s({}).expect(201);
      const clash = await s({ startTime: '12:00', endTime: '15:00' }).expect(409);
      expect(clash.body.message).toMatch(/Overlaps/);
      await s({ startTime: '13:00', endTime: '17:00', sessionName: 'Evening' }).expect(201);
      await s({ weekday: 2, startTime: '12:00', endTime: '15:00' }).expect(201);
    });

    it('validates schedule shape', async () => {
      const c = await createClinic();
      const d = (await http().post(`/admin/clinics/${c.id}/doctors`).set(A()).send({ specializationId: 1, name: 'Dr B' }).expect(201)).body;
      const s = (over: object) => http().post(`/admin/doctors/${d.id}/schedules`).set(A()).send({ weekday: 1, startTime: '09:00', endTime: '13:00', maxTokens: 30, ...over });
      await s({ endTime: '08:00' }).expect(400);
      await s({ startTime: '9am' }).expect(400);
      await s({ walkinReserved: 30 }).expect(400);
      await s({ mode: 'slot' }).expect(400);
      await s({ mode: 'slot', slotMinutes: 15, maxTokens: 100 }).expect(400);
      await s({ mode: 'slot', slotMinutes: 15, maxTokens: 16 }).expect(201);
    });

    it('update re-checks overlap; delete removes unused schedules', async () => {
      const c = await createClinic();
      const d = (await http().post(`/admin/clinics/${c.id}/doctors`).set(A()).send({ specializationId: 1, name: 'Dr C' }).expect(201)).body;
      const a = (await http().post(`/admin/doctors/${d.id}/schedules`).set(A()).send({ weekday: 3, startTime: '09:00', endTime: '12:00', maxTokens: 20 }).expect(201)).body;
      const b = (await http().post(`/admin/doctors/${d.id}/schedules`).set(A()).send({ weekday: 3, startTime: '16:00', endTime: '19:00', maxTokens: 20 }).expect(201)).body;
      await http().patch(`/admin/schedules/${b.id}`).set(A()).send({ startTime: '11:00' }).expect(409);
      await http().patch(`/admin/schedules/${a.id}`).set(A()).send({ maxTokens: 25 }).expect(200);
      const del = await http().delete(`/admin/schedules/${b.id}`).set(A()).expect(200);
      expect(del.body.deleted).toBe(true);
    });
  });

  describe('publish, trial & gifted days', () => {
    it('publishes with the default 30-day trial and audits it', async () => {
      const c = await createClinic();
      const res = await http().post(`/admin/clinics/${c.id}/publish`).set(A()).send({}).expect(201);
      expect(res.body.clinic.status).toBe('approved');
      const days = (new Date(res.body.trial.endsAt).getTime() - new Date(res.body.trial.startsAt).getTime()) / 86_400_000;
      expect(days).toBeCloseTo(30, 1);
      const audit = await http().get('/admin/audit-logs?action=clinic.published').set(A()).expect(200);
      expect(audit.body.total).toBe(1);
      await http().post(`/admin/clinics/${c.id}/publish`).set(A()).send({}).expect(409);
    });

    it('per-clinic override beats the global default; global default is editable', async () => {
      const c1 = await createClinic();
      const r1 = await http().post(`/admin/clinics/${c1.id}/publish`).set(A()).send({ trialDays: 90 }).expect(201);
      expect((new Date(r1.body.trial.endsAt).getTime() - new Date(r1.body.trial.startsAt).getTime()) / 86_400_000).toBeCloseTo(90, 1);

      await http().put('/admin/settings').set(A()).send({ default_trial_days: 14 }).expect(200);
      const c2 = await createClinic({ name: 'Second Clinic' });
      const r2 = await http().post(`/admin/clinics/${c2.id}/publish`).set(A()).send({}).expect(201);
      expect((new Date(r2.body.trial.endsAt).getTime() - new Date(r2.body.trial.startsAt).getTime()) / 86_400_000).toBeCloseTo(14, 1);
      await http().put('/admin/settings').set(A()).send({ default_trial_days: 30 }).expect(200);
    });

    it('gifted days extend from the existing end date', async () => {
      const c = await createClinic();
      const pub = await http().post(`/admin/clinics/${c.id}/publish`).set(A()).send({}).expect(201);
      const gift = await http().post(`/admin/clinics/${c.id}/gift-days`).set(A()).send({ days: 10, reason: 'goodwill' }).expect(201);
      expect(new Date(gift.body.startsAt).getTime()).toBe(new Date(pub.body.trial.endsAt).getTime());
      expect((new Date(gift.body.endsAt).getTime() - new Date(gift.body.startsAt).getTime()) / 86_400_000).toBeCloseTo(10, 1);
    });

    it('suspend / reactivate / reject flows', async () => {
      const c = await createClinic();
      await http().post(`/admin/clinics/${c.id}/suspend`).set(A()).expect(409);
      await http().post(`/admin/clinics/${c.id}/publish`).set(A()).send({}).expect(201);
      await http().post(`/admin/clinics/${c.id}/suspend`).set(A()).expect(201);
      await http().post(`/admin/clinics/${c.id}/publish`).set(A()).send({}).expect(409);
      await http().post(`/admin/clinics/${c.id}/reactivate`).set(A()).expect(201);
      const c2 = await createClinic({ name: 'Other' });
      await http().post(`/admin/clinics/${c2.id}/reject`).set(A()).send({ reason: 'incomplete docs' }).expect(201);
    });
  });

  describe('members (owner / receptionist logins)', () => {
    it('creates logins, blocks conflicting roles and duplicates', async () => {
      const c = await createClinic();
      const ok = await http().post(`/admin/clinics/${c.id}/members`).set(A()).send({ mobile: '9111111111', role: 'clinic_owner', name: 'Dr Owner' }).expect(201);
      expect(ok.body.mobile).toBe('919111111111');
      await http().post(`/admin/clinics/${c.id}/members`).set(A()).send({ mobile: '9111111111', role: 'clinic_owner' }).expect(409);
      await http().post(`/admin/clinics/${c.id}/members`).set(A()).send({ mobile: '9111111111', role: 'clinic_staff' }).expect(409);
      await http().post(`/admin/clinics/${c.id}/members`).set(A()).send({ mobile: '9000000001', role: 'clinic_staff' }).expect(409);
      const detail = (await http().get(`/admin/clinics/${c.id}`).set(A())).body;
      expect(detail.members).toHaveLength(1);
    });
  });

  describe('platform admin', () => {
    it('manages areas, plans, stats', async () => {
      await http().post('/admin/areas').set(A()).send({ name: 'Padra' }).expect(201);
      await http().post('/admin/areas').set(A()).send({ name: 'Padra' }).expect(409);
      const plans = await http().get('/admin/plans').set(A()).expect(200);
      expect(plans.body).toHaveLength(4);
      await http().patch(`/admin/plans/${plans.body[0].id}`).set(A()).send({ price: '1299' }).expect(200);
      await http().put('/admin/settings').set(A()).send({ grace_days: -1 }).expect(400);
      const stats = await http().get('/admin/stats').set(A()).expect(200);
      expect(stats.body.clinics).toHaveProperty('pending');
    });
  });
});
