import type { Metadata } from 'next';
import { QueueLive } from '@/components/public/queue-live';
import { PageContainer } from '@/components/ui';
import { getT } from '@/i18n/server';

export const metadata: Metadata = { title: 'Live queue', robots: { index: false, follow: false } };

export default async function QueuePage({ params }: PageProps<'/q/[publicId]'>) {
  const { publicId } = await params;
  const { t } = await getT();
  return (
    <PageContainer narrow className="space-y-4">
      <h1 className="text-xl font-bold">{t('queue.title')}</h1>
      <QueueLive publicId={publicId} />
    </PageContainer>
  );
}
