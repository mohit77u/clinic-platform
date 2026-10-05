import Link from 'next/link';
import { getT } from '@/i18n/server';

export async function Footer() {
  const { t } = await getT();
  return (
    <footer className="mt-12 border-t border-border bg-card">
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-6 text-sm text-muted sm:px-6">
        <p>{t('footer.note')}</p>
        <p className="flex gap-4">
          <Link className="underline" href="/privacy">{t('nav.privacy')}</Link>
          <Link className="underline" href="/terms">{t('nav.terms')}</Link>
        </p>
      </div>
    </footer>
  );
}
