'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Field, Input, Select } from '@/components/ui';
import { useToast } from '@/components/toast';
import { api } from '@/lib/api';
import { ConfirmDialog, useAction } from './common';
import { WEEKDAYS, hhmm } from './format';
import type { AdminDoctor, AdminSchedule } from './types';

interface SForm {
  weekday: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  mode: 'token' | 'slot';
  slotMinutes: string;
  maxTokens: string;
  walkinReserved: string;
  isActive: boolean;
}

const blank = (weekday = 1): SForm => ({ weekday: String(weekday), sessionName: '', startTime: '09:00', endTime: '13:00', mode: 'token', slotMinutes: '15', maxTokens: '30', walkinReserved: '5', isActive: true });
const fromSchedule = (s: AdminSchedule): SForm => ({
  weekday: String(s.weekday),
  sessionName: s.sessionName,
  startTime: hhmm(s.startTime),
  endTime: hhmm(s.endTime),
  mode: s.mode,
  slotMinutes: s.slotMinutes ? String(s.slotMinutes) : '15',
  maxTokens: String(s.maxTokens),
  walkinReserved: String(s.walkinReserved),
  isActive: s.isActive,
});

function SessionForm({ doctor, editing, initial, onDone, onCancel }: { doctor: AdminDoctor; editing?: AdminSchedule; initial: SForm; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const [local, setLocal] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  const set = (k: keyof SForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const id = `sf-${editing?.id ?? 'new'}-${doctor.id}`;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setLocal(null);
    const max = Number(f.maxTokens);
    const walk = Number(f.walkinReserved || 0);
    const slot = Number(f.slotMinutes);
    if (!f.startTime || !f.endTime) return setLocal('Enter start and end time');
    if (!Number.isInteger(max) || max < 1 || max > 500) return setLocal('Max tokens must be a whole number from 1 to 500');
    if (!Number.isInteger(walk) || walk < 0 || walk > 500) return setLocal('Walk-in reserved must be a whole number from 0 to 500');
    if (f.mode === 'slot' && (!Number.isInteger(slot) || slot < 1 || slot > 240)) return setLocal('Slot minutes must be a whole number from 1 to 240');
    const body = {
      weekday: Number(f.weekday),
      sessionName: f.sessionName.trim() || undefined,
      startTime: f.startTime,
      endTime: f.endTime,
      mode: f.mode,
      slotMinutes: f.mode === 'slot' ? slot : editing ? null : undefined,
      maxTokens: max,
      walkinReserved: walk,
      isActive: f.isActive,
    };
    const ok = await run(
      () => (editing ? api(`/admin/schedules/${editing.id}`, { method: 'PATCH', body }) : api(`/admin/doctors/${doctor.id}/schedules`, { method: 'POST', body })),
      editing ? 'Session updated' : 'Session added',
    );
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-lg border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Weekday" htmlFor={`${id}-wd`}>
          <Select id={`${id}-wd`} value={f.weekday} onChange={set('weekday')}>
            {WEEKDAYS.map((w, i) => (
              <option key={w} value={i}>
                {w}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Session name" htmlFor={`${id}-name`} hint="e.g. Morning, Evening">
          <Input id={`${id}-name`} value={f.sessionName} onChange={set('sessionName')} maxLength={50} />
        </Field>
        <Field label="Start time" htmlFor={`${id}-st`}>
          <Input id={`${id}-st`} type="time" value={f.startTime} onChange={set('startTime')} required />
        </Field>
        <Field label="End time" htmlFor={`${id}-et`}>
          <Input id={`${id}-et`} type="time" value={f.endTime} onChange={set('endTime')} required />
        </Field>
        <Field label="Booking mode" htmlFor={`${id}-mode`}>
          <Select id={`${id}-mode`} value={f.mode} onChange={set('mode')}>
            <option value="token">Token (queue)</option>
            <option value="slot">Slot (fixed times)</option>
          </Select>
        </Field>
        {f.mode === 'slot' && (
          <Field label="Slot minutes" htmlFor={`${id}-sm`}>
            <Input id={`${id}-sm`} inputMode="numeric" value={f.slotMinutes} onChange={set('slotMinutes')} />
          </Field>
        )}
        <Field label="Max tokens" htmlFor={`${id}-mt`}>
          <Input id={`${id}-mt`} inputMode="numeric" value={f.maxTokens} onChange={set('maxTokens')} />
        </Field>
        <Field label="Walk-in reserved" htmlFor={`${id}-wr`} hint="Kept back for reception walk-ins.">
          <Input id={`${id}-wr`} inputMode="numeric" value={f.walkinReserved} onChange={set('walkinReserved')} />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5" checked={f.isActive} onChange={(e) => setF((s) => ({ ...s, isActive: e.target.checked }))} />
        Active (patients can book this session)
      </label>
      {(local || error) && <Alert tone="error">{local ?? error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>
          {editing ? 'Save session' : 'Add session'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ScheduleEditor({ doctor, onChanged }: { doctor: AdminDoctor; onChanged: () => void }) {
  const { toast } = useToast();
  // 'new' = add form open; schedule id = that one being edited
  const [formFor, setFormFor] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AdminSchedule | null>(null);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const byDay = (d: number) => doctor.schedules.filter((s) => s.weekday === d).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const done = () => {
    setFormFor(null);
    onChanged();
  };

  return (
    <div className="space-y-3">
      {order.map((d) => {
        const list = byDay(d);
        if (!list.length) return null;
        return (
          <div key={d}>
            <h4 className="mb-1 text-sm font-semibold">{WEEKDAYS[d]}</h4>
            <ul className="space-y-2">
              {list.map((s) =>
                formFor === s.id ? (
                  <li key={s.id}>
                    <SessionForm doctor={doctor} editing={s} initial={fromSchedule(s)} onDone={done} onCancel={() => setFormFor(null)} />
                  </li>
                ) : (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{s.sessionName}</span> · {hhmm(s.startTime)}–{hhmm(s.endTime)}
                      <div className="text-xs text-muted">
                        {s.mode === 'slot' ? `Slots of ${s.slotMinutes} min` : 'Token queue'} · {s.maxTokens} max · {s.walkinReserved} walk-in
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!s.isActive && <Badge tone="gray">Inactive</Badge>}
                      <Button size="sm" variant="secondary" onClick={() => setFormFor(s.id)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setToDelete(s)}>
                        Delete
                      </Button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </div>
        );
      })}
      {doctor.schedules.length === 0 && formFor !== 'new' && <p className="text-sm text-muted">No sessions yet. Patients cannot book this doctor until you add one.</p>}
      {formFor === 'new' ? (
        <SessionForm doctor={doctor} initial={blank()} onDone={done} onCancel={() => setFormFor(null)} />
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setFormFor('new')}>
          Add session
        </Button>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete session?"
        message={toDelete ? `${WEEKDAYS[toDelete.weekday]} ${toDelete.sessionName} (${hhmm(toDelete.startTime)}–${hhmm(toDelete.endTime)}). If it already has bookings it will be deactivated instead of deleted.` : ''}
        confirmLabel="Delete"
        danger
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const r = await api<{ deleted: boolean }>(`/admin/schedules/${toDelete.id}`, { method: 'DELETE' });
          if (r.deleted) toast('success', 'Session deleted');
          else toast('info', 'This session has bookings, so it was deactivated instead of deleted.');
          onChanged();
        }}
      />
    </div>
  );
}
