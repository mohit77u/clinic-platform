'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SubscriptionBanner } from '@/components/panel/subscription-banner';
import { Alert, cx, PageContainer, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';

export default function PanelLayout({ children }: LayoutProps<'/panel/[clinicId]'>) {
  const { t } = useT();
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { clinicId } = useParams<{ clinicId: string }>();
  const allowed = user && ['clinic_owner', 'clinic_staff', 'super_admin'].includes(user.role);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <PageContainer><Skeleton className="h-40" /></PageContainer>;
  if (!allowed) return <PageContainer narrow><Alert tone="error">{t('panel.noClinic')}</Alert></PageContainer>;

  const base = `/panel/${clinicId}`;
  const tabs = [
    { href: base, label: t('panel.tab.queue'), show: true },
    { href: `${base}/doctors`, label: t('panel.tab.doctors'), show: true },
    { href: `${base}/billing`, label: t('panel.tab.billing'), show: user.role !== 'clinic_staff' },
  ].filter((x) => x.show);

  return (
    <PageContainer className="space-y-4">
      <SubscriptionBanner clinicId={clinicId} canRenew={user.role !== 'clinic_staff'} />
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0" aria-label="Clinic panel">
        {tabs.map((tab) => {
          const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined} className={cx('whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium', active ? 'border-brand-600 text-brand-700 dark:text-brand-100' : 'border-transparent text-muted hover:text-foreground')}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </PageContainer>
  );
}
