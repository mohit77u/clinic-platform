'use client';

import { useState } from 'react';
import { Alert, Button, Card, Empty, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { ConfirmDialog, ErrorState, ListSkeleton } from './common';
import { WEEKDAYS, hhmm, plainDate, todayIST } from './format';
import { useFetch } from './hooks';
import type { AdminClinicDetail, AdminDoctor, DoctorLeave } from './types';
import { useToast } from '@/components/toast';

const weekdayOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

export function LeaveTab({ clinic, doctors }: { clinic: AdminClinicDetail; doctors: AdminDoctor[] }) {
  const { toast } = useToast();
  const [doctorId, setDoctorId] = useState('');
  const selected = doctors.find((d) => d.id === doctorId) ?? doctors[0];
  const did = selected?.id;
  const leaves = useFetch<DoctorLeave[]>(did ? `/clinic-panel/${clinic.id}/doctors/${did}/leaves` : null);

  const [date, setDate] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<DoctorLeave | null>(null);

  if (doctors.length === 0 || !selected) return <Empty>Add a doctor first, then you can mark leaves here.</Empty>;

  const sessions = date ? selected.schedules.filter((s) => s.weekday === weekdayOf(date) && s.isActive) : [];

  function review(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setFormError('Choose a date');
    if (date < todayIST()) return setFormError('Cannot add a leave in the past');
    setConfirmAdd(true);
  }

  return (
    <div className="space-y-4">
      <Field label="Doctor" htmlFor="leave-doc">
        <Select
          id="leave-doc"
          value={selected.id}
          onChange={(e) => {
            setDoctorId(e.target.value);
            setScheduleId('');
            setLastResult(null);
          }}
        >
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.isActive ? '' : ' (inactive)'}
            </option>
          ))}
        </Select>
      </Field>

      <Card>
        <form onSubmit={review} noValidate className="space-y-3">
          <h3 className="font-semibold">Add leave</h3>
          <Alert tone="warning">Adding a leave cancels every existing booking for that day (or session) and notifies the patients. This cannot be undone.</Alert>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date" htmlFor="leave-date">
              <Input
                id="leave-date"
                type="date"
                min={todayIST()}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setScheduleId('');
                }}
              />
            </Field>
            <Field label="Applies to" htmlFor="leave-sched" hint={date && sessions.length === 0 ? `No active session on ${WEEKDAYS[weekdayOf(date)]}.` : undefined}>
              <Select id="leave-sched" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
                <option value="">Whole day (all sessions)</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sessionName} ({hhmm(s.startTime)}–{hhmm(s.endTime)})
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Reason (optional)" htmlFor="leave-reason">
                <Input id="leave-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </div>
          </div>
          {formError && <Alert tone="error">{formError}</Alert>}
          <Button type="submit">Add leave...</Button>
        </form>
      </Card>

      {lastResult && <Alert tone="success">{lastResult}</Alert>}

      <section aria-labelledby="leave-up">
        <h3 id="leave-up" className="mb-2 font-semibold">Upcoming leaves</h3>
        {leaves.error ? (
          <ErrorState message={leaves.error} onRetry={leaves.reload} />
        ) : !leaves.data ? (
          <ListSkeleton rows={2} />
        ) : leaves.data.length === 0 ? (
          <Empty>No upcoming leaves for {selected.name}.</Empty>
        ) : (
          <ul className="space-y-2">
            {leaves.data.map((l) => {
              const sess = selected.schedules.find((s) => s.id === l.scheduleId);
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{plainDate(l.leaveDate)}</p>
                    <p className="text-xs text-muted">
                      {l.scheduleId ? (sess ? `${sess.sessionName} only` : 'One session') : 'Whole day'}
                      {l.reason ? ` · ${l.reason}` : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setToRemove(l)}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmAdd}
        title="Add leave and cancel bookings?"
        message={`${selected.name} will be on leave on ${date ? plainDate(date) : ''}${scheduleId ? ' for the selected session' : ' for the whole day'}. Existing bookings will be cancelled and patients notified.`}
        confirmLabel="Add leave"
        danger
        onClose={() => setConfirmAdd(false)}
        onConfirm={async () => {
          const r = await api<{ ok: boolean; cancelledBookings: number }>(`/clinic-panel/${clinic.id}/doctors/${selected.id}/leaves`, {
            method: 'POST',
            body: { date, scheduleId: scheduleId || undefined, reason: reason.trim() || undefined },
          });
          const msg = `Leave added. ${r.cancelledBookings} booking${r.cancelledBookings === 1 ? '' : 's'} cancelled.`;
          setLastResult(msg);
          toast('success', msg);
          setDate('');
          setScheduleId('');
          setReason('');
          leaves.reload();
        }}
      />
      <ConfirmDialog
        open={!!toRemove}
        title="Remove leave?"
        message={toRemove ? `Remove the leave on ${plainDate(toRemove.leaveDate)}? Bookings already cancelled stay cancelled.` : ''}
        confirmLabel="Remove"
        onClose={() => setToRemove(null)}
        onConfirm={async () => {
          if (!toRemove) return;
          await api(`/clinic-panel/${clinic.id}/doctors/${selected.id}/leaves/${toRemove.id}`, { method: 'DELETE' });
          toast('success', 'Leave removed');
          leaves.reload();
        }}
      />
    </div>
  );
}
