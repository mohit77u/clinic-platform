import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar, Timings } from '@/components/public/doctor-card';
import { JsonLd } from '@/components/public/json-ld';
import { Badge, Card, LinkButton, PageContainer } from '@/components/ui';
import { getT } from '@/i18n/server';
import { serverGet } from '@/lib/api';
import { SITE_URL } from '@/lib/config';
import { rupees } from '@/lib/format';
import type { DoctorDetail } from '@/lib/types';

const load = (slug: string) => serverGet<DoctorDetail>(`/doctors/${encodeURIComponent(slug)}`, 30);

export async function generateMetadata({ params }: PageProps<'/doctors/[slug]'>): Promise<Metadata> {
  const d = await load((await params).slug);
  if (!d) return { title: 'Doctor not available', robots: { index: false } };
  const spec = d.specialization?.name ?? 'Doctor';
  return {
    title: `${d.name} — ${spec} in ${d.clinic.area}, Rewa`,
    description: `Book a token with ${d.name} (${d.qualification ?? spec}) at ${d.clinic.name}, ${d.clinic.area}, Rewa. See timings and consultation fee.`,
    alternates: { canonical: `/doctors/${d.slug}` },
  };
}

export default async function DoctorPage({ params }: PageProps<'/doctors/[slug]'>) {
  const d = await load((await params).slug);
  const { t, locale } = await getT();
  if (!d) notFound();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Physician',
    name: d.name,
    url: `${SITE_URL}/doctors/${d.slug}`,
    medicalSpecialty: d.specialization?.name,
    image: d.photoUrl ?? undefined,
    description: d.bio ?? d.qualification ?? undefined,
    worksFor: { '@type': 'MedicalClinic', name: d.clinic.name, url: `${SITE_URL}/clinics/${d.clinic.slug}`, telephone: d.clinic.phone },
  };
  return (
    <PageContainer narrow className="space-y-5">
      <JsonLd data={jsonLd} />
      <Card className="space-y-4">
        <div className="flex gap-4">
          <Avatar name={d.name} src={d.photoUrl} size="size-20" />
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{d.name}</h1>
            <div className="flex flex-wrap gap-1.5">
              {d.specialization && <Badge tone="brand">{locale === 'hi' && d.specialization.nameHi ? d.specialization.nameHi : d.specialization.name}</Badge>}
              {d.experienceYears != null && <Badge>{t('common.years', { n: d.experienceYears })}</Badge>}
            </div>
            {d.qualification && <p className="text-muted">{d.qualification}</p>}
          </div>
        </div>
        <p>
          <Link href={`/clinics/${d.clinic.slug}`} className="font-medium text-brand-700 underline dark:text-brand-100">{d.clinic.name}</Link>
          <span className="text-muted"> · {d.clinic.area}, {d.clinic.city}</span>
        </p>
        <section aria-labelledby="timings" className="space-y-1">
          <h2 id="timings" className="font-semibold">{t('clinic.timings')}</h2>
          <Timings schedules={d.schedules} />
        </section>
        {d.consultationFee != null && <p><span className="text-muted">{t('common.fee')}: </span><strong>{rupees(d.consultationFee)}</strong></p>}
        {d.languages.length > 0 && <p><span className="text-muted">{t('doctor.languages')}: </span>{d.languages.join(', ')}</p>}
        <LinkButton href={`/book/${d.slug}`} size="lg" className="w-full">{t('clinic.bookToken')}</LinkButton>
      </Card>
      {d.bio && (
        <section aria-labelledby="bio" className="space-y-1">
          <h2 id="bio" className="text-xl font-semibold">{t('doctor.about')}</h2>
          <p className="whitespace-pre-line text-muted">{d.bio}</p>
        </section>
      )}
    </PageContainer>
  );
}
