import request from 'supertest';
import { UserRole } from '../src/common/enums.js';
import { createTestApp, TestApp } from './helpers/app.js';
import { loginAs, resetData, Session } from './helpers/auth.js';
import { seedClinic } from './helpers/seed.js';

describe('Public discovery (e2e)', () => {
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
    admin = await loginAs(t, UserRole.SUPER_ADMIN, '9000000001');
    // Monday 5 Oct 2026, 10:00 IST
    t.clock.set(new Date('2026-10-05T04:30:00Z'));
  });

  it('is public (no login) and hides unpublished clinics everywhere', async () => {
    const s = await seedClinic(t, admin, { publish: false });
    expect((await http().get('/clinics').expect(200)).body.total).toBe(0);
    await http().get(`/clinics/${s.clinic.slug}`).expect(404);
    await http().get(`/doctors/${s.doctor.slug}`).expect(404);
    const map = (await http().get('/sitemap-data').expect(200)).body;
    expect(map.clinics).toHaveLength(0);
    expect(map.doctors).toHaveLength(0);
  });

  it('shows published clinics with only whitelisted fields', async () => {
    const s = await seedClinic(t, admin);
    const list = (await http().get('/clinics').expect(200)).body;
    expect(list.total).toBe(1);
    expect(list.items[0].specializations).toEqual(['Physician']);
    const detail = (await http().get(`/clinics/${s.clinic.slug}`).expect(200)).body;
    expect(detail.doctors[0].schedules[0]).toMatchObject({ weekday: 1, startTime: '09:00', endTime: '13:00' });
    for (const hidden of ['registrationNo', 'trialDays', 'createdById', 'status', 'approvedById']) {
      expect(detail).not.toHaveProperty(hidden);
    }
    expect((await http().get(`/doctors/${s.doctor.slug}`).expect(200)).body.clinic.slug).toBe(s.clinic.slug);
    const map = (await http().get('/sitemap-data').expect(200)).body;
    expect(map.clinics[0].slug).toBe(s.clinic.slug);
    expect(map.specializations[0].slug).toBe('physician');
  });

  it('expired subscription: hidden from search, direct URL, doctor page and sitemap; visible within grace', async () => {
    const s = await seedClinic(t, admin);
    // expired 2 days ago: still inside the 3-day grace window
    await t.ds.query(`UPDATE subscriptions SET starts_at = now() - interval '40 days', ends_at = now() - interval '2 days' WHERE clinic_id = $1`, [s.clinic.id]);
    await http().get(`/clinics/${s.clinic.slug}`).expect(200);
    // expired 5 days ago: past grace
    await t.ds.query(`UPDATE subscriptions SET ends_at = now() - interval '5 days' WHERE clinic_id = $1`, [s.clinic.id]);
    expect((await http().get('/clinics').expect(200)).body.total).toBe(0);
    await http().get(`/clinics/${s.clinic.slug}`).expect(404);
    await http().get(`/doctors/${s.doctor.slug}`).expect(404);
    expect((await http().get('/sitemap-data').expect(200)).body.clinics).toHaveLength(0);
    // renewing brings it back
    await t.ds.query(`UPDATE subscriptions SET ends_at = now() + interval '10 days' WHERE clinic_id = $1`, [s.clinic.id]);
    await http().get(`/clinics/${s.clinic.slug}`).expect(200);
  });

  it('suspended clinics disappear', async () => {
    const s = await seedClinic(t, admin);
    await http().post(`/admin/clinics/${s.clinic.id}/suspend`).set({ Cookie: admin.cookies }).expect(201);
    await http().get(`/clinics/${s.clinic.slug}`).expect(404);
  });

  it('filters by area, specialization, text (incl. typo + doctor name) and availability today', async () => {
    const a = await seedClinic(t, admin, { name: 'Sharma Clinic', area: 'Civil Lines', specializationId: 1, doctorName: 'Dr Anil Sharma' });
    const b = await seedClinic(t, admin, { name: 'Kids Care', area: 'Rajendra Nagar', specializationId: 2, doctorName: 'Dr Meena Gupta', weekday: 3 });

    const names = async (qs: string) => (await http().get(`/clinics?${qs}`).expect(200)).body.items.map((i: { name: string }) => i.name);
    expect(await names('area=Rajendra%20Nagar')).toEqual(['Kids Care']);
    expect(await names('specialization=pediatrician')).toEqual(['Kids Care']);
    expect(await names('q=Sharmaa')).toEqual(['Sharma Clinic']);
    expect(await names('q=meena')).toEqual(['Kids Care']);
    expect(await names('q=physician')).toEqual(['Sharma Clinic']);
    // Monday: only Sharma Clinic has a Monday session
    expect(await names('availableToday=true')).toEqual(['Sharma Clinic']);

    // doctor on leave today disappears from "available today"
    await t.ds.query(`INSERT INTO doctor_leaves (doctor_id, leave_date) VALUES ($1, '2026-10-05')`, [a.doctor.id]);
    expect(await names('availableToday=true')).toEqual([]);
    expect(b.clinic.id).toBeDefined();
  });

  it('paginates and validates query params', async () => {
    for (let i = 0; i < 3; i++) await seedClinic(t, admin, { name: `Clinic ${i}`, doctorName: `Dr Num ${i}` });
    const p = (await http().get('/clinics?limit=2&page=2').expect(200)).body;
    expect(p.items).toHaveLength(1);
    expect(p.pages).toBe(2);
    await http().get('/clinics?limit=1000').expect(400);
    await http().get('/clinics?specialization=DROP%20TABLE').expect(400);
  });

  it('lists specializations and areas', async () => {
    expect((await http().get('/specializations').expect(200)).body.length).toBeGreaterThan(0);
    expect((await http().get('/areas').expect(200)).body).toContain('Civil Lines');
  });

  it('survives hostile search input', async () => {
    await seedClinic(t, admin);
    await http().get(`/clinics?q=${encodeURIComponent("'; DROP TABLE clinics;--")}`).expect(200);
    await http().get(`/clinics?q=${encodeURIComponent('%_\\')}`).expect(200);
    expect((await http().get('/clinics').expect(200)).body.total).toBe(1);
  });
});
