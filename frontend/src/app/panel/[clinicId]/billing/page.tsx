'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { Alert, Badge, Button, Card, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDay, rupees } from '@/lib/format';
import type { SubscriptionStatus } from '@/lib/types';

interface Plan { id: number; name: string; durationMonths: number; price: string; gstPercent: number; gstAmount: string; total: string; perMonth: string }
interface Payment { id: string; amount: string; status: string; method: string; invoiceNo: string | null; paidAt: string | null; planName: string }
interface Overview { status: SubscriptionStatus; plans: Plan[]; payments: Payment[]; devMode: boolean }
interface Order { orderId: string; amountPaise: number; keyId: string; devMode: boolean }

declare global {
  interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } }
}

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function BillingPage() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const { toast } = useToast();
  const { clinicId } = useParams<{ clinicId: string }>();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payingPlan, setPayingPlan] = useState<number | null>(null);

  const load = useCallback(() => api<Overview>(`/clinic-panel/${clinicId}/billing`).then((d) => { setData(d); setError(null); }).catch((e) => setError(errorMessage(e))), [clinicId]);
  useEffect(() => { void load(); }, [load]);

  if (user?.role === 'clinic_staff') return <Alert tone="warning">{t('billing.ownerOnly')}</Alert>;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Skeleton className="h-60" />;

  async function pay(plan: Plan) {
    setPayingPlan(plan.id);
    try {
      const order = await api<Order>(`/clinic-panel/${clinicId}/billing/orders`, { method: 'POST', body: { planId: plan.id } });
      if (order.devMode) {
        await api(`/clinic-panel/${clinicId}/billing/orders/${order.orderId}/dev-pay`, { method: 'POST' });
        toast('success', t('billing.paid'));
        await load();
        return;
      }
      if (!(await loadRazorpay()) || !window.Razorpay) throw new Error('Could not load the payment window. Check your connection.');
      const rz = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: 'INR',
        name: 'Clinic Platform',
        description: `${plan.name} plan`,
        handler: async (r: { razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await api(`/clinic-panel/${clinicId}/billing/verify`, { method: 'POST', body: { orderId: order.orderId, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature } });
            toast('success', t('billing.paid'));
          } catch (e) {
            // The webhook still credits the plan; just refresh.
            toast('info', errorMessage(e));
          }
          await load();
        },
      });
      rz.open();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setPayingPlan(null);
    }
  }

  async function invoice(p: Payment) {
    try {
      const blob = await api<Blob>(`/clinic-panel/${clinicId}/billing/invoices/${p.id}`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(p.invoiceNo ?? 'invoice').replace(/\//g, '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast('error', errorMessage(e));
    }
  }

  const s = data.status;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('billing.title')}</h1>
      {data.devMode && <Alert tone="info">{t('billing.testMode')}</Alert>}

      <Card className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-muted">{t('billing.current')}</p>
          <p className="text-lg font-semibold capitalize">{s.state === 'none' ? t('panel.sub.none') : s.kind}</p>
        </div>
        {s.endsAt && <p className="text-sm">{t('billing.endsOn', { date: fmtDay(s.endsAt.slice(0, 10), locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}</p>}
      </Card>

      <section className="space-y-3" aria-labelledby="plans">
        <h2 id="plans" className="font-semibold">{t('billing.choose')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.plans.map((p) => (
            <Card key={p.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {p.durationMonths === 12 && <Badge tone="green">★</Badge>}
              </div>
              <p className="text-3xl font-bold">{rupees(p.price)}</p>
              <p className="text-sm text-muted">{t('billing.perMonth', { n: Number(p.perMonth).toLocaleString('en-IN') })} · {t('billing.gst', { n: Number(p.gstAmount).toLocaleString('en-IN') })}</p>
              <Button className="w-full" loading={payingPlan === p.id} disabled={payingPlan !== null} onClick={() => void pay(p)}>
                {data.devMode ? t('billing.testPay') : t('billing.pay', { n: Number(p.total).toLocaleString('en-IN') })}
              </Button>
              <p className="text-center text-xs text-muted">{t('billing.total', { n: Number(p.total).toLocaleString('en-IN') })}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="history">
        <h2 id="history" className="font-semibold">{t('billing.history')}</h2>
        {data.payments.length === 0 ? <p className="text-sm text-muted">{t('billing.none')}</p> : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium">{p.planName} · {rupees(p.amount)}</p>
                  <p className="text-xs text-muted">{p.invoiceNo ?? p.status}{p.paidAt ? ` · ${new Date(p.paidAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}` : ''}</p>
                </div>
                {p.invoiceNo && <Button size="sm" variant="secondary" onClick={() => void invoice(p)}>{t('billing.invoice')} PDF</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
