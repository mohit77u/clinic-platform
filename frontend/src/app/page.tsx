import type { Metadata } from 'next';
import Link from 'next/link';
import { Results, type SearchParams } from '@/components/public/results';
import { SearchForm } from '@/components/public/search-form';
import { PageContainer, Skeleton } from '@/components/ui';
import { getT } from '@/i18n/server';
import { serverGet } from '@/lib/api';
import type { Specialization } from '@/lib/types';
import { Suspense } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t('home.title'), description: t('home.subtitle'), alternates: { canonical: '/' } };
}

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const params: SearchParams = { q: one(sp.q), area: one(sp.area), specialization: one(sp.specialization), availableToday: one(sp.availableToday), page: one(sp.page) };
  const { t, locale } = await getT();
  const [areas, specs] = await Promise.all([serverGet<string[]>('/areas', 300), serverGet<Specialization[]>('/specializations', 300)]);
  const searching = Boolean(params.q || params.area || params.specialization || params.availableToday);

  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-transparent dark:from-brand-900/30">
        <PageContainer className="space-y-5 pb-4 pt-8">
          <div className="space-y-2">
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{t('home.title')}</h1>
            <p className="max-w-2xl text-muted">{t('home.subtitle')}</p>
          </div>
          <SearchForm areas={areas ?? []} specializations={specs ?? []} values={{ q: params.q, area: params.area, specialization: params.specialization, availableToday: params.availableToday === 'true' }} />
        </PageContainer>
      </section>

      <PageContainer className="space-y-8 pt-2">
        <Suspense fallback={<div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}>
          <Results params={params} />
        </Suspense>

        {!searching && (
          <>
            <section aria-labelledby="browse" className="space-y-3">
              <h2 id="browse" className="text-xl font-semibold">{t('home.browseBySpeciality')}</h2>
              <ul className="flex flex-wrap gap-2">
                {(specs ?? []).map((s) => (
                  <li key={s.id}>
                    <Link href={`/rewa/${s.slug}`} className="inline-block rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-brand-50 dark:hover:bg-white/5">
                      {locale === 'hi' && s.nameHi ? s.nameHi : s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="How it works" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="rounded-xl border border-border bg-card p-4">
                  <span className="mb-2 grid size-8 place-items-center rounded-full bg-brand-600 font-semibold text-white">{n}</span>
                  <h3 className="font-semibold">{t(`home.how${n}.title` as 'home.how1.title')}</h3>
                  <p className="text-sm text-muted">{t(`home.how${n}.text` as 'home.how1.text')}</p>
                </div>
              ))}
            </section>
          </>
        )}
      </PageContainer>
    </>
  );
}
