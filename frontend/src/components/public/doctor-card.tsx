/* eslint-disable @next/next/no-img-element -- images are already resized WebP served by our API */
import Link from 'next/link';
import { Badge, Card, LinkButton } from '@/components/ui';
import { fmt12, formatDays, groupTimings, rupees } from '@/lib/format';
import type { PublicDoctor } from '@/lib/types';
import { getT } from '@/i18n/server';

export function Avatar({ name, src, size = 'size-16' }: { name: string; src: string | null; size?: string }) {
  if (src) return <img src={src.replace(/\.webp$/, '-thumb.webp')} alt="" loading="lazy" className={`${size} shrink-0 rounded-full object-cover`} />;
  return (
    <div aria-hidden className={`${size} grid shrink-0 place-items-center rounded-full bg-brand-100 text-xl font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-100`}>
      {name.replace(/^Dr\.?\s*/i, '').charAt(0).toUpperCase()}
    </div>
  );
}

export async function Timings({ schedules }: { schedules: PublicDoctor['schedules'] }) {
  const { t } = await getT();
  const rows = groupTimings(schedules);
  if (!rows.length) return null;
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((r) => (
        <li key={`${r.start}-${r.end}-${r.name}-${r.days.join()}`} className="flex flex-wrap gap-x-2">
          <span className="font-medium">{formatDays(r.days, t)}</span>
          <span className="text-muted">{fmt12(r.start)} – {fmt12(r.end)}</span>
        </li>
      ))}
    </ul>
  );
}

export async function DoctorCard({ doctor, clinicName, compact }: { doctor: PublicDoctor; clinicName?: string; compact?: boolean }) {
  const { t, locale } = await getT();
  return (
    <Card className="space-y-3">
      <div className="flex gap-3">
        <Avatar name={doctor.name} src={doctor.photoUrl} />
        <div className="min-w-0 space-y-1">
          <h3 className="text-lg font-semibold leading-tight">
            <Link href={`/doctors/${doctor.slug}`} className="hover:underline">{doctor.name}</Link>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {doctor.specialization && <Badge tone="brand">{locale === 'hi' && doctor.specialization.nameHi ? doctor.specialization.nameHi : doctor.specialization.name}</Badge>}
            {doctor.experienceYears != null && <Badge>{t('common.years', { n: doctor.experienceYears })}</Badge>}
          </div>
          {doctor.qualification && <p className="text-sm text-muted">{doctor.qualification}</p>}
          {clinicName && <p className="text-sm text-muted">{clinicName}</p>}
        </div>
      </div>
      {!compact && <Timings schedules={doctor.schedules} />}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">
          {doctor.consultationFee != null && (
            <>
              <span className="text-muted">{t('common.fee')}: </span>
              <strong>{rupees(doctor.consultationFee)}</strong>
            </>
          )}
        </span>
        <LinkButton href={`/book/${doctor.slug}`}>{t('clinic.bookToken')}</LinkButton>
      </div>
    </Card>
  );
}
