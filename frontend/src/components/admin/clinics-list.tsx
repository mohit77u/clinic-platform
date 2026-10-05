'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Card, Empty, Field, Input, LinkButton, Select } from '@/components/ui';
import { ErrorState, ListSkeleton, PageHeader, Pager, StatusBadge, TableWrap, td, th } from './common';
import { dOnly } from './format';
import { useDebounced, usePaged } from './hooks';
import type { AdminClinic } from './types';

const STATUSES = ['pending', 'approved', 'rejected', 'suspended'];

export function ClinicsList() {
  const initial = useSearchParams().get('status') ?? '';
  const [status, setStatus] = useState(STATUSES.includes(initial) ? initial : '');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const { data, error, loading, reload, setPage } = usePaged<AdminClinic>('/admin/clinics', { status: status || undefined, q: dq || undefined });

  return (
    <>
      <PageHeader
        title="Clinics"
        actions={
          <LinkButton href="/admin/clinics/new" size="sm">
            New clinic
          </LinkButton>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label="Search by name" htmlFor="clinic-q">
          <Input id="clinic-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Clinic name" />
        </Field>
        <Field label="Status" htmlFor="clinic-status">
          <Select id="clinic-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.items.length === 0 ? (
        <Empty>No clinics match these filters.</Empty>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : undefined} aria-busy={loading}>
          {/* phones: cards */}
          <ul className="space-y-3 md:hidden">
            {data.items.map((c) => (
              <li key={c.id}>
                <Card>
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/clinics/${c.id}`} className="min-w-0 break-words font-semibold text-brand-700 hover:underline dark:text-brand-100">
                      {c.name}
                    </Link>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {c.area} · {c.phone}
                  </p>
                  <p className="text-xs text-muted">Added {dOnly(c.createdAt)}</p>
                </Card>
              </li>
            ))}
          </ul>
          {/* md+: table */}
          <div className="hidden md:block">
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={th}>Clinic</th>
                    <th className={th}>Area</th>
                    <th className={th}>Phone</th>
                    <th className={th}>Status</th>
                    <th className={th}>Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((c) => (
                    <tr key={c.id}>
                      <td className={td}>
                        <Link href={`/admin/clinics/${c.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-100">
                          {c.name}
                        </Link>
                        <div className="text-xs text-muted">{c.slug}</div>
                      </td>
                      <td className={td}>{c.area}</td>
                      <td className={td}>{c.phone}</td>
                      <td className={td}>
                        <StatusBadge status={c.status} />
                      </td>
                      <td className={td}>{dOnly(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} disabled={loading} />
        </div>
      )}
    </>
  );
}
