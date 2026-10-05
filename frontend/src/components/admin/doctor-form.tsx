'use client';

import { useState } from 'react';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import type { Specialization } from '@/lib/types';
import { useAction } from './common';
import { useFetch } from './hooks';
import type { AdminDoctor } from './types';

interface DForm {
  specializationId: string;
  name: string;
  qualification: string;
  experienceYears: string;
  medicalRegNo: string;
  consultationFee: string;
  languages: string;
  bio: string;
  isActive: boolean;
}

const init = (d?: AdminDoctor): DForm => ({
  specializationId: d ? String(d.specializationId) : '',
  name: d?.name ?? '',
  qualification: d?.qualification ?? '',
  experienceYears: d?.experienceYears == null ? '' : String(d.experienceYears),
  medicalRegNo: d?.medicalRegNo ?? '',
  consultationFee: d?.consultationFee == null ? '' : String(Number(d.consultationFee)),
  languages: d?.languages?.join(', ') ?? '',
  bio: d?.bio ?? '',
  isActive: d?.isActive ?? true,
});

export function DoctorForm({ clinicId, doctor, onSaved, onCancel }: { clinicId: string; doctor?: AdminDoctor; onSaved: () => void; onCancel: () => void }) {
  const editing = !!doctor;
  const [f, setF] = useState(() => init(doctor));
  const [local, setLocal] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  const specs = useFetch<Specialization[]>('/specializations');
  const set = (k: keyof DForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const id = `df-${doctor?.id ?? 'new'}`;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setLocal(null);
    if (!f.specializationId) return setLocal('Choose a specialization');
    if (f.name.trim().length < 2) return setLocal('Enter the doctor name');
    if (f.experienceYears.trim() && !(/^\d+$/.test(f.experienceYears.trim()) && Number(f.experienceYears) <= 70)) return setLocal('Experience must be a whole number from 0 to 70');
    if (f.consultationFee.trim() && !/^\d+(\.\d{1,2})?$/.test(f.consultationFee.trim())) return setLocal('Consultation fee must be a number, e.g. 500');
    const blank = editing ? null : undefined;
    const opt = (v: string) => (v.trim() === '' ? blank : v.trim());
    const languages = f.languages.split(',').map((l) => l.trim()).filter(Boolean);
    if (languages.length > 10) return setLocal('At most 10 languages');
    const body = {
      specializationId: Number(f.specializationId),
      name: f.name.trim(),
      qualification: opt(f.qualification),
      experienceYears: f.experienceYears.trim() === '' ? blank : Number(f.experienceYears),
      medicalRegNo: opt(f.medicalRegNo),
      consultationFee: opt(f.consultationFee),
      languages,
      bio: opt(f.bio),
      isActive: f.isActive,
    };
    const ok = await run(
      () => (editing ? api(`/admin/doctors/${doctor.id}`, { method: 'PATCH', body }) : api(`/admin/clinics/${clinicId}/doctors`, { method: 'POST', body })),
      editing ? 'Doctor updated' : 'Doctor added',
    );
    if (ok) onSaved();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="font-semibold">{editing ? `Edit ${doctor.name}` : 'Add doctor'}</h3>
      {specs.error && <Alert tone="error">Could not load specializations: {specs.error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *" htmlFor={`${id}-name`}>
          <Input id={`${id}-name`} value={f.name} onChange={set('name')} maxLength={120} />
        </Field>
        <Field label="Specialization *" htmlFor={`${id}-spec`}>
          <Select id={`${id}-spec`} value={f.specializationId} onChange={set('specializationId')} disabled={specs.loading && !specs.data}>
            <option value="">Select specialization</option>
            {specs.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Qualification" htmlFor={`${id}-q`}>
          <Input id={`${id}-q`} value={f.qualification} onChange={set('qualification')} maxLength={200} placeholder="MBBS, MD" />
        </Field>
        <Field label="Experience (years)" htmlFor={`${id}-exp`}>
          <Input id={`${id}-exp`} inputMode="numeric" value={f.experienceYears} onChange={set('experienceYears')} />
        </Field>
        <Field label="MP medical registration no." htmlFor={`${id}-reg`}>
          <Input id={`${id}-reg`} value={f.medicalRegNo} onChange={set('medicalRegNo')} maxLength={100} />
        </Field>
        <Field label="Consultation fee (₹)" htmlFor={`${id}-fee`}>
          <Input id={`${id}-fee`} inputMode="decimal" value={f.consultationFee} onChange={set('consultationFee')} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Languages" htmlFor={`${id}-lang`} hint="Comma separated, e.g. Hindi, English">
            <Input id={`${id}-lang`} value={f.languages} onChange={set('languages')} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Bio" htmlFor={`${id}-bio`}>
            <Textarea id={`${id}-bio`} value={f.bio} onChange={set('bio')} maxLength={2000} />
          </Field>
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5" checked={f.isActive} onChange={(e) => setF((s) => ({ ...s, isActive: e.target.checked }))} />
        Active (visible to patients)
      </label>
      {(local || error) && <Alert tone="error">{local ?? error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          {editing ? 'Save doctor' : 'Add doctor'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
