'use client';

import { useRouter } from 'next/navigation';
import { Button } from './ui';
import { setLocaleCookie, useT } from '@/i18n';

export function LanguageToggle() {
  const { t, locale } = useT();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      lang={locale === 'hi' ? 'en' : 'hi'}
      onClick={() => {
        setLocaleCookie(locale === 'hi' ? 'en' : 'hi');
        router.refresh();
      }}
    >
      {t('nav.language')}
    </Button>
  );
}
