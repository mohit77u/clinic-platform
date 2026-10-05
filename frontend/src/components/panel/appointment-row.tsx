'use client';

import { Badge, Button, Card, cx, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import type { MessageKey } from '@/i18n/messages';
import { fmt12, telHref } from '@/lib/format';
import type { AppointmentStatus, PanelAppointment } from '@/lib/types';

const TONES: Record<AppointmentStatus, Tone> = {
  booked: 'blue', checked_in: 'brand', in_consultation: 'green', completed: 'gray',
  cancelled_by_patient: 'red', cancelled_by_clinic: 'red', no_show: 'amber', skipped: 'amber',
};

export type RowAction = 'check-in' | 'call' | 'skip' | 'complete' | 'no-show' | 'cancel';

export function AppointmentRow({ a, busy, onAction }: { a: PanelAppointment; busy: boolean; onAction: (a: PanelAppointment, action: RowAction) => void }) {
  const { t } = useT();
  const btn = (action: RowAction, label: MessageKey, variant: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' = 'secondary') => (
    <Button key={action} size="sm" variant={variant} disabled={busy} onClick={() => onAction(a, action)} className="min-w-20 flex-1 sm:flex-none">
      {t(label)}
    </Button>
  );

  const actions: React.ReactNode[] = [];
  switch (a.status) {
    case 'booked':
      actions.push(btn('check-in', 'panel.action.checkIn', 'primary'), btn('call', 'panel.action.call'), btn('no-show', 'panel.action.noShow', 'ghost'), btn('cancel', 'panel.action.cancel', 'ghost'));
      break;
    case 'checked_in':
      actions.push(btn('call', 'panel.action.call', 'primary'), btn('skip', 'panel.action.skip'), btn('cancel', 'panel.action.cancel', 'ghost'));
      break;
    case 'in_consultation':
      actions.push(btn('complete', 'panel.action.complete', 'success'), btn('skip', 'panel.action.skip'));
      break;
    case 'skipped':
      actions.push(btn('call', 'panel.action.recall', 'primary'), btn('no-show', 'panel.action.noShow', 'ghost'), btn('cancel', 'panel.action.cancel', 'ghost'));
      break;
  }

  const mobile10 = a.patientMobile?.slice(-10);
  return (
    <Card className={cx('flex gap-3 p-3', a.status === 'in_consultation' && 'border-emerald-500 ring-2 ring-emerald-500/30', ['completed', 'cancelled_by_patient', 'cancelled_by_clinic', 'no_show'].includes(a.status) && 'opacity-60')}>
      <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-50 text-3xl font-extrabold tabular-nums text-brand-700 dark:bg-brand-500/15 dark:text-brand-100" aria-label={`Token ${a.tokenNo}`}>
        {a.tokenNo}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-semibold">{a.patientName}</p>
          {(a.patientAge || a.patientGender) && <span className="text-sm text-muted">{[a.patientAge && `${a.patientAge}y`, a.patientGender].filter(Boolean).join(' · ')}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge tone={TONES[a.status]}>{t(`status.${a.status}` as MessageKey)}</Badge>
          <Badge tone={a.source === 'walkin' ? 'amber' : 'gray'}>{a.source === 'walkin' ? t('panel.walkinTag') : t('panel.online')}</Badge>
          {a.slotTime && <span className="text-muted">~{fmt12(a.slotTime.slice(0, 5))}</span>}
          {mobile10 && <a className="text-brand-700 underline dark:text-brand-100" href={telHref(mobile10)}>📞 {mobile10}</a>}
        </div>
        {actions.length > 0 && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </Card>
  );
}
