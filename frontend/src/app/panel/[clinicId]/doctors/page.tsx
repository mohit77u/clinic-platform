'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { addDays, todayIST } from '@/components/panel/hooks';
import { useToast } from '@/components/toast';
import { Alert, Button, Card, Empty, Field, Input, Select, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { fmt12, fmtDay } from '@/lib/format';

interface PanelDoctor {
  id: string;
  name: string;
  specialization?: { name: string };
  schedules: { id: string; weekday: number; sessionName: string; startTime: string; endTime: string; isActive: boolean }[];
}
interface Leave {
  id: string;
  leaveDate: string;
  scheduleId: string | null;
  reason: string | null;
}

export default function DoctorsPage() {
  const { t } = useT();
  const { clinicId } = useParams<{ clinicId: string }>();
  const [doctors, setDoctors] = useState<PanelDoctor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PanelDoctor[]>(`/clinic-panel/${clinicId}/doctors`).then(setDoctors).catch((e) => setError(errorMessage(e)));
  }, [clinicId]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!doctors) return <Skeleton className="h-40" />;
  if (!doctors.length) return <Empty>{t('common.noData')}</Empty>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('panel.doctors.leaves')}</h1>
      {doctors.map((d) => (
        <DoctorLeaves key={d.id} doctor={d} clinicId={clinicId} />
      ))}
    </div>
  );
}

function DoctorLeaves({ doctor, clinicId }: { doctor: PanelDoctor; clinicId: string }) {
  const { t, locale } = useT();
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<Leave[] | null>(null);
  const [date, setDate] = useState(addDays(todayIST(), 1));
  const [scheduleId, setScheduleId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/clinic-panel/${clinicId}/doctors/${doctor.id}/leaves`;

  const load = useCallback(() => api<Leave[]>(base).then(setLeaves).catch((e) => toast('error', errorMessage(e))), [base, toast]);
  useEffect(() => { void load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm(t('panel.doctors.leaveWarn'))) return;
    setBusy(true);
    try {
      const r = await api<{ cancelledBookings: number }>(base, { method: 'POST', body: { date, ...(scheduleId ? { scheduleId } : {}), ...(reason ? { reason } : {}) } });
      toast('success', t('panel.doctors.cancelled', { n: r.cancelledBookings }));
      setReason('');
      await load();
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`${base}/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast('error', errorMessage(err));
    }
  }

  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const sessionsThatDay = doctor.schedules.filter((s) => s.isActive && s.weekday === weekday);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{doctor.name}</h2>
        {doctor.specialization && <p className="text-sm text-muted">{doctor.specialization.name}</p>}
      </div>
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={add}>
        <Field label={t('panel.doctors.leaveDate')} htmlFor={`d${doctor.id}`}>
          <Input id={`d${doctor.id}`} type="date" required min={todayIST()} value={date} onChange={(e) => { setDate(e.target.value); setScheduleId(''); }} />
        </Field>
        <Field label={locale === 'hi' ? 'सेशन' : 'Session'} htmlFor={`s${doctor.id}`}>
          <Select id={`s${doctor.id}`} value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
            <option value="">{t('panel.doctors.wholeDay')}</option>
            {sessionsThatDay.map((s) => (
              <option key={s.id} value={s.id}>{s.sessionName} {fmt12(s.startTime.slice(0, 5))}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('panel.doctors.leaveReason')} htmlFor={`r${doctor.id}`}>
          <Input id={`r${doctor.id}`} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex items-end"><Button type="submit" variant="secondary" loading={busy} className="w-full">{t('panel.doctors.addLeave')}</Button></div>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t('panel.doctors.upcoming')}</h3>
        {leaves === null ? <Skeleton className="h-10" /> : leaves.length === 0 ? <p className="text-sm text-muted">{t('common.noData')}</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {leaves.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm">
                  {fmtDay(l.leaveDate, locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  <span className="text-muted"> · {l.scheduleId ? doctor.schedules.find((s) => s.id === l.scheduleId)?.sessionName ?? '' : t('panel.doctors.wholeDay')}{l.reason ? ` · ${l.reason}` : ''}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => void remove(l.id)}>{t('panel.doctors.remove')}</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
