'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { OtpLogin } from '@/components/otp-login';
import { Alert, Button, Card, cx, Field, Input, Select, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmt12, fmtDay, fmtLead, rupees } from '@/lib/format';
import type { Availability, BookingResult, PatientProfile, SessionAvailability } from '@/lib/types';

type Draft = { name: string; age: string; gender: '' | 'M' | 'F' | 'O' };
const NEW = 'new';

export function BookingFlow({ doctorSlug, doctorName }: { doctorSlug: string; doctorName: string }) {
  const { t, locale } = useT();
  const { user, loading: authLoading } = useAuth();

  const [av, setAv] = useState<Availability | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [session, setSession] = useState<SessionAvailability | null>(null);
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [profileId, setProfileId] = useState<string>(NEW);
  const [draft, setDraft] = useState<Draft>({ name: '', age: '', gender: '' });
  const [consent, setConsent] = useState(false);
  const [leadHours, setLeadHours] = useState<number | null>(null);
  const [leadMinutes, setLeadMinutes] = useState<number | null>(null);
  const [needOtp, setNeedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const loadAvailability = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    api<Availability>(`/doctors/${doctorSlug}/availability`)
      .then((data) => {
        if (!alive) return;
        setAv(data);
        setLoadError(null);
        setDate((cur) => cur ?? data.days.find((d) => d.sessions.some((s) => s.state === 'open'))?.date ?? data.days[0]?.date ?? null);
      })
      .catch((e) => alive && setLoadError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [doctorSlug, reloadKey]);

  useEffect(() => {
    if (user?.role !== 'patient') return;
    api<PatientProfile[]>('/patients')
      .then((p) => {
        setProfiles(p);
        if (p.length) setProfileId(p[0].id);
      })
      .catch(() => undefined);
  }, [user]);

  // The reminder lead defaults to the platform setting until the patient changes it.
  const lead = (leadHours ?? Math.floor((av?.defaultReminderMinutes ?? 30) / 60)) * 60 + (leadMinutes ?? (av?.defaultReminderMinutes ?? 30) % 60);
  const leadValid = lead >= 5 && lead <= 720;

  const day = useMemo(() => av?.days.find((d) => d.date === date) ?? null, [av, date]);

  const patientValid = profileId !== NEW || draft.name.trim().length >= 2;
  const canSubmit = Boolean(date && session?.state === 'open' && patientValid && consent && leadValid);

  async function submit() {
    if (!date || !session) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { scheduleId: session.scheduleId, date, consent: true, remindBeforeMinutes: lead };
      if (profileId !== NEW) body.patientId = profileId;
      else body.patient = { name: draft.name.trim(), ...(draft.age ? { age: Number(draft.age) } : {}), ...(draft.gender ? { gender: draft.gender } : {}) };
      setResult(await api<BookingResult>('/bookings', { method: 'POST', body }));
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) loadAvailability();
    } finally {
      setBusy(false);
    }
  }

  function onConfirm() {
    if (!user) return setNeedOtp(true);
    void submit();
  }

  if (result) return <Confirmation r={result} />;

  if (loadError) {
    return (
      <Alert tone="error">
        {loadError} <button className="underline" onClick={loadAvailability}>{t('common.retry')}</button>
      </Alert>
    );
  }
  if (!av) return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-32" /></div>;

  if (needOtp && !user) {
    return (
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">{t('book.loginFirst')}</h2>
        <OtpLogin purpose="booking" onDone={(u) => { setNeedOtp(false); if (u.role === 'patient') void submit(); }} />
        <Button variant="ghost" onClick={() => setNeedOtp(false)}>{t('common.back')}</Button>
      </Card>
    );
  }

  const label = (d: string, i: number) => (i === 0 ? t('common.today') : i === 1 ? t('common.tomorrow') : fmtDay(d, locale, { weekday: 'short' }));

  return (
    <div className="space-y-6">
      {/* 1. day */}
      <section aria-labelledby="s1" className="space-y-2">
        <h2 id="s1" className="font-semibold">{t('book.chooseDay')}</h2>
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {av.days.map((d, i) => {
            const hasOpen = d.sessions.some((s) => s.state === 'open');
            const active = d.date === date;
            return (
              <li key={d.date} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setDate(d.date); setSession(null); setError(null); }}
                  className={cx(
                    'min-w-20 rounded-xl border px-3 py-2 text-center transition-colors',
                    active ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-card hover:bg-brand-50 dark:hover:bg-white/5',
                    !hasOpen && !active && 'opacity-55',
                  )}
                >
                  <span className="block text-xs">{label(d.date, i)}</span>
                  <span className="block font-semibold">{fmtDay(d.date, locale, { day: 'numeric', month: 'short' })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 2. session */}
      <section aria-labelledby="s2" className="space-y-2">
        <h2 id="s2" className="font-semibold">{t('book.chooseSession')}</h2>
        {!day || day.sessions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-muted">{t('book.noSessions')}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {day.sessions.map((s) => {
              const open = s.state === 'open';
              const active = session?.scheduleId === s.scheduleId;
              return (
                <li key={s.scheduleId}>
                  <button
                    type="button"
                    disabled={!open}
                    aria-pressed={active}
                    onClick={() => { setSession(s); setError(null); }}
                    className={cx(
                      'w-full rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                      active ? 'border-brand-600 ring-2 ring-brand-500/40' : 'border-border bg-card hover:bg-brand-50 dark:hover:bg-white/5',
                    )}
                  >
                    <span className="block font-medium">{s.sessionName}</span>
                    <span className="block text-sm text-muted">{fmt12(s.startTime)} – {fmt12(s.endTime)}</span>
                    <span className={cx('mt-1 block text-sm font-medium', open ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
                      {open ? t('book.left', { n: s.onlineLeft }) : s.state === 'full' ? t('book.full') : `${t('book.closed')} · ${t(`book.reason.${s.closedReason ?? 'past'}` as MessageKey)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3. patient */}
      <section aria-labelledby="s3" className="space-y-3">
        <h2 id="s3" className="font-semibold">{t('book.patientDetails')}</h2>
        {user && user.role !== 'patient' ? (
          <Alert tone="warning">Staff and admin accounts cannot book tokens. Please log out and use a patient mobile number.</Alert>
        ) : (
          <>
            {profiles.length > 0 && (
              <Field label={t('book.useSaved')} htmlFor="profile">
                <Select id="profile" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.age ? ` (${p.age})` : ''}</option>
                  ))}
                  <option value={NEW}>+ {t('book.newProfile')}</option>
                </Select>
              </Field>
            )}
            {profileId === NEW && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <Field label={t('book.patientName')} htmlFor="pname">
                    <Input id="pname" autoComplete="name" maxLength={100} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </Field>
                </div>
                <Field label={t('book.age')} htmlFor="page">
                  <Input id="page" inputMode="numeric" maxLength={3} value={draft.age} onChange={(e) => setDraft({ ...draft, age: e.target.value.replace(/\D/g, '') })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t('book.gender')} htmlFor="pgender">
                    <Select id="pgender" value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value as Draft['gender'] })}>
                      <option value="">—</option>
                      <option value="M">{t('book.male')}</option>
                      <option value="F">{t('book.female')}</option>
                      <option value="O">{t('book.other')}</option>
                    </Select>
                  </Field>
                </div>
              </div>
            )}
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
              <h3 className="font-semibold">{t('book.reminder.title')}</h3>
              <p className="text-sm text-muted">{t('book.reminder.help')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('book.reminder.hours')} htmlFor="lead-h">
                  <Select id="lead-h" value={String(Math.floor(lead / 60))} onChange={(e) => setLeadHours(Number(e.target.value))}>
                    {Array.from({ length: 13 }, (_, h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('book.reminder.minutes')} htmlFor="lead-m">
                  <Select id="lead-m" value={String(lead % 60)} onChange={(e) => setLeadMinutes(Number(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <p className={cx('text-sm', leadValid ? 'text-brand-700 dark:text-brand-100' : 'text-red-600')} role={leadValid ? undefined : 'alert'}>
                {leadValid ? t('book.reminder.summary', { lead: fmtLead(lead, t) }) : t('book.reminder.invalid')}
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-600" />
              <span>
                {t('book.consent')} <Link href="/privacy" target="_blank" className="underline">{t('nav.privacy')}</Link>
              </span>
            </label>
          </>
        )}
        {av.consultationFee != null && <p className="text-sm text-muted">{t('book.fee', { fee: rupees(av.consultationFee).replace('₹', '') })}</p>}
        {error && <Alert tone="error">{error}</Alert>}
        <Button size="lg" className="w-full" loading={busy || authLoading} disabled={!canSubmit || (user != null && user.role !== 'patient')} onClick={onConfirm}>
          {t('book.confirm')}
        </Button>
        {!session && <p className="text-center text-sm text-muted">{t('book.chooseBoth')}</p>}
      </section>
      <span className="sr-only">{doctorName}</span>
    </div>
  );
}

function Confirmation({ r }: { r: BookingResult }) {
  const { t, locale } = useT();
  return (
    <Card className="space-y-4 text-center">
      <p className="text-4xl" aria-hidden>✅</p>
      <h2 className="text-xl font-bold">{t('book.success')}</h2>
      <div className="mx-auto w-fit rounded-2xl bg-brand-50 px-10 py-4 dark:bg-brand-500/10">
        <p className="text-sm text-muted">{t('book.yourToken')}</p>
        <p className="text-6xl font-extrabold text-brand-700 dark:text-brand-100">{r.tokenNo}</p>
      </div>
      <dl className="mx-auto grid max-w-sm grid-cols-2 gap-x-4 gap-y-1 text-left text-sm">
        <dt className="text-muted">{r.doctor.name}</dt><dd className="text-right">{r.clinic.name}</dd>
        <dt className="text-muted">{t('book.date')}</dt><dd className="text-right">{fmtDay(r.visitDate, locale)}</dd>
        <dt className="text-muted">{t('book.estTime')}</dt><dd className="text-right">{fmt12(r.estimatedTime)}</dd>
      </dl>
      <p className="text-sm text-muted">{t('book.saveLink')}</p>
      <p className="text-sm font-medium">{t('book.reminder.confirmed', { lead: fmtLead(r.remindBeforeMinutes, t) })}</p>
      <Link href={`/q/${r.publicId}`} className="btn inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-5 py-3.5 text-lg font-medium text-white hover:bg-brand-700">
        {t('book.trackQueue')}
      </Link>
    </Card>
  );
}
