'use client';

import { useState } from 'react';
import { ErrorState, ListSkeleton, PageHeader, Pager, TableWrap, td, th } from '@/components/admin/common';
import { dt } from '@/components/admin/format';
import { useDebounced, usePaged } from '@/components/admin/hooks';
import type { AuditEntry } from '@/components/admin/types';
import { Card, Empty, Field, Input } from '@/components/ui';

function Details({ d }: { d: AuditEntry['details'] }) {
  if (!d || Object.keys(d).length === 0) return <span className="text-muted">-</span>;
  const json = JSON.stringify(d);
  const pretty = JSON.stringify(d, null, 2);
  if (json.length <= 60) return <code className="break-all text-xs">{json}</code>;
  return (
    <details>
      <summary className="cursor-pointer break-all text-xs">
        <code>{json.slice(0, 50)}...</code>
      </summary>
      <pre className="mt-1 max-w-full overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-white/10">{pretty}</pre>
    </details>
  );
}

export default function AuditPage() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const e = useDebounced(entity.trim());
  const a = useDebounced(action.trim());
  const { data, error, loading, reload, setPage } = usePaged<AuditEntry>('/admin/audit-logs', { entity: e || undefined, action: a || undefined }, 25);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every admin and system change, newest first." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label="Entity" htmlFor="audit-entity" hint="Exact match, e.g. clinic, doctor, user, plan">
          <Input id="audit-entity" list="audit-entities" value={entity} onChange={(ev) => setEntity(ev.target.value)} />
          <datalist id="audit-entities">
            {['clinic', 'doctor', 'doctor_schedule', 'user', 'plan', 'area', 'app_settings', 'payment'].map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
        <Field label="Action" htmlFor="audit-action" hint="Exact match, e.g. clinic.published">
          <Input id="audit-action" value={action} onChange={(ev) => setAction(ev.target.value)} />
        </Field>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.items.length === 0 ? (
        <Empty>No audit entries match.</Empty>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : undefined} aria-busy={loading}>
          <ul className="space-y-3 md:hidden">
            {data.items.map((l) => (
              <li key={l.id}>
                <Card className="space-y-1">
                  <p className="break-all font-medium">{l.action}</p>
                  <p className="text-xs text-muted">
                    {l.entity}
                    {l.entityId ? ` #${l.entityId}` : ''} · actor {l.actorId ?? 'system'} · {dt(l.createdAt)}
                  </p>
                  <Details d={l.details} />
                </Card>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={th}>When</th>
                    <th className={th}>Action</th>
                    <th className={th}>Entity</th>
                    <th className={th}>Actor</th>
                    <th className={th}>Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((l) => (
                    <tr key={l.id}>
                      <td className={td + ' whitespace-nowrap'}>{dt(l.createdAt)}</td>
                      <td className={td}>{l.action}</td>
                      <td className={td}>
                        {l.entity}
                        {l.entityId ? ` #${l.entityId}` : ''}
                      </td>
                      <td className={td}>{l.actorId ?? 'system'}</td>
                      <td className={td + ' max-w-xs'}>
                        <Details d={l.details} />
                      </td>
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
