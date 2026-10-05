import type { Metadata } from 'next';
import { PageContainer } from '@/components/ui';
import { getT } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t('privacy.title') };
}

export default async function Page() {
  const { t } = await getT();
  return (
    <PageContainer narrow className="space-y-4">
      <h1 className="text-2xl font-bold">{t('privacy.title')}</h1>
      {(['p1', 'p2', 'p3', 'p4'] as const).map((k) => (
        <p key={k} className="text-muted">{t(`privacy.${k}` as 'privacy.p1')}</p>
      ))}
    </PageContainer>
  );
}
