'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { OtpLogin } from '@/components/otp-login';
import { Card, PageContainer } from '@/components/ui';
import { useT } from '@/i18n';
import { homeFor, useAuth } from '@/lib/auth';

/** Only same-site relative paths are allowed as a post-login target (no open redirects). */
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : null);

function LoginInner() {
  const { t } = useT();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace(next ?? homeFor(user.role));
  }, [loading, user, next, router]);

  return (
    <PageContainer narrow className="py-10">
      <Card className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{t('login.title')}</h1>
          <p className="text-muted">{t('login.subtitle')}</p>
        </div>
        <OtpLogin onDone={(u) => router.replace(next ?? homeFor(u.role))} />
      </Card>
    </PageContainer>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
