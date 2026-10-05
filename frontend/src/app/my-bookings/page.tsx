'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { Alert, Badge, Button, Card, cx, Empty, PageContainer, Skeleton, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmt12, fmtDay } from '@/lib/format';
import type { AppointmentStatus, MyBooking } from '@/lib/types';

const TONES: Record<AppointmentStatus, Tone> = {
  booked: 'blue', checked_in: 'brand', in_consultation: 'green', completed: 'gray',
  cancelled_by_patient: 'red', cancelled_by_clinic: 'red', no_show: 'amber', skipped: 'amber',
};

export default function MyBookingsPage() {
  const { t, locale } = useT();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [loaded, setLoaded] = useState<{ scope: 'upcoming' | 'past'; items: MyBooking[]; key: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<MyBooking | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);
  const items = loaded?.scope === scope && loaded.key === reloadKey ? loaded.items : null;

  useEffect(() => {
    if (!loading && !user) router.replace('/login?next=/my-bookings');
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.role !== 'patient') return;
    let alive = true;
    api<MyBooking[]>(`/bookings/mine?scope=${scope}`)
      .then((list) => {
        if (!alive) return;
        setLoaded({ scope, items: list, key: reloadKey });
        setError(null);
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [user, scope, reloadKey]);

  async function doCancel() {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await api(`/bookings/${cancelTarget.publicId}/cancel`, { method: 'POST' });
      toast('success', t('my.cancelled'));
      setCancelTarget(null);
      load();
    } catch (e) {
      toast('error', errorMessage(e));
      setCancelTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    try {
      const data = await api<unknown>('/me/data-export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'my-data.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast('error', errorMessage(e));
    }
  }

  async function requestDelete() {
    if (!window.confirm(t('my.deleteConfirm'))) return;
    try {
      await api('/me/delete-request', { method: 'POST', body: {} });
      toast('success', t('my.deleteRequested'));
    } catch (e) {
      toast('error', errorMessage(e));
    }
  }

  if (loading || !user) return <PageContainer narrow><Skeleton className="h-32" /></PageContainer>;
  if (user.role !== 'patient') return <PageContainer narrow><Alert tone="info">Patient accounts only.</Alert></PageContainer>;

  return (
    <PageContainer narrow className="space-y-4">
      <h1 className="text-2xl font-bold">{t('my.title')}</h1>
      <div className="flex gap-2" role="tablist">
        {(['upcoming', 'past'] as const).map((s) => (
          <button key={s} role="tab" aria-selected={scope === s} onClick={() => setScope(s)} className={cx('rounded-full border px-4 py-1.5 text-sm', scope === s ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-card')}>
            {t(`my.${s}` as MessageKey)}
          </button>
        ))}
      </div>

      {error && <Alert tone="error">{error} <button className="underline" onClick={load}>{t('common.retry')}</button></Alert>}
      {!error && items === null && <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}
      {items && items.length === 0 && <Empty>{t('my.none')}</Empty>}
      {items?.map((b) => (
        <Card key={b.publicId} className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{b.doctorName}</p>
              <p className="text-sm text-muted"><Link className="underline" href={`/clinics/${b.clinicSlug}`}>{b.clinicName}</Link></p>
            </div>
            <Badge tone={TONES[b.status]}>{t(`status.${b.status}` as MessageKey)}</Badge>
          </div>
          <p className="text-sm">{fmtDay(b.visitDate, locale)} · {b.sessionName} {fmt12(b.startTime)}–{fmt12(b.endTime)}</p>
          <p className="text-sm text-muted">{b.patientName} · {t('my.token', { n: b.tokenNo })}{b.slotTime ? ` · ~${fmt12(b.slotTime)}` : ''}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {['booked', 'checked_in', 'in_consultation'].includes(b.status) && (
              <Link href={`/q/${b.publicId}`} className="btn inline-flex items-center rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white">{t('my.viewQueue')}</Link>
            )}
            {b.status === 'booked' && scope === 'upcoming' && <Button size="sm" variant="secondary" onClick={() => setCancelTarget(b)}>{t('my.cancel')}</Button>}
            {b.mapUrl && <a href={b.mapUrl} target="_blank" rel="noopener noreferrer" className="btn inline-flex items-center px-2 text-sm underline">📍 {t('common.directions')}</a>}
          </div>
        </Card>
      ))}

      <section className="space-y-2 border-t border-border pt-4">
        <h2 className="font-semibold">{t('my.privacy')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void exportData()}>{t('my.export')}</Button>
          <Button variant="ghost" size="sm" onClick={() => void requestDelete()}>{t('my.deleteRequest')}</Button>
        </div>
      </section>

      <Modal open={cancelTarget !== null} onClose={() => setCancelTarget(null)} title={t('my.cancel')} closeLabel={t('common.close')}>
        <p>{t('my.cancelConfirm')}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCancelTarget(null)}>{t('common.no')}</Button>
          <Button variant="danger" loading={busy} onClick={() => void doCancel()}>{t('common.yes')}</Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
