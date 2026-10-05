'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, LinkButton, PageContainer, Skeleton, cx } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/clinics', label: 'Clinics' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/areas', label: 'Areas' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/audit', label: 'Audit log' },
  { href: '/admin/privacy', label: 'Privacy requests' },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV.map((n) => {
        const active = n.href === '/admin' ? pathname === '/admin' : pathname === n.href || pathname.startsWith(n.href + '/');
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors',
                active ? 'bg-brand-600 text-white' : 'hover:bg-brand-50 dark:hover:bg-white/5',
              )}
            >
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login?next=' + encodeURIComponent(pathname + window.location.search));
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <PageContainer>
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (user.role !== 'super_admin') {
    return (
      <PageContainer narrow>
        <Alert tone="warning" className="space-y-3">
          <p className="font-semibold">Admin access only</p>
          <p>Your account ({user.role.replace('_', ' ')}) is not allowed to open the admin panel. Sign in with a super-admin account to continue.</p>
          <LinkButton href="/" variant="secondary" size="sm">
            Back to home
          </LinkButton>
        </Alert>
      </PageContainer>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:gap-6 md:px-6">
      <aside className="md:py-6">
        {/* phones: collapsible menu */}
        <div className="border-b border-border bg-card px-4 py-2 md:hidden">
          <Button variant="secondary" size="sm" className="w-full justify-between" aria-expanded={open} aria-controls="admin-nav" onClick={() => setOpen((o) => !o)}>
            <span>Admin menu</span>
            <span aria-hidden>{open ? '▲' : '▼'}</span>
          </Button>
          {open && (
            <nav id="admin-nav" aria-label="Admin" className="mt-2 pb-2">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
          )}
        </div>
        <nav aria-label="Admin" className="sticky top-20 hidden md:block">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted">Super admin</p>
          <NavLinks pathname={pathname} />
        </nav>
      </aside>
      <div className="min-w-0 px-4 py-6 md:px-0">{children}</div>
    </div>
  );
}
