import Link from 'next/link';
import { ClinicCard } from './clinic-card';
import { Empty, LinkButton } from '@/components/ui';
import { getT } from '@/i18n/server';
import { serverGet } from '@/lib/api';
import type { ClinicListItem, Paged } from '@/lib/types';

export interface SearchParams {
  q?: string;
  area?: string;
  specialization?: string;
  availableToday?: string;
  page?: string;
}

export function toQuery(p: SearchParams, extra: Partial<SearchParams> = {}): string {
  const merged = { ...p, ...extra };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  return qs.toString();
}

export async function Results({ params, basePath = '/' }: { params: SearchParams; basePath?: string }) {
  const { t } = await getT();
  const qs = toQuery({ ...params, page: params.page ?? '1' }, { page: params.page ?? '1' });
  const data = await serverGet<Paged<ClinicListItem>>(`/clinics?${qs}&limit=12`, 30);
  if (!data || data.items.length === 0) return <Empty>{t('home.noResults')}</Empty>;

  const page = data.page;
  const link = (p: number) => `${basePath}?${toQuery(params, { page: String(p) })}`;
  return (
    <section aria-live="polite" className="space-y-3">
      <p className="text-sm text-muted">{t('home.results', { n: data.total })}</p>
      <ul className="grid gap-3 md:grid-cols-2">
        {data.items.map((c) => (
          <li key={c.id}>
            <ClinicCard clinic={c} doctorsLabel={t('home.doctors', { n: c.doctorCount })} />
          </li>
        ))}
      </ul>
      {data.pages > 1 && (
        <nav className="flex items-center justify-between pt-2" aria-label="Pagination">
          {page > 1 ? <LinkButton href={link(page - 1)} variant="secondary" size="sm">{t('home.previous')}</LinkButton> : <span />}
          <span className="text-sm text-muted">{t('home.page', { p: page, n: data.pages })}</span>
          {page < data.pages ? <LinkButton href={link(page + 1)} variant="secondary" size="sm">{t('home.next')}</LinkButton> : <span />}
        </nav>
      )}
      <Link href="#main" className="sr-only">top</Link>
    </section>
  );
}
