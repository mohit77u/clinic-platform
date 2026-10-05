import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingFlow } from '@/components/public/booking-flow';
import { PageContainer } from '@/components/ui';
import { getT } from '@/i18n/server';
import { serverGet } from '@/lib/api';
import type { DoctorDetail } from '@/lib/types';

export const metadata: Metadata = { robots: { index: false } };

export default async function BookPage({ params }: PageProps<'/book/[slug]'>) {
  const { slug } = await params;
  const d = await serverGet<DoctorDetail>(`/doctors/${encodeURIComponent(slug)}`, 30);
  if (!d) notFound();
  const { t } = await getT();
  return (
    <PageContainer narrow className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('book.title', { doctor: d.name })}</h1>
        <p className="text-muted">
          <Link href={`/clinics/${d.clinic.slug}`} className="underline">{d.clinic.name}</Link> · {d.clinic.area}
        </p>
      </div>
      <BookingFlow doctorSlug={d.slug} doctorName={d.name} />
    </PageContainer>
  );
}
