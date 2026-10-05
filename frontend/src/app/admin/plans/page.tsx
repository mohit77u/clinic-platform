'use client';

import { useState } from 'react';
import { ErrorState, ListSkeleton, PageHeader, useAction } from '@/components/admin/common';
import { inr, withGst } from '@/components/admin/format';
import { useFetch } from '@/components/admin/hooks';
import type { AdminPlan } from '@/components/admin/types';
import { Alert, Badge, Button, Card, Empty, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';

const num = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());

function PlanRow({ plan, onSaved }: { plan: AdminPlan; onSaved: () => void }) {
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(Number(plan.price)));
  const [gst, setGst] = useState(String(Number(plan.gstPercent)));
  const [active, setActive] = useState(plan.isActive);
  const [local, setLocal] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  const dirty = name !== plan.name || Number(price) !== Number(plan.price) || Number(gst) !== Number(plan.gstPercent) || active !== plan.isActive;
  const id = `plan-${plan.id}`;

  async function save() {
    setLocal(null);
    if (name.trim().length < 2) return setLocal('Enter a plan name');
    if (!num(price) || Number(price) <= 0) return setLocal('Price must be a positive number');
    if (!num(gst) || Number(gst) > 100) return setLocal('GST must be between 0 and 100');
    const ok = await run(() => api(`/admin/plans/${plan.id}`, { method: 'PATCH', body: { name: name.trim(), price: price.trim(), gstPercent: gst.trim(), isActive: active } }), 'Plan saved');
    if (ok) onSaved();
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{plan.name}</h2>
        <Badge>{plan.durationMonths} month{plan.durationMonths === 1 ? '' : 's'}</Badge>
        {!plan.isActive && <Badge tone="gray">Inactive</Badge>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name" htmlFor={`${id}-n`}>
          <Input id={`${id}-n`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Price excl. GST (₹)" htmlFor={`${id}-p`}>
          <Input id={`${id}-p`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="GST %" htmlFor={`${id}-g`}>
          <Input id={`${id}-g`} inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} />
        </Field>
        <div>
          <p className="text-sm font-medium">Total incl. GST</p>
          <p className="mt-2 text-lg font-semibold">{num(price) && num(gst) ? inr(withGst(price, gst)) : '-'}</p>
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (can be bought)
      </label>
      {(local || error) && <Alert tone="error">{local ?? error}</Alert>}
      <Button size="sm" loading={busy} disabled={!dirty} onClick={save}>
        Save
      </Button>
    </Card>
  );
}

function NewPlan({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [months, setMonths] = useState('12');
  const [price, setPrice] = useState('');
  const [gst, setGst] = useState('18');
  const [local, setLocal] = useState<string | null>(null);
  const { run, busy, error } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocal(null);
    const m = Number(months);
    if (name.trim().length < 2) return setLocal('Enter a plan name');
    if (!Number.isInteger(m) || m < 1 || m > 36) return setLocal('Duration must be 1 to 36 months');
    if (!num(price) || Number(price) <= 0) return setLocal('Price must be a positive number');
    if (!num(gst) || Number(gst) > 100) return setLocal('GST must be between 0 and 100');
    const ok = await run(() => api('/admin/plans', { method: 'POST', body: { name: name.trim(), durationMonths: m, price: price.trim(), gstPercent: gst.trim() } }), 'Plan created');
    if (ok) {
      setName('');
      setPrice('');
      onCreated();
    }
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="space-y-3">
        <h2 className="font-semibold">New plan</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name" htmlFor="np-name">
            <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Duration (months)" htmlFor="np-months">
            <Input id="np-months" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
          </Field>
          <Field label="Price excl. GST (₹)" htmlFor="np-price" hint={num(price) && num(gst) ? `Total ${inr(withGst(price, gst))}` : undefined}>
            <Input id="np-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="GST %" htmlFor="np-gst">
            <Input id="np-gst" inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} />
          </Field>
        </div>
        {(local || error) && <Alert tone="error">{local ?? error}</Alert>}
        <Button type="submit" loading={busy}>
          Create plan
        </Button>
      </form>
    </Card>
  );
}

export default function PlansPage() {
  const { data, error, reload } = useFetch<AdminPlan[]>('/admin/plans');
  return (
    <>
      <PageHeader title="Plans" subtitle="Prices are base prices excluding GST. The total clinics pay includes GST." />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="space-y-3">
          {data.length === 0 && <Empty>No plans yet. Create the first one below.</Empty>}
          {data.map((p) => (
            <PlanRow key={`${p.id}-${p.price}-${p.gstPercent}-${p.isActive}-${p.name}`} plan={p} onSaved={reload} />
          ))}
          <NewPlan onCreated={reload} />
        </div>
      )}
    </>
  );
}
