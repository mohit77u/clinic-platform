'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Card, cx, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import { api, ApiError } from '@/lib/api';
import { fmt12, fmtDay } from '@/lib/format';
import type { QueueView } from '@/lib/types';

const POLL_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;

/** Live token view. Polls while the tab is visible, keeps the last data when offline, backs off on errors. */
export function QueueLive({ publicId }: { publicId: string }) {
  const { t, locale } = useT();
  const [q, setQ] = useState<QueueView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let wasTurn = false;

    const run = async () => {
      clearTimeout(timer);
      try {
        const data = await api<QueueView>(`/queue/${publicId}`);
        if (cancelled) return;
        failures = 0;
        setOffline(false);
        setQ(data);
        setUpdated(new Date());
        if (data.yourTurn && !wasTurn) navigator.vibrate?.([200, 100, 200]);
        wasTurn = data.yourTurn;
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return setNotFound(true);
        failures += 1;
        setOffline(true);
      }
      const delay = Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** Math.min(failures, 3));
      if (!cancelled && !document.hidden) timer = setTimeout(() => void run(), delay);
    };

    const onVisible = () => !document.hidden && void run();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    void run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [publicId]);

  if (notFound) return <Alert tone="error">{t('queue.notFound')}</Alert>;
  if (!q) return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-24" /></div>;

  const terminal = q.cancelled || ['completed', 'no_show'].includes(q.status);
  const tone = q.yourTurn ? 'bg-emerald-600 text-white' : terminal ? 'bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-slate-100' : 'bg-brand-600 text-white';

  return (
    <div className="space-y-4">
      {offline && <Alert tone="warning">{t('common.offline')}</Alert>}

      <div className={cx('rounded-3xl p-6 text-center shadow-sm', tone)} aria-live="polite">
        <p className="text-sm opacity-90">{t('queue.yourToken')}</p>
        <p className="text-7xl font-extrabold leading-none tabular-nums">{q.tokenNo}</p>
        <p className="mt-3 text-base font-medium">{t(`queue.status.${q.status}` as MessageKey)}</p>
      </div>

      {!terminal && q.liveQueue && (
        <div className="grid grid-cols-3 gap-3 text-center">
          <Card className="p-3">
            <p className="text-xs text-muted">{t('queue.nowServing')}</p>
            <p className="text-3xl font-bold tabular-nums">{q.nowServing ? q.nowServing : '—'}</p>
            {!q.nowServing && <p className="text-[11px] text-muted">{t('queue.notStarted')}</p>}
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted">{t('queue.ahead')}</p>
            <p className="text-3xl font-bold tabular-nums">{q.patientsAhead}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted">{t('queue.eta')}</p>
            <p className="text-lg font-bold leading-9">{q.etaMinutes != null ? t('queue.etaMinutes', { n: q.etaMinutes }) : '—'}</p>
          </Card>
        </div>
      )}

      {!terminal && !q.liveQueue && q.estimatedTime && (
        <Card className="space-y-1 text-center">
          <p className="text-xs text-muted">{t('queue.approxTime')}</p>
          <p className="text-3xl font-bold tabular-nums">{fmt12(q.estimatedTime)}</p>
          <p className="text-sm text-muted">{t('queue.fixedNote')}</p>
        </Card>
      )}

      <Card className="space-y-1 text-sm">
        <p className="font-semibold">{q.clinic.name}</p>
        <p className="text-muted">{q.doctor.name}</p>
        <p className="text-muted">
          {fmtDay(q.visitDate, locale)} · {t('queue.session', { session: q.session.name, start: fmt12(q.session.startTime), end: fmt12(q.session.endTime) })}
        </p>
        {q.clinic.mapUrl && (
          <a href={q.clinic.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-block pt-1 text-brand-700 underline dark:text-brand-100">📍 {t('common.directions')}</a>
        )}
      </Card>

      <p className="text-center text-xs text-muted">
        {t('queue.refreshing')} {updated && t('common.lastUpdated', { time: updated.toLocaleTimeString(locale === 'hi' ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}
      </p>
      <p className="text-center"><Link href="/my-bookings" className="text-sm underline">{t('nav.myBookings')}</Link></p>
    </div>
  );
}
