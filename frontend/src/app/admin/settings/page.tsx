'use client';

import { useState } from 'react';
import { ErrorState, ListSkeleton, PageHeader, useAction } from '@/components/admin/common';
import { useFetch } from '@/components/admin/hooks';
import type { AdminSettings } from '@/components/admin/types';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';

const FIELDS: { key: keyof AdminSettings; label: string; help: string }[] = [
  { key: 'default_trial_days', label: 'Default trial days', help: 'Free trial given when a clinic is published, unless the clinic has its own override.' },
  { key: 'grace_days', label: 'Grace days', help: 'Days a clinic stays listed after its subscription ends, before it is hidden.' },
  { key: 'advance_booking_days', label: 'Advance booking days', help: 'How many days ahead patients can book.' },
  { key: 'default_reminder_minutes', label: 'Default WhatsApp reminder (minutes)', help: 'Pre-selected "remind me this long before my turn" on the booking page. Patients can change it (5 min – 12 h).' },
  { key: 'cancel_cutoff_minutes', label: 'Cancel cut-off (minutes)', help: 'Patients cannot cancel within this many minutes of the session start.' },
];

function SettingsForm({ initial, onSaved }: { initial: AdminSettings; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<keyof AdminSettings, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(initial[f.key])])) as Record<keyof AdminSettings, string>);
  const [local, setLocal] = useState<string | null>(null);
  const { run, busy, error } = useAction();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocal(null);
    const body: Partial<AdminSettings> = {};
    for (const f of FIELDS) {
      const v = vals[f.key].trim();
      if (!/^\d+$/.test(v) || Number(v) > 3650) return setLocal(`${f.label}: enter a whole number from 0 to 3650`);
      body[f.key] = Number(v);
    }
    if (await run(() => api('/admin/settings', { method: 'PUT', body }), 'Settings saved')) onSaved();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.help} htmlFor={`set-${f.key}`}>
            <Input id={`set-${f.key}`} inputMode="numeric" value={vals[f.key]} onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))} />
          </Field>
        ))}
      </div>
      {(local || error) && <Alert tone="error">{local ?? error}</Alert>}
      <Button type="submit" loading={busy}>
        Save settings
      </Button>
    </form>
  );
}

export default function SettingsPage() {
  const { data, error, reload } = useFetch<AdminSettings>('/admin/settings');
  return (
    <>
      <PageHeader title="Settings" subtitle="Platform-wide numbers. Changes apply immediately." />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : (
        <Card className="max-w-3xl">
          <SettingsForm initial={data} onSaved={reload} />
        </Card>
      )}
    </>
  );
}
