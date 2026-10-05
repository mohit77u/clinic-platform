'use client';

import { Button, PageContainer } from '@/components/ui';
import { useT } from '@/i18n';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const { t } = useT();
  return (
    <PageContainer narrow className="space-y-4 py-16 text-center">
      <p className="text-muted">{t('common.error')}</p>
      <Button onClick={reset}>{t('common.retry')}</Button>
    </PageContainer>
  );
}
