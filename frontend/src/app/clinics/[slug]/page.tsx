/* eslint-disable @next/next/no-img-element -- images are already resized WebP served by our API */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DoctorCard } from '@/components/public/doctor-card';
import { JsonLd } from '@/components/public/json-ld';
import { LinkButton, PageContainer } from '@/components/ui';
import { getT } from '@/i18n/server';
import { serverGet } from '@/lib/api';
import { SITE_URL } from '@/lib/config';
import { telHref, waHref } from '@/lib/format';
import type { ClinicDetail } from '@/lib/types';

const load = (slug: string) => serverGet<ClinicDetail>(`/clinics/${encodeURIComponent(slug)}`, 30);

export async function generateMetadata({ params }: PageProps<'/clinics/[slug]'>): Promise<Metadata> {
  const c = await load((await params).slug);
  if (!c) return { title: 'Clinic not available', robots: { index: false } };
  const specs = [...new Set(c.doctors.map((d) => d.specialization?.name).filter(Boolean))].join(', ');
  return {
    title: `${c.name}, ${c.area} — ${specs || 'Clinic'} in Rewa`,
    description: c.description ?? `Book a token at ${c.name}, ${c.area}, Rewa. See doctors, timings and fees.`,
    alternates: { canonical: `/clinics/${c.slug}` },
    openGraph: { title: c.name, description: c.description ?? undefined, images: c.coverUrl ? [c.coverUrl] : undefined },
  };
}

const SCHEMA_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function ClinicPage({ params }: PageProps<'/clinics/[slug]'>) {
  const c = await load((await params).slug);
  const { t } = await getT();
  if (!c) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalClinic',
    name: c.name,
    url: `${SITE_URL}/clinics/${c.slug}`,
    telephone: c.phone,
    image: c.images.map((i) => i.url),
    description: c.description ?? undefined,
    address: { '@type': 'PostalAddress', streetAddress: c.addressLine, addressLocality: c.area, addressRegion: c.state, postalCode: c.pincode ?? undefined, addressCountry: 'IN' },
    geo: c.latitude && c.longitude ? { '@type': 'GeoCoordinates', latitude: c.latitude, longitude: c.longitude } : undefined,
    openingHoursSpecification: c.doctors.flatMap((d) =>
      d.schedules.map((s) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: SCHEMA_DAYS[s.weekday], opens: s.startTime, closes: s.endTime })),
    ),
    medicalSpecialty: [...new Set(c.doctors.map((d) => d.specialization?.name).filter(Boolean))],
    physician: c.doctors.map((d) => ({ '@type': 'Physician', name: d.name, url: `${SITE_URL}/doctors/${d.slug}` })),
  };

  return (
    <PageContainer className="space-y-6">
      <JsonLd data={jsonLd} />
      {c.coverUrl && <img src={c.coverUrl} alt={c.name} width={1200} height={500} fetchPriority="high" className="aspect-[12/5] w-full rounded-2xl object-cover" />}
      <header className="space-y-3">
        <h1 className="text-2xl font-bold sm:text-3xl">{c.name}</h1>
        <p className="text-muted">{c.addressLine}, {c.area}, {c.city}{c.pincode ? ` – ${c.pincode}` : ''}</p>
        <div className="flex flex-wrap gap-2">
          {c.mapUrl && <LinkButton href={c.mapUrl} target="_blank" rel="noopener noreferrer" variant="secondary">📍 {t('common.directions')}</LinkButton>}
          <LinkButton href={telHref(c.phone)} variant="secondary">📞 {t('common.call')}</LinkButton>
          {c.whatsapp && <LinkButton href={waHref(c.whatsapp, `Hi, ${c.name}`)} target="_blank" rel="noopener noreferrer" variant="secondary">💬 {t('common.whatsapp')}</LinkButton>}
        </div>
      </header>

      {c.description && (
        <section aria-labelledby="about" className="space-y-1">
          <h2 id="about" className="text-xl font-semibold">{t('clinic.about')}</h2>
          <p className="whitespace-pre-line text-muted">{c.description}</p>
        </section>
      )}

      <section aria-labelledby="doctors" className="space-y-3">
        <h2 id="doctors" className="text-xl font-semibold">{t('clinic.doctors')}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {c.doctors.map((d) => (
            <DoctorCard key={d.id} doctor={d} />
          ))}
        </div>
      </section>

      {c.images.length > 0 && (
        <section aria-labelledby="gallery" className="space-y-3">
          <h2 id="gallery" className="text-xl font-semibold">{t('clinic.gallery')}</h2>
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {c.images.map((i) => (
              <li key={i.id} className="snap-start">
                <img src={i.thumbUrl} srcSet={`${i.thumbUrl} 400w, ${i.url} 1600w`} sizes="(min-width: 640px) 320px, 75vw" alt={i.caption ?? c.name} loading="lazy" width={320} height={240} className="h-48 w-64 rounded-xl object-cover sm:h-56 sm:w-80" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}
