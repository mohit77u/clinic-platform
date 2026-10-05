'use client';

import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import { AppointmentRow, type RowAction } from '@/components/panel/appointment-row';
import { addDays, todayIST, usePolling } from '@/components/panel/hooks';
import { useToast } from '@/components/toast';
import { Alert, Button, cx, Empty, Field, Input, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { fmt12, fmtDay } from '@/lib/format';
import type { AppointmentStatus, PanelAppointment, PanelSession } from '@/lib/types';

interface DayView {
  date: string;
  sessions: PanelSession[];
}

const FINISHED: AppointmentStatus[] = ['completed', 'cancelled_by_patient', 'cancelled_by_clinic', 'no_show'];
const ORDER: Record<AppointmentStatus, number> = { in_consultation: 0, checked_in: 1, booked: 2, skipped: 3, completed: 4, no_show: 5, cancelled_by_patient: 6, cancelled_by_clinic: 6 };

export default function QueuePage() {
  const { t, locale } = useT();
  const { toast } = useToast();
  const { clinicId } = useParams<{ clinicId: string }>();
  const today = todayIST();
  const [date, setDate] = useState(today);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [callingNext, setCallingNext] = useState(false);
  const [walkinOpen, setWalkinOpen] = useState(false);
  const [cancelFor, setCancelFor] = useState<PanelAppointment | null>(null);

  const { data, error, offline, updated, loading, reload } = usePolling<DayView>(`/clinic-panel/${clinicId}/queue?date=${date}`);

  const session = useMemo(() => data?.sessions.find((s) => s.scheduleId === sessionId) ?? data?.sessions[0] ?? null, [data, sessionId]);
  const rows = useMemo(() => {
    const list = [...(session?.appointments ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.tokenNo - b.tokenNo);
    return showFinished ? list : list.filter((a) => !FINISHED.includes(a.status));
  }, [session, showFinished]);
  const finishedCount = (session?.appointments ?? []).filter((a) => FINISHED.includes(a.status)).length;

  async function act(a: PanelAppointment, action: RowAction, body?: object) {
    if (action === 'cancel' && !body) return setCancelFor(a);
    setBusyId(a.id);
    try {
      await api(`/clinic-panel/${clinicId}/appointments/${a.id}/${action}`, { method: 'POST', body: body ?? {} });
      await reload();
    } catch (e) {
      toast('error', errorMessage(e));
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function callNext() {
    if (!session) return;
    setCallingNext(true);
    try {
      await api(`/clinic-panel/${clinicId}/sessions/call-next`, { method: 'POST', body: { scheduleId: session.scheduleId, date } });
      await reload();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setCallingNext(false);
    }
  }

  return (
    <div className="space-y-4 pb-28">
      {offline && <Alert tone="warning">{t('common.offline')}</Alert>}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>‹</Button>
          <label className="sr-only" htmlFor="qdate">{t('panel.date')}</label>
          <input id="qdate" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="rounded-lg border border-border bg-card px-2 py-1.5" />
          <Button variant="secondary" size="sm" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>›</Button>
        </div>
        {date !== today && <Button variant="ghost" size="sm" onClick={() => setDate(today)}>{t('common.today')}</Button>}
      </div>

      {loading && !data && <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}
      {error && !data && <Alert tone="error">{error} <button className="underline" onClick={() => void reload()}>{t('common.retry')}</button></Alert>}
      {data && data.sessions.length === 0 && <Empty>{t('panel.noSessions')}</Empty>}

      {data && data.sessions.length > 0 && session && (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Sessions">
            {data.sessions.map((s) => (
              <button
                key={s.scheduleId}
                role="tab"
                aria-selected={s.scheduleId === session.scheduleId}
                onClick={() => setSessionId(s.scheduleId)}
                className={cx('shrink-0 rounded-xl border px-3 py-2 text-left', s.scheduleId === session.scheduleId ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-card')}
              >
                <span className="block text-sm font-semibold">{s.doctorName}</span>
                <span className="block text-xs opacity-90">{s.sessionName} · {fmt12(s.startTime)}–{fmt12(s.endTime)}</span>
              </button>
            ))}
          </div>

          {session.onLeave && <Alert tone="warning">{t('panel.onLeave')}</Alert>}

          <div className="flex items-center justify-between rounded-2xl bg-brand-50 p-4 dark:bg-brand-500/10">
            <div>
              <p className="text-sm text-muted">{t('queue.nowServing')}</p>
              <p className="text-5xl font-extrabold tabular-nums text-brand-700 dark:text-brand-100">{session.nowServing > 0 ? session.nowServing : t('panel.nobody')}</p>
            </div>
            <div className="text-right text-sm text-muted">
              <p>{t('panel.tokens', { booked: session.booked, max: session.maxTokens })}</p>
              <p>{fmtDay(date, locale)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setWalkinOpen(true)} disabled={date !== today}>＋ {t('panel.walkin')}</Button>
            {finishedCount > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 accent-brand-600" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} />
                {t('status.completed')} / {t('status.cancelled_by_patient')} ({finishedCount})
              </label>
            )}
          </div>

          {rows.length === 0 ? <Empty>{t('panel.empty')}</Empty> : (
            <ul className="space-y-3">
              {rows.map((a) => (
                <li key={a.id}>
                  <AppointmentRow a={a} busy={busyId === a.id} onAction={(row, action) => void act(row, action)} />
                </li>
              ))}
            </ul>
          )}

          <p className="text-center text-xs text-muted">
            {t('panel.autoRefresh')}{updated ? ` · ${t('common.lastUpdated', { time: updated.toLocaleTimeString(locale === 'hi' ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}` : ''}
          </p>

          {/* thumb-reachable primary action */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-3 backdrop-blur">
            <div className="mx-auto max-w-5xl">
              <Button size="lg" className="w-full text-xl" loading={callingNext} disabled={date !== today || session.onLeave} onClick={() => void callNext()}>
                📣 {t('panel.callNext')}
              </Button>
            </div>
          </div>

          <WalkinModal
            open={walkinOpen}
            onClose={() => setWalkinOpen(false)}
            clinicId={clinicId}
            session={session}
            onDone={(n) => { toast('success', t('panel.walkin.done', { n })); setWalkinOpen(false); void reload(); }}
          />
          <CancelModal target={cancelFor} onClose={() => setCancelFor(null)} onConfirm={(reason) => { const a = cancelFor!; setCancelFor(null); void act(a, 'cancel', { reason: reason || undefined }); }} />
        </>
      )}
    </div>
  );
}

function WalkinModal({ open, onClose, clinicId, session, onDone }: { open: boolean; onClose: () => void; clinicId: string; session: PanelSession; onDone: (token: number) => void }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { scheduleId: session.scheduleId, name: name.trim() };
      if (age) body.age = Number(age);
      if (mobile.trim()) body.mobile = mobile.trim();
      const r = await api<{ tokenNo: number }>(`/clinic-panel/${clinicId}/walkins`, { method: 'POST', body });
      setName(''); setAge(''); setMobile('');
      onDone(r.tokenNo);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${t('panel.walkin')} — ${session.doctorName}`} closeLabel={t('common.close')}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label={t('panel.walkin.name')} htmlFor="wname"><Input id="wname" autoFocus required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('panel.walkin.age')} htmlFor="wage"><Input id="wage" inputMode="numeric" maxLength={3} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} /></Field>
          <div className="col-span-2"><Field label={t('panel.walkin.mobile')} htmlFor="wmobile"><Input id="wmobile" inputMode="numeric" maxLength={14} value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field></div>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t('panel.walkin.submit')}</Button>
      </form>
    </Modal>
  );
}

function CancelModal({ target, onClose, onConfirm }: { target: PanelAppointment | null; onClose: () => void; onConfirm: (reason: string) => void }) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  return (
    <Modal open={target !== null} onClose={onClose} title={`${t('panel.action.cancel')} #${target?.tokenNo ?? ''} — ${target?.patientName ?? ''}`} closeLabel={t('common.close')}>
      <div className="space-y-3">
        <Field label={t('panel.cancelReason')} htmlFor="creason"><Input id="creason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.no')}</Button>
          <Button variant="danger" onClick={() => { onConfirm(reason); setReason(''); }}>{t('panel.action.cancel')}</Button>
        </div>
      </div>
    </Modal>
  );
}
