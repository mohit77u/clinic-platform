'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Card, PageContainer, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { PanelClinic } from '@/lib/types';

export default function PanelHome() {
  const { t } = useT();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [clinics, setClinics] = useState<PanelClinic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return router.replace('/login?next=/panel');
    if (user.role === 'super_admin') return router.replace('/admin');
    api<PanelClinic[]>('/clinic-panel/mine')
      .then((c) => (c.length === 1 ? router.replace(`/panel/${c[0].id}`) : setClinics(c)))
      .catch((e) => setError(errorMessage(e)));
  }, [loading, user, router]);

  return (
    <PageContainer narrow className="space-y-4">
      <h1 className="text-2xl font-bold">{t('panel.pickClinic')}</h1>
      {error && <Alert tone="error">{error}</Alert>}
      {!clinics && !error && <Skeleton className="h-24" />}
      {clinics?.length === 0 && <Alert tone="warning">{t('panel.noClinic')}</Alert>}
      {clinics?.map((c) => (
        <Link key={c.id} href={`/panel/${c.id}`}>
          <Card className="mb-3 hover:shadow-md"><p className="font-semibold">{c.name}</p></Card>
        </Link>
      ))}
    </PageContainer>
  );
}
