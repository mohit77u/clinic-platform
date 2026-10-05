'use client';

import { useState } from 'react';
import { Badge, Button, Card, Empty, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from './common';
import { DoctorForm } from './doctor-form';
import { inr } from './format';
import { ScheduleEditor } from './schedule-editor';
import { thumbOf } from './format';
import type { AdminClinicDetail, AdminDoctor } from './types';

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function PhotoUpload({ doctor, onChanged }: { doctor: AdminDoctor; onChanged: () => void }) {
  const { run, busy } = useAction();
  const [err, setErr] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    setErr(null);
    if (!file) return;
    if (!TYPES.includes(file.type)) return setErr('Only JPEG, PNG or WebP images are allowed');
    if (file.size > MAX_BYTES) return setErr('Photo must be smaller than 8 MB');
    const form = new FormData();
    form.append('file', file);
    const ok = await run(() => api(`/admin/doctors/${doctor.id}/photo`, { method: 'POST', form }), 'Photo updated');
    if (ok) onChanged();
  }

  return (
    <Field label="Photo" htmlFor={`photo-${doctor.id}`} error={err} hint={busy ? 'Uploading...' : 'JPEG, PNG or WebP, up to 8 MB'}>
      <Input
        id={`photo-${doctor.id}`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(e) => {
          const el = e.target;
          const file = el.files?.[0];
          el.value = '';
          void pick(file);
        }}
      />
    </Field>
  );
}

function DoctorCard({ clinicId, doctor, onChanged }: { clinicId: string; doctor: AdminDoctor; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  if (editing) {
    return (
      <div className="space-y-3">
        <DoctorForm
          clinicId={clinicId}
          doctor={doctor}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
        <Card>
          <PhotoUpload doctor={doctor} onChanged={onChanged} />
        </Card>
      </div>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        {doctor.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbOf(doctor.photoUrl)} alt={doctor.name} loading="lazy" className="size-16 shrink-0 rounded-full bg-slate-200 object-cover dark:bg-white/10" />
        ) : (
          <div aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-brand-100 text-xl font-semibold text-brand-900 dark:bg-brand-500/20 dark:text-brand-100">
            {doctor.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words font-semibold">{doctor.name}</h3>
            {!doctor.isActive && <Badge tone="gray">Inactive</Badge>}
          </div>
          <p className="text-sm text-muted">
            {doctor.specialization?.name ?? 'Specialization'}
            {doctor.qualification ? ` · ${doctor.qualification}` : ''}
          </p>
          <p className="text-xs text-muted">
            {doctor.experienceYears != null ? `${doctor.experienceYears} yrs · ` : ''}
            {doctor.consultationFee != null ? `Fee ${inr(doctor.consultationFee)} · ` : ''}
            {doctor.medicalRegNo ? `Reg ${doctor.medicalRegNo}` : 'No registration no.'}
            {doctor.languages.length ? ` · ${doctor.languages.join(', ')}` : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          Edit / photo
        </Button>
        <Button size="sm" variant="secondary" aria-expanded={showSchedule} onClick={() => setShowSchedule((s) => !s)}>
          {showSchedule ? 'Hide schedule' : `Weekly schedule (${doctor.schedules.length})`}
        </Button>
      </div>
      {showSchedule && <ScheduleEditor doctor={doctor} onChanged={onChanged} />}
    </Card>
  );
}

export function DoctorsTab({ clinic, doctors, onChanged }: { clinic: AdminClinicDetail; doctors: AdminDoctor[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      {adding ? (
        <DoctorForm
          clinicId={clinic.id}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onChanged();
          }}
        />
      ) : (
        <Button onClick={() => setAdding(true)}>Add doctor</Button>
      )}
      {doctors.length === 0 ? (
        <Empty>No doctors yet.</Empty>
      ) : (
        <ul className="space-y-3">
          {doctors.map((d) => (
            <li key={d.id}>
              <DoctorCard clinicId={clinic.id} doctor={d} onChanged={onChanged} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
