/**
 * Dev-only demo data so the UI has something to show: 3 published clinics with doctors and sessions,
 * plus logins (OTP is printed in the API terminal):
 *   admin  9000000001   owner  9000000002   receptionist  9000000003
 * Safe to re-run (skips clinics that already exist).
 */
import dataSource from './data-source.js';
import { ClinicStatus, SubscriptionKind, SubscriptionStatus, UserRole } from '../common/enums.js';
import { Area, Clinic, ClinicMember, Doctor, DoctorSchedule, Specialization, Subscription, User } from './entities/index.js';

if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production');

const DEMO = [
  { name: 'Shree Sai Clinic', slug: 'shree-sai-clinic', area: 'Civil Lines', phone: '9876500001', doctors: [
    { name: 'Dr. Anil Sharma', slug: 'dr-anil-sharma', spec: 'physician', qual: 'MBBS, MD (Medicine)', exp: 14, fee: '400' },
  ] },
  { name: 'Kids Care Child Clinic', slug: 'kids-care-child-clinic', area: 'Rajendra Nagar', phone: '9876500002', doctors: [
    { name: 'Dr. Meena Gupta', slug: 'dr-meena-gupta', spec: 'pediatrician', qual: 'MBBS, DCH', exp: 9, fee: '300' },
    { name: 'Dr. Rakesh Tiwari', slug: 'dr-rakesh-tiwari', spec: 'pediatrician', qual: 'MBBS, MD (Paediatrics)', exp: 20, fee: '500' },
  ] },
  { name: 'Smile Dental Care', slug: 'smile-dental-care', area: 'Ring Road', phone: '9876500003', doctors: [
    { name: 'Dr. Pooja Singh', slug: 'dr-pooja-singh', spec: 'dentist', qual: 'BDS, MDS', exp: 7, fee: '250' },
  ] },
];

await dataSource.initialize();
try {
  await dataSource.transaction(async (m) => {
    const users = m.getRepository(User);
    const ensureUser = async (mobile: string, role: UserRole, name: string) => {
      await users.upsert({ mobile, role, name }, ['mobile']);
      return users.findOneByOrFail({ mobile });
    };
    const admin = await ensureUser('919000000001', UserRole.SUPER_ADMIN, 'Demo Admin');
    const owner = await ensureUser('919000000002', UserRole.CLINIC_OWNER, 'Demo Owner');
    const staff = await ensureUser('919000000003', UserRole.CLINIC_STAFF, 'Demo Receptionist');

    for (const [i, c] of DEMO.entries()) {
      if (await m.getRepository(Clinic).exists({ where: { slug: c.slug } })) continue;
      if (!(await m.getRepository(Area).exists({ where: { name: c.area } }))) await m.getRepository(Area).insert({ name: c.area });
      const clinic = await m.getRepository(Clinic).save({
        name: c.name, slug: c.slug, phone: c.phone, whatsapp: c.phone, addressLine: `${10 + i}, Main Road`, area: c.area,
        description: `${c.name} offers friendly, affordable care for the whole family.`,
        mapUrl: 'https://maps.app.goo.gl/demo', status: ClinicStatus.APPROVED, approvedAt: new Date(), approvedById: admin.id, createdById: admin.id,
      });
      const now = new Date();
      await m.getRepository(Subscription).insert({ clinicId: clinic.id, kind: SubscriptionKind.TRIAL, startsAt: now, endsAt: new Date(now.getTime() + 30 * 86_400_000), status: SubscriptionStatus.ACTIVE, createdById: admin.id });
      if (i === 0) {
        await m.getRepository(ClinicMember).insert([
          { clinicId: clinic.id, userId: owner.id, role: UserRole.CLINIC_OWNER },
          { clinicId: clinic.id, userId: staff.id, role: UserRole.CLINIC_STAFF },
        ]);
      }
      for (const d of c.doctors) {
        const spec = await m.getRepository(Specialization).findOneByOrFail({ slug: d.spec });
        const doctor = await m.getRepository(Doctor).save({
          clinicId: clinic.id, specializationId: spec.id, name: d.name, slug: d.slug, qualification: d.qual,
          experienceYears: d.exp, consultationFee: d.fee, languages: ['Hindi', 'English'], bio: `${d.name} has ${d.exp} years of experience.`,
        });
        // Mon-Sat: morning token session, Mon/Wed/Fri evening session
        for (const weekday of [1, 2, 3, 4, 5, 6]) {
          await m.getRepository(DoctorSchedule).save({ doctorId: doctor.id, weekday, sessionName: 'Morning', startTime: '09:00', endTime: '13:00', maxTokens: 30, walkinReserved: 5, slotMinutes: 8 });
          if ([1, 3, 5].includes(weekday)) {
            await m.getRepository(DoctorSchedule).save({ doctorId: doctor.id, weekday, sessionName: 'Evening', startTime: '17:00', endTime: '20:00', maxTokens: 20, walkinReserved: 4, slotMinutes: 8 });
          }
        }
      }
    }
  });
  console.log('Demo data ready. Logins: admin 9000000001, owner 9000000002, receptionist 9000000003 (OTP prints in the API terminal)');
} finally {
  await dataSource.destroy();
}
