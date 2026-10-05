import request from 'supertest';
import { TestApp } from './app.js';
import type { Session } from './auth.js';

export interface SeededClinic {
  clinic: { id: string; slug: string };
  doctor: { id: string; slug: string };
  schedule: { id: string };
}

/** Creates (via the admin API) a clinic with one doctor and one Monday-morning session, optionally published. */
export async function seedClinic(
  t: TestApp,
  admin: Session,
  o: { name?: string; area?: string; specializationId?: number; publish?: boolean; weekday?: number; maxTokens?: number; walkinReserved?: number; mode?: 'token' | 'slot'; slotMinutes?: number; fee?: string; doctorName?: string; start?: string; end?: string } = {},
): Promise<SeededClinic> {
  const http = request(t.app.getHttpServer());
  const C = { Cookie: admin.cookies };
  const clinic = (
    await http.post('/admin/clinics').set(C).send({
      name: o.name ?? 'Sharma Clinic',
      phone: '9876500000',
      addressLine: '12 Main Road',
      area: o.area ?? 'Civil Lines',
      mapUrl: 'https://maps.app.goo.gl/abc',
    }).expect(201)
  ).body;
  const doctor = (
    await http.post(`/admin/clinics/${clinic.id}/doctors`).set(C).send({
      specializationId: o.specializationId ?? 1,
      name: o.doctorName ?? 'Dr Anil Sharma',
      consultationFee: o.fee ?? '400',
    }).expect(201)
  ).body;
  const schedule = (
    await http.post(`/admin/doctors/${doctor.id}/schedules`).set(C).send({
      weekday: o.weekday ?? 1,
      startTime: o.start ?? '09:00',
      endTime: o.end ?? '13:00',
      maxTokens: o.maxTokens ?? 30,
      walkinReserved: o.walkinReserved ?? 0,
      mode: o.mode ?? 'token',
      slotMinutes: o.slotMinutes ?? 10,
    }).expect(201)
  ).body;
  if (o.publish !== false) await http.post(`/admin/clinics/${clinic.id}/publish`).set(C).send({}).expect(201);
  return { clinic, doctor, schedule };
}
