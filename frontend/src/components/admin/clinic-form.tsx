'use client';

import { useState } from 'react';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from './common';
import { isAllowedMapUrl } from './format';
import { useFetch } from './hooks';
import type { AdminClinic } from './types';

interface FormState {
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  addressLine: string;
  area: string;
  pincode: string;
  mapUrl: string;
  description: string;
  registrationNo: string;
  trialDays: string;
  liveQueueEnabled: boolean;
}

const fromClinic = (c?: AdminClinic): FormState => ({
  name: c?.name ?? '',
  phone: c?.phone ?? '',
  whatsapp: c?.whatsapp ?? '',
  email: c?.email ?? '',
  addressLine: c?.addressLine ?? '',
  area: c?.area ?? '',
  pincode: c?.pincode ?? '',
  mapUrl: c?.mapUrl ?? '',
  description: c?.description ?? '',
  registrationNo: c?.registrationNo ?? '',
  trialDays: c?.trialDays == null ? '' : String(c.trialDays),
  liveQueueEnabled: c?.liveQueueEnabled ?? true,
});

const phoneOk = (v: string) => /^\+?\d{8,14}$/.test(v.replace(/[\s-]/g, ''));

function validate(f: FormState): Partial<Record<keyof FormState, string>> {
  const e: Partial<Record<keyof FormState, string>> = {};
  if (f.name.trim().length < 2) e.name = 'Enter the clinic name (at least 2 characters)';
  if (!phoneOk(f.phone.trim())) e.phone = 'Enter a valid phone number (8 to 14 digits)';
  if (f.whatsapp.trim() && !phoneOk(f.whatsapp.trim())) e.whatsapp = 'Enter a valid WhatsApp number';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (f.addressLine.trim().length < 3) e.addressLine = 'Enter the address (at least 3 characters)';
  if (!f.area) e.area = 'Choose an area';
  if (f.pincode.trim() && !/^\d{6}$/.test(f.pincode.trim())) e.pincode = 'Pincode must be 6 digits';
  if (f.mapUrl.trim() && !isAllowedMapUrl(f.mapUrl.trim())) e.mapUrl = 'Use a Google Maps share link (https, google.com/maps, maps.app.goo.gl, goo.gl/maps or maps.google.com)';
  if (f.trialDays.trim() && !(/^\d+$/.test(f.trialDays.trim()) && Number(f.trialDays) <= 365)) e.trialDays = 'Whole number from 0 to 365';
  return e;
}

export function ClinicForm({ clinic, onSaved }: { clinic?: AdminClinic; onSaved: (c: AdminClinic) => void }) {
  const editing = !!clinic;
  const [f, setF] = useState<FormState>(() => fromClinic(clinic));
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const { run, busy } = useAction();
  const areas = useFetch<string[]>('/areas');
  const areaList = areas.data ? (f.area && !areas.data.includes(f.area) ? [f.area, ...areas.data] : areas.data) : f.area ? [f.area] : [];

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const errs = validate(f);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    // Create: omit blanks. Edit: send null for blanked optional fields so they are cleared.
    const blank = editing ? null : undefined;
    const opt = (v: string) => (v.trim() === '' ? blank : v.trim());
    const body = {
      name: f.name.trim(),
      phone: f.phone.trim(),
      whatsapp: opt(f.whatsapp),
      email: opt(f.email),
      addressLine: f.addressLine.trim(),
      area: f.area,
      pincode: opt(f.pincode),
      mapUrl: opt(f.mapUrl),
      description: opt(f.description),
      registrationNo: opt(f.registrationNo),
      trialDays: f.trialDays.trim() === '' ? blank : Number(f.trialDays),
      liveQueueEnabled: f.liveQueueEnabled,
    };
    let saved: AdminClinic | undefined;
    await run(
      async () => {
        saved = editing
          ? await api<AdminClinic>(`/admin/clinics/${clinic.id}`, { method: 'PATCH', body })
          : await api<AdminClinic>('/admin/clinics', { method: 'POST', body });
      },
      editing ? 'Clinic details saved' : 'Clinic created',
    );
    if (saved) onSaved(saved);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {areas.error && <Alert tone="error">Could not load areas: {areas.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Clinic name *" htmlFor="cf-name" error={errors.name}>
          <Input id="cf-name" value={f.name} onChange={set('name')} maxLength={120} required />
        </Field>
        <Field label="Registration no." htmlFor="cf-reg">
          <Input id="cf-reg" value={f.registrationNo} onChange={set('registrationNo')} maxLength={100} />
        </Field>
        <Field label="Phone *" htmlFor="cf-phone" error={errors.phone}>
          <Input id="cf-phone" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} required />
        </Field>
        <Field label="WhatsApp" htmlFor="cf-wa" error={errors.whatsapp}>
          <Input id="cf-wa" type="tel" inputMode="tel" value={f.whatsapp} onChange={set('whatsapp')} />
        </Field>
        <Field label="Email" htmlFor="cf-email" error={errors.email}>
          <Input id="cf-email" type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Area *" htmlFor="cf-area" error={errors.area} hint="Manage the list under Areas.">
          <Select id="cf-area" value={f.area} onChange={set('area')} required disabled={areas.loading && !areas.data}>
            <option value="">Select area</option>
            {areaList.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address line *" htmlFor="cf-addr" error={errors.addressLine}>
            <Input id="cf-addr" value={f.addressLine} onChange={set('addressLine')} maxLength={300} required />
          </Field>
        </div>
        <Field label="Pincode" htmlFor="cf-pin" error={errors.pincode}>
          <Input id="cf-pin" inputMode="numeric" maxLength={6} value={f.pincode} onChange={set('pincode')} />
        </Field>
        <Field label="Trial days override" htmlFor="cf-trial" error={errors.trialDays} hint="Leave empty to use the platform default.">
          <Input id="cf-trial" inputMode="numeric" value={f.trialDays} onChange={set('trialDays')} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Google Maps link" htmlFor="cf-map" error={errors.mapUrl} hint="Share link from Google Maps (https).">
            <Input id="cf-map" type="url" value={f.mapUrl} onChange={set('mapUrl')} placeholder="https://maps.app.goo.gl/..." />
          </Field>
        </div>
        <div className="sm:col-span-2 rounded-lg border border-border p-3">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 accent-brand-600" checked={f.liveQueueEnabled} onChange={(e) => setF((cur) => ({ ...cur, liveQueueEnabled: e.target.checked }))} />
            <span>
              <span className="block font-medium">Show live queue to patients</span>
              <span className="block text-sm text-muted">
                On: patients follow &quot;now serving&quot; live and the WhatsApp reminder follows the real queue.
                Off: patients see only their token number and the approximate time given at booking, and the reminder is sent that long before that fixed time.
              </span>
            </span>
          </label>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="cf-desc">
            <Textarea id="cf-desc" value={f.description} onChange={set('description')} maxLength={2000} />
          </Field>
        </div>
      </div>
      <Button type="submit" loading={busy}>
        {editing ? 'Save changes' : 'Create clinic'}
      </Button>
    </form>
  );
}
