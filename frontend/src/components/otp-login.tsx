'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Field, Input } from './ui';
import { useT } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/types';

const RESEND_SECONDS = 30;

/** Mobile -> OTP -> session. Used on /login and inline inside the booking flow. */
export function OtpLogin({ purpose = 'login', onDone }: { purpose?: 'login' | 'booking'; onDone?: (u: SessionUser) => void }) {
  const { t } = useT();
  const { setUser } = useAuth();
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const digits = mobile.replace(/\D/g, '').slice(-10);

  async function send() {
    if (!/^[6-9]\d{9}$/.test(digits)) return setError(t('login.invalidMobile'));
    setBusy(true);
    setError(null);
    try {
      await api('/auth/otp/send', { method: 'POST', body: { mobile: digits, purpose } });
      setStep('otp');
      setWait(RESEND_SECONDS);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!/^\d{6}$/.test(code)) return setError(t('login.invalidOtp'));
    setBusy(true);
    setError(null);
    try {
      const u = await api<SessionUser>('/auth/otp/verify', { method: 'POST', body: { mobile: digits, code, purpose } });
      setUser(u);
      onDone?.(u);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void (step === 'mobile' ? send() : verify());
      }}
    >
      {step === 'mobile' ? (
        <Field label={t('login.mobile')} htmlFor="mobile">
          <div className="flex gap-2">
            <span className="grid place-items-center rounded-lg border border-border bg-card px-3 text-muted">+91</span>
            <Input id="mobile" inputMode="numeric" autoComplete="tel-national" maxLength={14} value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="98765 43210" autoFocus />
          </div>
        </Field>
      ) : (
        <>
          <Alert tone="info">{t('login.sent', { mobile: `+91 ${digits}` })}</Alert>
          <Field label={t('login.otp')} htmlFor="otp">
            <Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center text-2xl tracking-[0.5em]" autoFocus />
          </Field>
        </>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} className="w-full" size="lg">
        {step === 'mobile' ? t('login.sendOtp') : t('login.verify')}
      </Button>
      {step === 'otp' && (
        <div className="flex justify-between text-sm">
          <button type="button" className="text-brand-700 underline dark:text-brand-100" onClick={() => { setStep('mobile'); setCode(''); setError(null); }}>
            {t('login.change')}
          </button>
          <button type="button" disabled={wait > 0 || busy} className="text-brand-700 underline disabled:text-muted disabled:no-underline dark:text-brand-100" onClick={() => void send()}>
            {t('login.resend')}{wait > 0 ? ` (${wait})` : ''}
          </button>
        </div>
      )}
    </form>
  );
}
