import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Results } from '@/components/public/results';
import { LinkButton, PageContainer } from '@/components/ui';
import { getT } from '@/i18n/server';
import { serverGet } from '@/lib/api';
import type { Specialization } from '@/lib/types';

async function find(slug: string) {
  const specs = await serverGet<Specialization[]>('/specializations', 300);
  return specs?.find((s) => s.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<'/rewa/[specialization]'>): Promise<Metadata> {
  const spec = await find((await params).specialization);
  if (!spec) return {};
  return {
    title: `${spec.name} doctors in Rewa — book a token online`,
    description: `Find the best ${spec.name.toLowerCase()} doctors and clinics in Rewa, see timings and fees, and book your token online.`,
    alternates: { canonical: `/rewa/${spec.slug}` },
  };
}

export default async function SpecializationPage({ params, searchParams }: PageProps<'/rewa/[specialization]'>) {
  const { specialization } = await params;
  const sp = await searchParams;
  const spec = await find(specialization);
  if (!spec) notFound();
  const { t, locale } = await getT();
  const page = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const name = locale === 'hi' && spec.nameHi ? spec.nameHi : spec.name;
  return (
    <PageContainer className="space-y-4">
      <LinkButton href="/" variant="ghost" size="sm">← {t('clinic.backToSearch')}</LinkButton>
      <h1 className="text-2xl font-bold sm:text-3xl">{name} — Rewa</h1>
      <Results params={{ specialization: spec.slug, page }} basePath={`/rewa/${spec.slug}`} />
    </PageContainer>
  );
}
