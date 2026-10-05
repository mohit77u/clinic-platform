'use client';

import Link from 'next/link';
import { LanguageToggle } from './language-toggle';
import { Button, LinkButton } from './ui';
import { useT } from '@/i18n';
import { homeFor, useAuth } from '@/lib/auth';

export function Header() {
  const { t } = useT();
  const { user, loading, logout } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-brand-700 dark:text-brand-100">
          <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white">+</span>
          <span className="hidden sm:inline">{t('app.name')}</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          {user?.role === 'patient' && (
            <LinkButton href="/my-bookings" variant="ghost" size="sm">
              {t('nav.myBookings')}
            </LinkButton>
          )}
          {user && user.role !== 'patient' && (
            <LinkButton href={homeFor(user.role)} variant="ghost" size="sm">
              {user.role === 'super_admin' ? t('nav.admin') : t('nav.panel')}
            </LinkButton>
          )}
          <LanguageToggle />
          {!loading &&
            (user ? (
              <Button variant="secondary" size="sm" onClick={logout}>
                {t('nav.logout')}
              </Button>
            ) : (
              <LinkButton href="/login" variant="secondary" size="sm">
                {t('nav.login')}
              </LinkButton>
            ))}
        </nav>
      </div>
    </header>
  );
}
