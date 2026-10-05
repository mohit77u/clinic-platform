import request from 'supertest';
import { UserRole } from '../src/common/enums.js';
import { QueueService } from '../src/booking/queue.service.js';
import { createTestApp, TestApp, waitFor } from './helpers/app.js';
import { loginAs, resetData, Session, tokenFor } from './helpers/auth.js';
import { seedClinic, SeededClinic } from './helpers/seed.js';

// Monday 5 Oct 2026, 10:00 IST
const NOW = new Date('2026-10-05T04:30:00Z');
const TODAY = '2026-10-05';
const NEXT_MONDAY = '2026-10-12';

describe('Booking, tokens & queue (e2e)', () => {
  let t: TestApp;
  let admin: Session;
  const http = () => request(t.app.getHttpServer());
  const A = () => ({ Cookie: admin.cookies });
  let n = 0;
  const newPatient = async () => tokenFor(t, UserRole.PATIENT, `7${String(1_000_000 + ++n).padStart(9, '0')}`);

  const book = (auth: { Authorization: string }, scheduleId: string, date = TODAY, name = 'Ramesh') =>
    http().post('/bookings').set('Authorization', auth.Authorization).send({ scheduleId, date, patient: { name, age: 40, gender: 'M' }, consent: true });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetData(t);
    t.notifier.sent = [];
    t.clock.set(NOW);
    admin = await loginAs(t, UserRole.SUPER_ADMIN, '9000000001');
    n = 0;
  });

  describe('availability & validation', () => {
    it('lists upcoming sessions with remaining online capacity', async () => {
      const s = await seedClinic(t, admin, { maxTokens: 10, walkinReserved: 2 });
      const av = (await http().get(`/doctors/${s.doctor.slug}/availability`).expect(200)).body;
      expect(av.days).toHaveLength(8);
      const monday = av.days.find((d: { date: string }) => d.date === TODAY);
      expect(monday.sessions[0]).toMatchObject({ scheduleId: s.schedule.id, capacity: 10, onlineLeft: 8, state: 'open' });
      expect(av.days.find((d: { date: string }) => d.date === '2026-10-06').sessions).toEqual([]);
    });

    it('requires login, patient role and consent', async () => {
      const s = await seedClinic(t, admin);
      await http().post('/bookings').send({}).expect(401);
      const staff = await tokenFor(t, UserRole.CLINIC_STAFF, '9222222222');
      await book(staff, s.schedule.id).expect(403);
      const p = await newPatient();
      await http().post('/bookings').set('Authorization', p.Authorization).send({ scheduleId: s.schedule.id, date: TODAY, patient: { name: 'X Y' }, consent: false }).expect(400);
    });

    it('rejects past, too-far, wrong-weekday, ended-today and unpublished', async () => {
      const s = await seedClinic(t, admin);
      const p = await newPatient();
      await book(p, s.schedule.id, '2026-10-04').expect(400);
      await book(p, s.schedule.id, '2026-10-19').expect(400);
      await book(p, s.schedule.id, '2026-10-06').expect(400);
      t.clock.set(new Date('2026-10-05T09:00:00Z')); // 14:30 IST, after 13:00 end
      await book(p, s.schedule.id, TODAY).expect(400);
      const hidden = await seedClinic(t, admin, { name: 'Hidden', doctorName: 'Dr Hidden', publish: false });
      t.clock.set(NOW);
      await book(p, hidden.schedule.id, TODAY).expect(409);
    });
  });

  describe('booking & token rules', () => {
    it('issues sequential tokens, sends confirmation, hides nothing it should not', async () => {
      const s = await seedClinic(t, admin);
      const tokens: number[] = [];
      for (let i = 0; i < 3; i++) {
        const p = await newPatient();
        const res = await book(p, s.schedule.id).expect(201);
        tokens.push(res.body.tokenNo);
        expect(res.body.publicId).toMatch(/^[0-9a-f-]{36}$/);
      }
      expect(tokens).toEqual([1, 2, 3]);
      await waitFor(() => t.notifier.sent.filter((x) => x.template === 'booking_confirmed').length === 3);
      const confirmations = t.notifier.sent.filter((x) => x.template === 'booking_confirmed');
      expect(confirmations).toHaveLength(3);
      expect(String(confirmations[0].params.text)).toContain('टोकन #1');
    });

    it('estimated time = session start + patients ahead x minutes', async () => {
      const s = await seedClinic(t, admin, { slotMinutes: 10 });
      const r1 = await book(await newPatient(), s.schedule.id).expect(201);
      const r2 = await book(await newPatient(), s.schedule.id).expect(201);
      expect(r1.body.estimatedTime).toBe('09:00');
      expect(r2.body.estimatedTime).toBe('09:10');
    });

    it('blocks the same patient booking the same session twice, but allows a second family profile', async () => {
      const s = await seedClinic(t, admin);
      const p = await newPatient();
      const first = await book(p, s.schedule.id).expect(201);
      await book(p, s.schedule.id).expect(201); // new inline profile => different patient
      const profiles = (await http().get('/patients').set('Authorization', p.Authorization).expect(200)).body;
      expect(profiles).toHaveLength(2);
      const again = await http().post('/bookings').set('Authorization', p.Authorization).send({ scheduleId: s.schedule.id, date: TODAY, patientId: profiles[0].id, consent: true });
      expect(again.status).toBe(409);
      expect(first.body.tokenNo).toBe(1);
    });

    it('cannot book for someone else\'s profile', async () => {
      const s = await seedClinic(t, admin);
      const a = await newPatient();
      const b = await newPatient();
      const prof = (await http().post('/patients').set('Authorization', a.Authorization).send({ name: 'Mine' }).expect(201)).body;
      await http().post('/bookings').set('Authorization', b.Authorization).send({ scheduleId: s.schedule.id, date: TODAY, patientId: prof.id, consent: true }).expect(403);
    });

    it('online capacity excludes walk-in reserve; walk-ins can use it; total never exceeds max', async () => {
      const s = await seedClinic(t, admin, { maxTokens: 3, walkinReserved: 1 });
      const staff = await tokenFor(t, UserRole.SUPER_ADMIN, '9000000001');
      await book(await newPatient(), s.schedule.id).expect(201);
      await book(await newPatient(), s.schedule.id).expect(201);
      const full = await book(await newPatient(), s.schedule.id).expect(409);
      expect(full.body.message).toMatch(/full/i);
      const w = (name: string) => http().post(`/clinic-panel/${s.clinic.id}/walkins`).set('Authorization', staff.Authorization).send({ scheduleId: s.schedule.id, name });
      const w1 = await w('Walk One').expect(201);
      expect(w1.body.tokenNo).toBe(3); // the failed online attempt did not burn a number
      await w('Walk Two').expect(409);
    });

    it('cancelled tokens are never reused, but free capacity', async () => {
      const s = await seedClinic(t, admin, { maxTokens: 2, weekday: 1 });
      const a = await newPatient();
      const b = await newPatient();
      const c = await newPatient();
      const r1 = await book(a, s.schedule.id, NEXT_MONDAY).expect(201);
      await book(b, s.schedule.id, NEXT_MONDAY).expect(201);
      await book(c, s.schedule.id, NEXT_MONDAY).expect(409);
      await http().post(`/bookings/${r1.body.publicId}/cancel`).set('Authorization', a.Authorization).expect(200);
      const r3 = await book(c, s.schedule.id, NEXT_MONDAY).expect(201);
      expect(r3.body.tokenNo).toBe(3);
      await http().post(`/bookings/${r1.body.publicId}/cancel`).set('Authorization', a.Authorization).expect(409);
    });

    it('patients cannot cancel inside the cut-off or other people\'s bookings', async () => {
      const s = await seedClinic(t, admin);
      const a = await newPatient();
      const b = await newPatient();
      const r = await book(a, s.schedule.id, TODAY).expect(201); // session already started
      const late = await http().post(`/bookings/${r.body.publicId}/cancel`).set('Authorization', a.Authorization).expect(409);
      expect(late.body.message).toMatch(/call the clinic/);
      await http().post(`/bookings/${r.body.publicId}/cancel`).set('Authorization', b.Authorization).expect(404);
    });

    it('my bookings lists upcoming and past', async () => {
      const s = await seedClinic(t, admin);
      const a = await newPatient();
      await book(a, s.schedule.id, NEXT_MONDAY).expect(201);
      const up = (await http().get('/bookings/mine').set('Authorization', a.Authorization).expect(200)).body;
      expect(up).toHaveLength(1);
      expect(up[0]).toMatchObject({ tokenNo: 1, clinicName: 'Sharma Clinic', visitDate: NEXT_MONDAY });
      expect((await http().get('/bookings/mine?scope=past').set('Authorization', a.Authorization).expect(200)).body).toHaveLength(0);
    });
  });

  describe('CONCURRENCY (phase 4 gate)', () => {
    it('50 parallel bookings for 5 tokens: exactly 5 succeed, 45 clean "full", tokens unique 1..5', async () => {
      const s = await seedClinic(t, admin, { maxTokens: 5 });
      const patients = await Promise.all(Array.from({ length: 50 }, () => newPatient()));
      const results = await Promise.all(patients.map((p) => book(p, s.schedule.id)));
      const ok = results.filter((r) => r.status === 201);
      const full = results.filter((r) => r.status === 409);
      expect(ok).toHaveLength(5);
      expect(full).toHaveLength(45);
      expect(results.filter((r) => ![201, 409].includes(r.status))).toHaveLength(0);
      expect(ok.map((r) => r.body.tokenNo).sort()).toEqual([1, 2, 3, 4, 5]);
      const [row] = await t.ds.query(`SELECT last_token FROM token_counters WHERE schedule_id = $1`, [s.schedule.id]);
      expect(row.last_token).toBe(5); // rejected attempts rolled back their increment
    });

    it('50 parallel bookings for the LAST token: exactly 1 success', async () => {
      const s = await seedClinic(t, admin, { maxTokens: 5 });
      for (let i = 0; i < 4; i++) await book(await newPatient(), s.schedule.id).expect(201);
      const patients = await Promise.all(Array.from({ length: 50 }, () => newPatient()));
      const results = await Promise.all(patients.map((p) => book(p, s.schedule.id)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(49);
      const rows = await t.ds.query(`SELECT token_no FROM appointments WHERE schedule_id = $1 ORDER BY token_no`, [s.schedule.id]);
      expect(rows.map((r: { token_no: number }) => r.token_no)).toEqual([1, 2, 3, 4, 5]);
    });

    it('the same patient double-clicking 10x books once', async () => {
      const s = await seedClinic(t, admin);
      const p = await newPatient();
      const prof = (await http().post('/patients').set('Authorization', p.Authorization).send({ name: 'Double Click' }).expect(201)).body;
      const results = await Promise.all(
        Array.from({ length: 10 }, () => http().post('/bookings').set('Authorization', p.Authorization).send({ scheduleId: s.schedule.id, date: TODAY, patientId: prof.id, consent: true })),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(9);
      const [row] = await t.ds.query(`SELECT last_token FROM token_counters WHERE schedule_id = $1`, [s.schedule.id]);
      expect(row.last_token).toBe(1);
    });

    it('online + walk-in mixed load yields strictly sequential tokens with no gaps', async () => {
      const s = await seedClinic(t, admin, { maxTokens: 40 });
      const staff = await tokenFor(t, UserRole.SUPER_ADMIN, '9000000001');
      const patients = await Promise.all(Array.from({ length: 20 }, () => newPatient()));
      const online = patients.map((p) => book(p, s.schedule.id));
      const walkins = Array.from({ length: 20 }, (_, i) =>
        http().post(`/clinic-panel/${s.clinic.id}/walkins`).set('Authorization', staff.Authorization).send({ scheduleId: s.schedule.id, name: `Walkin ${i + 1}` }),
      );
      const res = await Promise.all([...online, ...walkins]);
      expect(res.every((r) => r.status === 201)).toBe(true);
      const rows = await t.ds.query(`SELECT token_no FROM appointments WHERE schedule_id = $1 ORDER BY token_no`, [s.schedule.id]);
      expect(rows.map((r: { token_no: number }) => r.token_no)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    });
  });

  describe('clinic panel: access control', () => {
    it('staff only reach their own clinic', async () => {
      const a = await seedClinic(t, admin, { name: 'Clinic A', doctorName: 'Dr A' });
      const b = await seedClinic(t, admin, { name: 'Clinic B', doctorName: 'Dr B' });
      await http().post(`/admin/clinics/${a.clinic.id}/members`).set(A()).send({ mobile: '9333333331', role: 'clinic_staff' }).expect(201);
      const staffA = await loginAs(t, UserRole.CLINIC_STAFF, '9333333331');
      await http().get(`/clinic-panel/${a.clinic.id}/queue`).set({ Cookie: staffA.cookies }).expect(200);
      await http().get(`/clinic-panel/${b.clinic.id}/queue`).set({ Cookie: staffA.cookies }).expect(403);
      await http().post(`/clinic-panel/${b.clinic.id}/walkins`).set({ Cookie: staffA.cookies }).send({ scheduleId: b.schedule.id, name: 'Intruder' }).expect(403);
      await http().get(`/admin/clinics`).set({ Cookie: staffA.cookies }).expect(403);

      // an appointment id from clinic B cannot be driven through clinic A's panel
      const pb = await newPatient();
      await book(pb, b.schedule.id).expect(201);
      const [apptB] = await t.ds.query(`SELECT id FROM appointments WHERE clinic_id = $1`, [b.clinic.id]);
      await http().post(`/clinic-panel/${a.clinic.id}/appointments/${apptB.id}/check-in`).set({ Cookie: staffA.cookies }).expect(404);
      const patient = await newPatient();
      await http().get(`/clinic-panel/${a.clinic.id}/queue`).set('Authorization', patient.Authorization).expect(403);
      await http().get(`/clinic-panel/${a.clinic.id}/queue`).expect(401);
    });
  });

  describe('clinic panel: running the queue', () => {
    let s: SeededClinic;
    let staff: { Authorization: string };
    const P = (path: string) => `/clinic-panel/${s.clinic.id}${path}`;
    const post = (path: string, body: object = {}) => http().post(P(path)).set('Authorization', staff.Authorization).send(body);

    beforeEach(async () => {
      s = await seedClinic(t, admin);
      staff = await tokenFor(t, UserRole.SUPER_ADMIN, '9000000001');
    });

    const queue = async () => (await http().get(P('/queue')).set('Authorization', staff.Authorization).expect(200)).body.sessions[0];
    const ids = async () => (await queue()).appointments.map((a: { id: string }) => a.id);

    it('check-in, call next, complete, with live queue view for the patient', async () => {
      const pts = [await newPatient(), await newPatient(), await newPatient(), await newPatient()];
      const booked = [];
      for (const p of pts) booked.push((await book(p, s.schedule.id).expect(201)).body);
      const [a1, a2, a3, a4] = await ids();

      let live = (await http().get(`/queue/${booked[2].publicId}`).expect(200)).body;
      expect(live).toMatchObject({ tokenNo: 3, patientsAhead: 2, nowServing: 0, status: 'booked' });
      expect(JSON.stringify(live)).not.toContain('Ramesh'); // no patient identity on the public queue page

      await post(`/appointments/${a2}/check-in`).expect(200);
      // call next prefers checked-in patients
      const first = (await post('/sessions/call-next', { scheduleId: s.schedule.id, date: TODAY }).expect(200)).body;
      expect(first.called.tokenNo).toBe(2);
      live = (await http().get(`/queue/${booked[2].publicId}`).expect(200)).body;
      expect(live.nowServing).toBe(2);
      await post(`/appointments/${a2}/complete`).expect(200);

      // falls back to booked when nobody is checked in; completes the previous patient automatically
      const second = (await post('/sessions/call-next', { scheduleId: s.schedule.id, date: TODAY }).expect(200)).body;
      expect(second.called.tokenNo).toBe(1);
      const third = (await post('/sessions/call-next', { scheduleId: s.schedule.id, date: TODAY }).expect(200)).body;
      expect(third.called.tokenNo).toBe(3);
      const q = await queue();
      expect(q.appointments.find((x: { id: string }) => x.id === a1).status).toBe('completed');
      expect(q.nowServing).toBe(3);
      await post(`/appointments/${a3}/complete`).expect(200);
      await post('/sessions/call-next', { scheduleId: s.schedule.id, date: TODAY }).expect(200);
      const end = (await post('/sessions/call-next', { scheduleId: s.schedule.id, date: TODAY }).expect(200)).body;
      expect(end.called).toBeNull();
      expect((await queue()).appointments.find((x: { id: string }) => x.id === a4).status).toBe('completed');
    });

    it('skip, recall, no-show and invalid transitions', async () => {
      for (let i = 0; i < 3; i++) await book(await newPatient(), s.schedule.id).expect(201);
      const [a1, a2, a3] = await ids();
      await post(`/appointments/${a1}/skip`).expect(200);
      const next = (await post('/sessions/call-next', { scheduleId: s.schedule.id, date: TODAY }).expect(200)).body;
      expect(next.called.tokenNo).toBe(2); // skipped patient is passed over
      await post(`/appointments/${a1}/call`).expect(200); // recall; finishes token 2
      expect((await queue()).appointments.find((x: { id: string }) => x.id === a2).status).toBe('completed');
      await post(`/appointments/${a1}/check-in`).expect(409); // already in consultation
      await post(`/appointments/${a2}/no-show`).expect(409); // already completed
      await post(`/appointments/${a3}/no-show`).expect(200);
      await post(`/appointments/${a3}/call`).expect(409);
      await post('/appointments/999999/check-in').expect(404);
    });

    it('clinic cancellation notifies the patient with the reason', async () => {
      await book(await newPatient(), s.schedule.id).expect(201);
      const [a1] = await ids();
      t.notifier.sent = [];
      await post(`/appointments/${a1}/cancel`, { reason: 'Doctor emergency' }).expect(200);
      await waitFor(() => t.notifier.sent.some((x) => x.template === 'booking_cancelled_by_clinic'));
      const msg = t.notifier.sent.find((x) => x.template === 'booking_cancelled_by_clinic');
      expect(String(msg?.params.text)).toContain('Doctor emergency');
      await post(`/appointments/${a1}/cancel`).expect(409);
    });

    it('turn reminder follows the live queue: sent once, when the estimated wait drops to the patient\'s chosen lead time', async () => {
      const patients: Awaited<ReturnType<typeof newPatient>>[] = [];
      for (let i = 0; i < 6; i++) patients.push(await newPatient());
      for (let i = 0; i < 5; i++) await book(patients[i], s.schedule.id).expect(201);
      // token 6 asks to be reminded 20 minutes before its turn (10 min per patient => when 2 patients are ahead)
      const mine = await http().post('/bookings').set('Authorization', patients[5].Authorization)
        .send({ scheduleId: s.schedule.id, date: TODAY, patient: { name: 'Late Comer' }, remindBeforeMinutes: 20, consent: true }).expect(201);
      expect(mine.body.remindBeforeMinutes).toBe(20);
      // patients at the front of the queue are (correctly) reminded too; this test is about token 6
      const count = () => t.notifier.sent.filter((x) => x.template === 'turn_near' && x.params.token === 6).length;
      t.notifier.sent = [];
      const queue = t.app.get(QueueService);
      await queue.sendTurnReminders(t.clock.now()); // 5 ahead => ~50 min wait: token 6 must not be told yet
      await new Promise((r) => setTimeout(r, 100));
      expect(count()).toBe(0);
      for (let i = 0; i < 3; i++) await post('/sessions/call-next', { scheduleId: s.schedule.id, date: TODAY }).expect(200);
      // tokens 1-3 are gone, token 4 and 5 still ahead of token 6 => ~20 min => reminder fires automatically
      await waitFor(() => count() === 1);
      const msg = t.notifier.sent.find((x) => x.template === 'turn_near' && x.params.token === 6)!;
      expect(msg.params).toMatchObject({ token: 6, minutes: 20, serving: 3 });
      expect(String(msg.params.text)).toContain('20 मिनट');
      expect(msg.params.serving).toBe(3);
      await post('/sessions/call-next', { scheduleId: s.schedule.id, date: TODAY }).expect(200);
      await queue.sendTurnReminders(t.clock.now());
      await new Promise((r) => setTimeout(r, 100));
      expect(count()).toBe(1); // never twice
    });

    it('reminder lead time is validated; omitted falls back to the platform default; walk-ins are never reminded', async () => {
      const p = await newPatient();
      const base = { scheduleId: s.schedule.id, date: TODAY, patient: { name: 'X Y' }, consent: true };
      await http().post('/bookings').set('Authorization', p.Authorization).send({ ...base, remindBeforeMinutes: 4 }).expect(400);
      await http().post('/bookings').set('Authorization', p.Authorization).send({ ...base, remindBeforeMinutes: 721 }).expect(400);
      await http().post('/bookings').set('Authorization', p.Authorization).send({ ...base, remindBeforeMinutes: 90.5 }).expect(400);
      const ok = await http().post('/bookings').set('Authorization', p.Authorization).send(base).expect(201);
      expect(ok.body.remindBeforeMinutes).toBe(30);
      await http().put('/admin/settings').set({ Cookie: admin.cookies }).send({ default_reminder_minutes: 45 }).expect(200);
      const p2 = await newPatient();
      expect((await http().post('/bookings').set('Authorization', p2.Authorization).send(base).expect(201)).body.remindBeforeMinutes).toBe(45);
      await post('/walkins', { scheduleId: s.schedule.id, name: 'Walk In', mobile: '9876543277' }).expect(201);
      const rows = await t.ds.query(`SELECT source, remind_before_minutes AS r FROM appointments ORDER BY token_no`);
      expect(rows.map((r: { source: string; r: number | null }) => [r.source, r.r])).toEqual([['online', 30], ['online', 45], ['walkin', null]]);
      const av = (await http().get(`/doctors/${s.doctor.slug}/availability`).expect(200)).body;
      expect(av.defaultReminderMinutes).toBe(45);
    });

    it('walk-ins: checked in immediately, optional mobile creates a patient account + SMS, validation', async () => {
      const w = await post('/walkins', { scheduleId: s.schedule.id, name: 'Sita Devi', age: 55, gender: 'F', mobile: '98 76 54 3299' }).expect(201);
      expect(w.body.tokenNo).toBe(1);
      expect((await queue()).appointments[0]).toMatchObject({ status: 'checked_in', source: 'walkin', patientName: 'Sita Devi', patientMobile: '919876543299' });
      expect(t.notifier.sent.some((x) => x.template === 'walkin_token' && x.to === '919876543299')).toBe(true);
      const w2 = await post('/walkins', { scheduleId: s.schedule.id, name: 'No Phone' }).expect(201);
      expect(w2.body.tokenNo).toBe(2);
      await post('/walkins', { scheduleId: s.schedule.id, name: 'Sita Devi', mobile: '9876543299' }).expect(409); // same person, same session
      await post('/walkins', { scheduleId: s.schedule.id, name: 'X', mobile: '123' }).expect(400);
      await post('/walkins', { scheduleId: '999999', name: 'Nobody' }).expect(404);
    });

    it('walk-ins are refused when the clinic subscription has lapsed (402); the queue itself still works', async () => {
      await book(await newPatient(), s.schedule.id).expect(201);
      await t.ds.query(`UPDATE subscriptions SET starts_at = now() - interval '60 days', ends_at = now() - interval '10 days' WHERE clinic_id = $1`, [s.clinic.id]);
      await post('/walkins', { scheduleId: s.schedule.id, name: 'Late Payer' }).expect(402);
      await book(await newPatient(), s.schedule.id).expect(409);
      const [a1] = await ids();
      await post(`/appointments/${a1}/check-in`).expect(200);
    });
  });

  describe('clinic with live queue switched off (fixed approximate time)', () => {
    it('patients see only token + approximate time; queue movement is invisible; reminder uses the fixed time', async () => {
      const s = await seedClinic(t, admin, { name: 'Fixed Time Clinic', doctorName: 'Dr Fixed' });
      await http().patch(`/admin/clinics/${s.clinic.id}`).set({ Cookie: admin.cookies }).send({ liveQueueEnabled: false }).expect(200);
      const staff = await tokenFor(t, UserRole.SUPER_ADMIN, '9000000001');
      const post = (path: string, body: object = {}) => http().post(`/clinic-panel/${s.clinic.id}${path}`).set('Authorization', staff.Authorization).send(body);

      const bookings: { publicId: string; tokenNo: number; estimatedTime: string }[] = [];
      for (let i = 0; i < 4; i++) {
        const p = await newPatient();
        bookings.push((await http().post('/bookings').set('Authorization', p.Authorization)
          .send({ scheduleId: s.schedule.id, date: NEXT_MONDAY, patient: { name: `P${i}` }, remindBeforeMinutes: i === 3 ? 90 : 30, consent: true }).expect(201)).body);
      }
      expect(bookings.map((b) => b.estimatedTime)).toEqual(['09:00', '09:10', '09:20', '09:30']);

      const view = (await http().get(`/queue/${bookings[3].publicId}`).expect(200)).body;
      expect(view).toMatchObject({ liveQueue: false, tokenNo: 4, estimatedTime: '09:30', nowServing: null, patientsAhead: null, etaMinutes: null, yourTurn: false, status: 'booked' });

      // reception works as usual, but the public view must not leak movement
      const rows = await t.ds.query(`SELECT id FROM appointments ORDER BY token_no`);
      await post(`/appointments/${rows[3].id}/check-in`).expect(200);
      await post(`/appointments/${rows[3].id}/call`).expect(200);
      const after = (await http().get(`/queue/${bookings[3].publicId}`).expect(200)).body;
      expect(after).toMatchObject({ status: 'booked', yourTurn: false, nowServing: null });

      // reminder = fixed time minus lead; queue state is irrelevant (token 4 is already "in consultation" above, so use token 1-3 here)
      const queue = t.app.get(QueueService);
      t.notifier.sent = [];
      await t.ds.query(`UPDATE appointments SET status = 'booked', turn_near_sent_at = NULL WHERE token_no = 4`);
      expect(await queue.sendTurnReminders(new Date('2026-10-12T02:29:00Z'))).toBe(0); // 07:59 IST
      expect(await queue.sendTurnReminders(new Date('2026-10-12T02:30:00Z'))).toBe(1); // 08:00 IST: 09:30 - 90 min
      await waitFor(() => t.notifier.sent.some((x) => x.template === 'appointment_reminder'));
      const msg = t.notifier.sent.find((x) => x.template === 'appointment_reminder')!;
      expect(msg.params).toMatchObject({ token: 4, minutes: 90, time: '9:30 AM' });
      expect(t.notifier.sent.some((x) => x.template === 'turn_near')).toBe(false);
      // tokens 1-3 (30 min lead) are due at 08:30 / 08:40 / 08:50 regardless of the queue
      expect(await queue.sendTurnReminders(new Date('2026-10-12T03:00:00Z'))).toBe(1);
      expect(await queue.sendTurnReminders(new Date('2026-10-12T03:30:00Z'))).toBe(2);
    });

    it('a live-queue clinic is unaffected, and the flag can be switched back', async () => {
      const s = await seedClinic(t, admin);
      await http().patch(`/admin/clinics/${s.clinic.id}`).set({ Cookie: admin.cookies }).send({ liveQueueEnabled: false }).expect(200);
      await http().patch(`/admin/clinics/${s.clinic.id}`).set({ Cookie: admin.cookies }).send({ liveQueueEnabled: true }).expect(200);
      const r = (await book(await newPatient(), s.schedule.id, NEXT_MONDAY).expect(201)).body;
      expect((await http().get(`/queue/${r.publicId}`).expect(200)).body).toMatchObject({ liveQueue: true, nowServing: 0, patientsAhead: 0 });
      await http().patch(`/admin/clinics/${s.clinic.id}`).set({ Cookie: admin.cookies }).send({ liveQueueEnabled: 'no' }).expect(400);
    });
  });

  describe('doctor leave', () => {
    it('cancels live bookings, notifies patients, blocks new bookings, shows closed in availability', async () => {
      const s = await seedClinic(t, admin);
      const p1 = await newPatient();
      const p2 = await newPatient();
      await book(p1, s.schedule.id, NEXT_MONDAY).expect(201);
      await book(p2, s.schedule.id, NEXT_MONDAY).expect(201);
      t.notifier.sent = [];
      const res = await http().post(`/clinic-panel/${s.clinic.id}/doctors/${s.doctor.id}/leaves`).set(A()).send({ date: NEXT_MONDAY, reason: 'Conference' }).expect(201);
      expect(res.body.cancelledBookings).toBe(2);
      await waitFor(() => t.notifier.sent.filter((x) => x.template === 'booking_cancelled_by_clinic').length === 2);
      expect(t.notifier.sent.filter((x) => x.template === 'booking_cancelled_by_clinic')).toHaveLength(2);
      const rows = await t.ds.query(`SELECT status FROM appointments`);
      expect(rows.every((r: { status: string }) => r.status === 'cancelled_by_clinic')).toBe(true);

      await book(await newPatient(), s.schedule.id, NEXT_MONDAY).expect(400);
      const av = (await http().get(`/doctors/${s.doctor.slug}/availability`).expect(200)).body;
      expect(av.days.find((d: { date: string }) => d.date === NEXT_MONDAY).sessions[0]).toMatchObject({ state: 'closed', closedReason: 'leave' });
      await http().post(`/clinic-panel/${s.clinic.id}/doctors/${s.doctor.id}/leaves`).set(A()).send({ date: NEXT_MONDAY }).expect(409);
      await http().post(`/clinic-panel/${s.clinic.id}/doctors/${s.doctor.id}/leaves`).set(A()).send({ date: '2026-10-01' }).expect(400);

      const other = await seedClinic(t, admin, { name: 'Other', doctorName: 'Dr Other' });
      await http().post(`/clinic-panel/${s.clinic.id}/doctors/${other.doctor.id}/leaves`).set(A()).send({ date: NEXT_MONDAY }).expect(404);
    });

    it('parallel bookings during a leave creation leave no live booking behind', async () => {
      const s = await seedClinic(t, admin, { maxTokens: 100 });
      const patients = await Promise.all(Array.from({ length: 20 }, () => newPatient()));
      const [leave, ...bookings] = await Promise.all([
        http().post(`/clinic-panel/${s.clinic.id}/doctors/${s.doctor.id}/leaves`).set(A()).send({ date: NEXT_MONDAY }),
        ...patients.map((p) => book(p, s.schedule.id, NEXT_MONDAY)),
      ]);
      expect(leave.status).toBe(201);
      expect(bookings.every((r) => [201, 400].includes(r.status))).toBe(true);
      const live = await t.ds.query(`SELECT COUNT(*)::int AS n FROM appointments WHERE status IN ('booked','checked_in')`);
      expect(live[0].n).toBe(0);
    });
  });

  describe('background jobs', () => {
    it('no-show closer marks leftover booked patients 30 min after the session; reminders send once', async () => {
      const s = await seedClinic(t, admin);
      await book(await newPatient(), s.schedule.id).expect(201);
      await book(await newPatient(), s.schedule.id).expect(201);
      const [first] = await t.ds.query(`SELECT id FROM appointments ORDER BY token_no LIMIT 1`);
      await t.ds.query(`UPDATE appointments SET status = 'completed' WHERE id = $1`, [first.id]);
      const queue = t.app.get(QueueService);

      expect(await queue.closeNoShows(new Date('2026-10-05T07:55:00Z'))).toBe(0); // 13:25 IST, too early
      expect(await queue.closeNoShows(new Date('2026-10-05T08:05:00Z'))).toBe(1); // 13:35 IST
      expect(await queue.closeNoShows(new Date('2026-10-05T08:05:00Z'))).toBe(0);

      // 1h30 before the turn: token 4 (3 ahead, 10 min each, session at 09:00) is due at 09:30 => reminder from 08:00 IST
      const s2 = await seedClinic(t, admin, { name: 'Rem Clinic', doctorName: 'Dr Rem' });
      const late: string[] = [];
      for (let i = 0; i < 4; i++) {
        const p = await newPatient();
        late.push((await http().post('/bookings').set('Authorization', p.Authorization)
          .send({ scheduleId: s2.schedule.id, date: NEXT_MONDAY, patient: { name: `P${i}` }, remindBeforeMinutes: i === 3 ? 90 : 30, consent: true }).expect(201)).body.publicId);
      }
      t.notifier.sent = [];
      const turnNear = () => t.notifier.sent.filter((x) => x.template === 'turn_near');
      expect(await queue.sendTurnReminders(new Date('2026-10-12T02:29:00Z'))).toBe(0); // 07:59 IST
      expect(await queue.sendTurnReminders(new Date('2026-10-12T02:30:00Z'))).toBe(1); // 08:00 IST => token 4 (90 min lead)
      await waitFor(() => turnNear().length === 1);
      expect(turnNear()[0].params).toMatchObject({ token: 4, minutes: 90 });
      expect(await queue.sendTurnReminders(new Date('2026-10-12T02:30:00Z'))).toBe(0);
      expect(await queue.sendTurnReminders(new Date('2026-10-12T03:00:00Z'))).toBe(1); // 08:30 IST => token 1 (30 min lead, due 09:00); tokens 2,3 are due later
      expect(await queue.sendTurnReminders(new Date('2026-10-12T03:10:00Z'))).toBe(1); // 08:40 => token 2 (due 09:10)
      expect(await queue.sendTurnReminders(new Date('2026-10-12T03:20:00Z'))).toBe(1); // 08:50 => token 3 (due 09:20)
      expect(await queue.sendTurnReminders(new Date('2026-10-12T08:00:00Z'))).toBe(0); // 13:30 IST: session over, nothing left to send
    });
  });
});
