import dataSource from './data-source.js';
import { AppSetting, Area, Plan, Specialization, User } from './entities/index.js';
import { UserRole } from '../common/enums.js';

const SETTINGS: Record<string, string> = {
  default_trial_days: '30',
  grace_days: '3',
  advance_booking_days: '7',
  cancel_cutoff_minutes: '60',
  default_reminder_minutes: '30',
};

// price = base price excl. GST; GST 18% is added at checkout
const PLANS = [
  { name: 'Monthly', durationMonths: 1, price: '1199', sortOrder: 1 },
  { name: 'Quarterly', durationMonths: 3, price: '2999', sortOrder: 2 },
  { name: 'Half-Yearly', durationMonths: 6, price: '5499', sortOrder: 3 },
  { name: 'Annual', durationMonths: 12, price: '9999', sortOrder: 4 },
];

const SPECIALIZATIONS = [
  ['Physician', 'फिजिशियन'],
  ['Pediatrician', 'बाल रोग विशेषज्ञ'],
  ['Gynecologist', 'स्त्री रोग विशेषज्ञ'],
  ['Orthopedic', 'हड्डी रोग विशेषज्ञ'],
  ['Dermatologist', 'त्वचा रोग विशेषज्ञ'],
  ['ENT', 'कान नाक गला विशेषज्ञ'],
  ['Dentist', 'दंत चिकित्सक'],
  ['Eye Specialist', 'नेत्र रोग विशेषज्ञ'],
  ['Cardiologist', 'हृदय रोग विशेषज्ञ'],
  ['General Surgeon', 'सर्जन'],
  ['Neurologist', 'न्यूरोलॉजिस्ट'],
  ['Psychiatrist', 'मनोचिकित्सक'],
] as const;

// Starter list only: admin edits this from the panel.
const AREAS = ['Civil Lines', 'Rajendra Nagar', 'Shiv Nagar', 'Ring Road', 'Padra', 'Gurh', 'Dhekha'];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

await dataSource.initialize();
try {
  await dataSource.transaction(async (m) => {
    await m.upsert(
      AppSetting,
      Object.entries(SETTINGS).map(([key, value]) => ({ key, value })),
      ['key'],
    );

    // Plans have no natural unique key: only seed into an empty table so admin edits are never overwritten.
    if ((await m.count(Plan)) === 0) await m.insert(Plan, PLANS);

    await m.upsert(
      Specialization,
      SPECIALIZATIONS.map(([name, nameHi]) => ({ name, nameHi, slug: slugify(name) })),
      ['slug'],
    );

    await m.upsert(
      Area,
      AREAS.map((name, i) => ({ name, sortOrder: i })),
      ['name'],
    );

    const adminMobile = process.env.SEED_ADMIN_MOBILE;
    if (adminMobile) {
      await m.upsert(User, { role: UserRole.SUPER_ADMIN, name: 'Super Admin', mobile: adminMobile }, ['mobile']);
    }
  });
  console.log('Seed complete');
} finally {
  await dataSource.destroy();
}
