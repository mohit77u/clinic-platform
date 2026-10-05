'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { ConfirmDialog, useAction } from './common';
import type { AdminClinicDetail, AdminMember } from './types';
import { useToast } from '@/components/toast';

export function TeamTab({ clinic, onChanged }: { clinic: AdminClinicDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'clinic_owner' | 'clinic_staff'>('clinic_owner');
  const [local, setLocal] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<AdminMember | null>(null);
  const { run, busy, error } = useAction();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setLocal(null);
    if (!/^[+\d\s-]{10,16}$/.test(mobile.trim())) return setLocal('Enter a valid mobile number (10 to 16 digits)');
    const ok = await run(
      () => api('/admin/clinics/' + clinic.id + '/members', { method: 'POST', body: { mobile: mobile.trim(), name: name.trim() || undefined, role } }),
      'Login added',
    );
    if (ok) {
      setMobile('');
      setName('');
      onChanged();
    }
  }

  return (
    <div className="space-y-4">
      <Alert tone="info">Owners and receptionists sign in to the clinic panel with a one-time password (OTP) sent to their mobile number. There is no password to set.</Alert>
      {clinic.members.length === 0 ? (
        <Empty>No logins yet. Add the clinic owner below.</Empty>
      ) : (
        <ul className="space-y-2">
          {clinic.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="break-words font-medium">{m.name || 'Unnamed'}</p>
                <p className="text-xs text-muted">{m.mobile}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.role === 'clinic_owner' ? 'brand' : 'blue'}>{m.role === 'clinic_owner' ? 'Owner' : 'Receptionist'}</Badge>
                <Button size="sm" variant="secondary" onClick={() => setToRemove(m)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <form onSubmit={add} noValidate className="space-y-3">
          <h3 className="font-semibold">Add login</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Mobile *" htmlFor="tm-mobile">
              <Input id="tm-mobile" type="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            </Field>
            <Field label="Name" htmlFor="tm-name">
              <Input id="tm-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Role" htmlFor="tm-role">
              <Select id="tm-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                <option value="clinic_owner">Owner</option>
                <option value="clinic_staff">Receptionist</option>
              </Select>
            </Field>
          </div>
          {(local || error) && <Alert tone="error">{local ?? error}</Alert>}
          <Button type="submit" loading={busy}>
            Add login
          </Button>
        </form>
      </Card>
      <ConfirmDialog
        open={!!toRemove}
        title="Remove login?"
        message={toRemove ? `${toRemove.name || toRemove.mobile} will no longer be able to open this clinic's panel.` : ''}
        confirmLabel="Remove"
        danger
        onClose={() => setToRemove(null)}
        onConfirm={async () => {
          if (!toRemove) return;
          await api(`/admin/clinics/${clinic.id}/members/${toRemove.userId}`, { method: 'DELETE' });
          toast('success', 'Login removed');
          onChanged();
        }}
      />
    </div>
  );
}
