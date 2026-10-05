import { Button, Input, Select } from '@/components/ui';
import type { Specialization } from '@/lib/types';
import { getT } from '@/i18n/server';

/** Plain GET form: works without JavaScript and keeps every search shareable as a URL. */
export async function SearchForm({ areas, specializations, values }: { areas: string[]; specializations: Specialization[]; values: { q?: string; area?: string; specialization?: string; availableToday?: boolean } }) {
  const { t, locale } = await getT();
  return (
    <form action="/" method="get" className="space-y-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4" role="search">
      <Input name="q" type="search" defaultValue={values.q} placeholder={t('home.searchPlaceholder')} aria-label={t('home.searchPlaceholder')} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select name="area" defaultValue={values.area ?? ''} aria-label={t('home.allAreas')}>
          <option value="">{t('home.allAreas')}</option>
          {areas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>
        <Select name="specialization" defaultValue={values.specialization ?? ''} aria-label={t('home.allSpecialities')}>
          <option value="">{t('home.allSpecialities')}</option>
          {specializations.map((s) => (
            <option key={s.id} value={s.slug}>{locale === 'hi' && s.nameHi ? s.nameHi : s.name}</option>
          ))}
        </Select>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="availableToday" value="true" defaultChecked={values.availableToday} className="size-5 accent-brand-600" />
          {t('home.availableToday')}
        </label>
        <Button type="submit">{t('common.search')}</Button>
      </div>
    </form>
  );
}
