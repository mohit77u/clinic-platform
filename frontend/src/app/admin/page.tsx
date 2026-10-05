'use client';

import Link from 'next/link';
import { ErrorState, PageHeader, Stat } from '@/components/admin/common';
import { inr } from '@/components/admin/format';
import { useFetch } from '@/components/admin/hooks';
import type { AdminStats } from '@/components/admin/types';
import { Skeleton } from '@/components/ui';

function LinkStat({ href, ...p }: { href: string; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Link href={href} className="block rounded-xl transition-shadow hover:shadow-md focus-visible:shadow-md">
      <Stat {...p} />
    </Link>
  );
}

export default function AdminDashboard() {
  const { data, error, loading, reload } = useFetch<AdminStats>('/admin/stats');

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Platform overview" />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="h-clinics">
            <h2 id="h-clinics" className="mb-2 font-semibold">Clinics</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <LinkStat href="/admin/clinics?status=pending" label="Pending approval" value={data.clinics.pending} />
              <LinkStat href="/admin/clinics?status=approved" label="Published" value={data.clinics.approved} />
              <LinkStat href="/admin/clinics?status=suspended" label="Suspended" value={data.clinics.suspended} />
              <LinkStat href="/admin/clinics?status=rejected" label="Rejected" value={data.clinics.rejected} />
            </div>
          </section>
          <section aria-labelledby="h-subs">
            <h2 id="h-subs" className="mb-2 font-semibold">Subscriptions</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <LinkStat href="/admin/clinics?status=approved" label="On trial" value={data.subscriptions.on_trial} />
              <LinkStat href="/admin/payments" label="Paying" value={data.subscriptions.paying} />
              <LinkStat href="/admin/clinics?status=approved" label="Expiring in 7 days" value={data.subscriptions.expiring_7d} hint="Follow up before they lapse" />
            </div>
          </section>
          <section aria-labelledby="h-bk">
            <h2 id="h-bk" className="mb-2 font-semibold">Bookings and revenue</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Bookings today" value={data.bookings.today} />
              <Stat label="Bookings, last 30 days" value={data.bookings.last_30_days} />
              <LinkStat href="/admin/payments?status=captured" label="Revenue this month" value={inr(data.revenue.this_month)} hint="Incl. GST" />
              <LinkStat href="/admin/payments?status=captured" label="Revenue, total" value={inr(data.revenue.total)} hint="Incl. GST" />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
