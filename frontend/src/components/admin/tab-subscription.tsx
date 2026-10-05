'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Field, Input, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/toast';
import { api } from '@/lib/api';
import { ConfirmDialog, ErrorState, ListSkeleton, StatusBadge, TableWrap, td, th, useAction } from './common';
import { dOnly, dt, inr, withGst } from './format';
import { useFetch } from './hooks';
import type { AdminClinicDetail, AdminPayment, AdminPlan, AdminSubscription } from './types';
import type { Paged } from '@/lib/types';

const kindTone = { trial: 'blue', paid: 'green', gifted: 'brand' } as const;

function currentSub(subs: AdminSubscription[]): AdminSubscription | undefined {
  const now = Date.now();
  return [...subs].filter((s) => s.status === 'active' && new Date(s.endsAt).getTime() > now).sort((a, b) => +new Date(b.endsAt) - +new Date(a.endsAt))[0];
}

function ManualPayment({ clinicId, onDone }: { clinicId: string; onDone: () => void }) {
  const plans = useFetch<AdminPlan[]>('/admin/plans');
  const [planId, setPlanId] = useState('');
  const [reference, setReference] = useState('');
  const [local, setLocal] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  const active = plans.data?.filter((p) => p.isActive) ?? [];
  const plan = active.find((p) => String(p.id) === planId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocal(null);
    if (!plan) return setLocal('Choose a plan');
    if (reference.trim().length < 3) return setLocal('Enter the payment reference (bank UTR, receipt no.), at least 3 characters');
    const ok = await run(() => api(`/admin/clinics/${clinicId}/manual-payment`, { method: 'POST', body: { planId: plan.id, reference: reference.trim() } }), 'Payment recorded and plan extended');
    if (ok) {
      setReference('');
      setPlanId('');
      onDone();
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <h3 className="font-semibold">Record manual payment</h3>
      <p className="text-sm text-muted">For cash or bank transfers received outside Razorpay. Extends the plan and issues the GST invoice.</p>
      {plans.error && <Alert tone="error">{plans.error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan" htmlFor="mp-plan" hint={plan ? `Total ${inr(withGst(plan.price, plan.gstPercent))} incl. ${Number(plan.gstPercent)}% GST` : undefined}>
          <Select id="mp-plan" value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={plans.loading && !plans.data}>
            <option value="">Select plan</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.durationMonths} mo · {inr(p.price)} + GST
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" htmlFor="mp-ref">
          <Input id="mp-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / receipt no." />
        </Field>
      </div>
      {(local || error) && <Alert tone="error">{local ?? error}</Alert>}
      <Button type="submit" loading={busy}>
        Record payment
      </Button>
    </form>
  );
}

function GiftDays({ clinicId, onDone }: { clinicId: string; onDone: () => void }) {
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [local, setLocal] = useState<string | null>(null);
  const { run, busy, error } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocal(null);
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 730) return setLocal('Days must be a whole number from 1 to 730');
    const ok = await run(() => api(`/admin/clinics/${clinicId}/gift-days`, { method: 'POST', body: { days: n, reason: reason.trim() || undefined } }), `${n} free days added`);
    if (ok) {
      setDays('');
      setReason('');
      onDone();
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <h3 className="font-semibold">Gift free days</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Days (1 to 730)" htmlFor="gd-days">
          <Input id="gd-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label="Reason" htmlFor="gd-reason">
          <Input id="gd-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      {(local || error) && <Alert tone="error">{local ?? error}</Alert>}
      <Button type="submit" loading={busy}>
        Gift days
      </Button>
    </form>
  );
}

function ClinicPayments({ clinicId }: { clinicId: string }) {
  const r = useFetch<Paged<AdminPayment>>('/admin/payments?page=1&limit=100');
  return (
    <section aria-labelledby="sub-pay" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="sub-pay" className="font-semibold">Payments</h3>
        <Link href="/admin/payments" className="text-sm text-brand-700 hover:underline dark:text-brand-100">
          All payments
        </Link>
      </div>
      {r.error ? (
        <ErrorState message={r.error} onRetry={r.reload} />
      ) : !r.data ? (
        <ListSkeleton rows={2} />
      ) : (
        (() => {
          const mine = r.data.items.filter((p) => p.clinicId === clinicId);
          if (!mine.length) return <Empty>No payments from this clinic in the latest {r.data.items.length} payments.</Empty>;
          return (
            <TableWrap>
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={th}>Date</th>
                    <th className={th}>Plan</th>
                    <th className={th}>Amount</th>
                    <th className={th}>Status</th>
                    <th className={th}>Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mine.map((p) => (
                    <tr key={p.id}>
                      <td className={td}>{dt(p.paidAt ?? p.createdAt)}</td>
                      <td className={td}>{p.planName}</td>
                      <td className={td}>{inr(p.amount)}</td>
                      <td className={td}>
                        <Badge tone={p.status === 'captured' ? 'green' : p.status === 'failed' ? 'red' : 'gray'}>{p.status}</Badge> <span className="text-xs text-muted">{p.method}</span>
                      </td>
                      <td className={td}>{p.invoiceNo ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          );
        })()
      )}
    </section>
  );
}

export function SubscriptionTab({ clinic, onChanged }: { clinic: AdminClinicDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const [trialDays, setTrialDays] = useState('');
  const [trialErr, setTrialErr] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'reject' | 'suspend' | 'reactivate'>(null);
  const [reason, setReason] = useState('');
  const { run, busy, error } = useAction();
  const cur = currentSub(clinic.subscriptions);
  const subs = [...clinic.subscriptions].sort((a, b) => +new Date(b.endsAt) - +new Date(a.endsAt));
  const st = clinic.status;

  async function publish() {
    setTrialErr(null);
    let body: { trialDays?: number } = {};
    if (trialDays.trim() !== '') {
      const n = Number(trialDays);
      if (!/^\d+$/.test(trialDays.trim()) || n > 365) return setTrialErr('Trial days must be a whole number from 0 to 365');
      body = { trialDays: n };
    }
    const ok = await run(async () => {
      const r = await api<{ trial: { endsAt: string } | null }>(`/admin/clinics/${clinic.id}/publish`, { method: 'POST', body });
      setPublishResult(r.trial ? `Published. Trial ends on ${dOnly(r.trial.endsAt)}.` : 'Published without a trial (trial days was 0 or the clinic already had a subscription).');
    });
    if (ok) {
      toast('success', 'Clinic published');
      onChanged();
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">Status</h3>
          <StatusBadge status={st} />
        </div>
        {cur ? (
          <p className="text-sm">
            Current: <Badge tone={kindTone[cur.kind]}>{cur.kind}</Badge> until <strong>{dOnly(cur.endsAt)}</strong>
          </p>
        ) : (
          <p className="text-sm text-muted">No active subscription.</p>
        )}
        {st === 'rejected' && clinic.rejectionReason && <Alert tone="warning">Rejected: {clinic.rejectionReason}</Alert>}
        {publishResult && <Alert tone="success">{publishResult}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
      </Card>

      {(st === 'pending' || st === 'rejected') && (
        <Card className="space-y-3">
          <h3 className="font-semibold">Publish clinic</h3>
          <p className="text-sm text-muted">Makes the clinic visible to patients and starts the free trial.</p>
          <Field label="Trial days override" htmlFor="pub-trial" error={trialErr} hint={clinic.trialDays != null ? `Clinic default: ${clinic.trialDays}. Leave empty to use it.` : 'Leave empty to use the platform default.'}>
            <Input id="pub-trial" inputMode="numeric" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className="max-w-40" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="success" loading={busy} onClick={publish}>
              Publish
            </Button>
            {st === 'pending' && (
              <Button variant="danger" disabled={busy} onClick={() => { setReason(''); setConfirm('reject'); }}>
                Reject...
              </Button>
            )}
          </div>
        </Card>
      )}

      {st === 'approved' && (
        <Card>
          <Button variant="danger" disabled={busy} onClick={() => setConfirm('suspend')}>
            Suspend clinic...
          </Button>
          <p className="mt-2 text-xs text-muted">Hides the clinic and stops new bookings until reactivated.</p>
        </Card>
      )}
      {st === 'suspended' && (
        <Card>
          <Button variant="success" disabled={busy} onClick={() => setConfirm('reactivate')}>
            Reactivate clinic
          </Button>
        </Card>
      )}

      {(st === 'approved' || st === 'suspended') && (
        <>
          <Card>
            <GiftDays clinicId={clinic.id} onDone={onChanged} />
          </Card>
          <Card>
            <ManualPayment clinicId={clinic.id} onDone={onChanged} />
          </Card>
        </>
      )}

      <section aria-labelledby="sub-hist" className="space-y-2">
        <h3 id="sub-hist" className="font-semibold">Subscription history</h3>
        {subs.length === 0 ? (
          <Empty>No subscriptions yet.</Empty>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>Type</th>
                  <th className={th}>Starts</th>
                  <th className={th}>Ends</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td className={td}>
                      <Badge tone={kindTone[s.kind] ?? 'gray'}>{s.kind}</Badge>
                    </td>
                    <td className={td}>{dOnly(s.startsAt)}</td>
                    <td className={td}>{dOnly(s.endsAt)}</td>
                    <td className={td}>{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

      <ClinicPayments clinicId={clinic.id} />

      <ConfirmDialog
        open={confirm === 'reject'}
        title="Reject clinic?"
        message="The clinic stays hidden. Give a reason so the team can fix and resubmit."
        confirmLabel="Reject"
        danger
        disabled={reason.trim().length < 3}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await api(`/admin/clinics/${clinic.id}/reject`, { method: 'POST', body: { reason: reason.trim() } });
          toast('success', 'Clinic rejected');
          onChanged();
        }}
      >
        <Field label="Reason (3 to 500 characters)" htmlFor="rej-reason">
          <Textarea id="rej-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'suspend'}
        title="Suspend clinic?"
        message={`${clinic.name} will disappear from search and patients cannot book until you reactivate it.`}
        confirmLabel="Suspend"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await api(`/admin/clinics/${clinic.id}/suspend`, { method: 'POST' });
          toast('success', 'Clinic suspended');
          onChanged();
        }}
      />
      <ConfirmDialog
        open={confirm === 'reactivate'}
        title="Reactivate clinic?"
        message={`${clinic.name} will be visible and bookable again.`}
        confirmLabel="Reactivate"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await api(`/admin/clinics/${clinic.id}/reactivate`, { method: 'POST' });
          toast('success', 'Clinic reactivated');
          onChanged();
        }}
      />
    </div>
  );
}
