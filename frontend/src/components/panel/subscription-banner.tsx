'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import type { SubscriptionStatus } from '@/lib/types';

export function SubscriptionBanner({ clinicId, canRenew }: { clinicId: string; canRenew: boolean }) {
  const { t } = useT();
  const [s, setS] = useState<SubscriptionStatus | null>(null);

  useEffect(() => {
    api<SubscriptionStatus>(`/clinic-panel/${clinicId}/subscription-status`).then(setS).catch(() => undefined);
  }, [clinicId]);

  if (!s || s.state === 'active') return null;
  const n = s.daysLeft ?? 0;
  const text =
    s.state === 'trial' ? t('panel.sub.trial', { n }) : s.state === 'expiring' ? t('panel.sub.expiring', { n }) : s.state === 'grace' ? t('panel.sub.grace') : s.state === 'expired' ? t('panel.sub.expired') : t('panel.sub.none');
  const tone = s.state === 'trial' ? 'info' : s.state === 'expiring' ? 'warning' : 'error';
  return (
    <Alert tone={tone}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{text}</span>
        {canRenew && s.state !== 'trial' && <Link href={`/panel/${clinicId}/billing`} className="font-semibold underline">{t('panel.sub.renew')}</Link>}
      </div>
    </Alert>
  );
}
