import { LinkButton, PageContainer } from '@/components/ui';
import { getT } from '@/i18n/server';

export default async function NotFound() {
  const { t } = await getT();
  return (
    <PageContainer narrow className="space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="text-muted">{t('clinic.notAvailable')}</p>
      <LinkButton href="/">{t('clinic.backToSearch')}</LinkButton>
    </PageContainer>
  );
}
