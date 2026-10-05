'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Card, Empty, Field, Select } from '@/components/ui';
import { ErrorState, ListSkeleton, PageHeader, Pager, TableWrap, td, th } from './common';
import { dt, inr } from './format';
import { usePaged } from './hooks';
import type { AdminPayment } from './types';

const STATUSES = ['created', 'captured', 'failed', 'refunded'];
const tone = (s: string) => (s === 'captured' ? 'green' : s === 'failed' ? 'red' : s === 'refunded' ? 'amber' : 'gray');

export function PaymentsList() {
  const initial = useSearchParams().get('status') ?? '';
  const [status, setStatus] = useState(STATUSES.includes(initial) ? initial : '');
  const { data, error, loading, reload, setPage } = usePaged<AdminPayment>('/admin/payments', { status: status || undefined });

  return (
    <>
      <PageHeader title="Payments" subtitle="Amounts include GST." />
      <div className="mb-4 max-w-xs">
        <Field label="Status" htmlFor="pay-status">
          <Select id="pay-status" value={status} onChange={(e) => setStatus(e.target.value)}>
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
        <Empty>No payments match this filter.</Empty>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : undefined} aria-busy={loading}>
          <ul className="space-y-3 md:hidden">
            {data.items.map((p) => (
              <li key={p.id}>
                <Card className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/clinics/${p.clinicId}?tab=subscription`} className="min-w-0 break-words font-semibold text-brand-700 hover:underline dark:text-brand-100">
                      {p.clinicName}
                    </Link>
                    <Badge tone={tone(p.status)}>{p.status}</Badge>
                  </div>
                  <p className="text-lg font-semibold">{inr(p.amount)}</p>
                  <p className="text-sm text-muted">
                    {p.planName} · {p.method}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </p>
                  <p className="text-xs text-muted">
                    {dt(p.paidAt ?? p.createdAt)}
                    {p.invoiceNo ? ` · ${p.invoiceNo}` : ''}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={th}>Date</th>
                    <th className={th}>Clinic</th>
                    <th className={th}>Plan</th>
                    <th className={th}>Amount</th>
                    <th className={th}>GST</th>
                    <th className={th}>Status</th>
                    <th className={th}>Method</th>
                    <th className={th}>Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((p) => (
                    <tr key={p.id}>
                      <td className={td + ' whitespace-nowrap'}>{dt(p.paidAt ?? p.createdAt)}</td>
                      <td className={td}>
                        <Link href={`/admin/clinics/${p.clinicId}?tab=subscription`} className="font-medium text-brand-700 hover:underline dark:text-brand-100">
                          {p.clinicName}
                        </Link>
                      </td>
                      <td className={td}>{p.planName}</td>
                      <td className={td}>{inr(p.amount)}</td>
                      <td className={td}>{inr(p.gstAmount)}</td>
                      <td className={td}>
                        <Badge tone={tone(p.status)}>{p.status}</Badge>
                      </td>
                      <td className={td}>
                        {p.method}
                        {p.reference && <div className="text-xs text-muted">{p.reference}</div>}
                      </td>
                      <td className={td}>{p.invoiceNo ?? '-'}</td>
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
