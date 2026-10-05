'use client';

import { useState } from 'react';
import { ErrorState, ListSkeleton, PageHeader, useAction } from '@/components/admin/common';
import { useFetch } from '@/components/admin/hooks';
import type { AdminArea } from '@/components/admin/types';
import { Alert, Badge, Button, Card, Empty, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';

function AreaRow({ area, onSaved }: { area: AdminArea; onSaved: () => void }) {
  const [name, setName] = useState(area.name);
  const [order, setOrder] = useState(String(area.sortOrder));
  const [local, setLocal] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  const id = `area-${area.id}`;
  const dirty = name.trim() !== area.name || Number(order) !== area.sortOrder;

  async function patch(body: Record<string, unknown>, ok: string) {
    if (await run(() => api(`/admin/areas/${area.id}`, { method: 'PATCH', body }), ok)) onSaved();
  }
  function save() {
    setLocal(null);
    const n = Number(order);
    if (name.trim().length < 2) return setLocal('Name needs at least 2 characters');
    if (!Number.isInteger(n) || n < 0) return setLocal('Sort order must be a whole number, 0 or more');
    return patch({ name: name.trim(), sortOrder: n }, 'Area saved');
  }

  return (
    <li>
      <Card className="space-y-2">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_auto]">
          <Field label="Name" htmlFor={`${id}-n`}>
            <Input id={`${id}-n`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Sort order" htmlFor={`${id}-o`}>
            <Input id={`${id}-o`} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />
          </Field>
          <div className="flex items-center gap-2">
            <Button size="sm" loading={busy} disabled={!dirty} onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => patch({ isActive: !area.isActive }, area.isActive ? 'Area deactivated' : 'Area activated')}>
              {area.isActive ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        </div>
        {!area.isActive && <Badge tone="gray">Inactive: not offered when creating clinics</Badge>}
        {(local || error) && <Alert tone="error">{local ?? error}</Alert>}
      </Card>
    </li>
  );
}

export default function AreasPage() {
  const { data, error, reload } = useFetch<AdminArea[]>('/admin/areas');
  const [name, setName] = useState('');
  const [order, setOrder] = useState('0');
  const [local, setLocal] = useState<string | null>(null);
  const { run, busy, error: addError } = useAction();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setLocal(null);
    const n = Number(order);
    if (name.trim().length < 2) return setLocal('Name needs at least 2 characters');
    if (!Number.isInteger(n) || n < 0) return setLocal('Sort order must be a whole number, 0 or more');
    if (await run(() => api('/admin/areas', { method: 'POST', body: { name: name.trim(), sortOrder: n } }), 'Area added')) {
      setName('');
      setOrder('0');
      reload();
    }
  }

  return (
    <>
      <PageHeader title="Areas" subtitle="Localities clinics can be placed in. Sorted by sort order, then name." />
      <Card className="mb-4">
        <form onSubmit={add} noValidate className="space-y-3">
          <h2 className="font-semibold">Add area</h2>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_auto]">
            <Field label="Name" htmlFor="area-new-name">
              <Input id="area-new-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Sort order" htmlFor="area-new-order">
              <Input id="area-new-order" inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />
            </Field>
            <Button type="submit" loading={busy}>
              Add
            </Button>
          </div>
          {(local || addError) && <Alert tone="error">{local ?? addError}</Alert>}
        </form>
      </Card>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <Empty>No areas yet.</Empty>
      ) : (
        <ul className="space-y-3">
          {data.map((a) => (
            <AreaRow key={`${a.id}-${a.name}-${a.sortOrder}-${a.isActive}`} area={a} onSaved={reload} />
          ))}
        </ul>
      )}
    </>
  );
}
