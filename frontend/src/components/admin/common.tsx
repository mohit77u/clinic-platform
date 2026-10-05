'use client';

import { useCallback, useState } from 'react';
import { Modal } from '@/components/modal';
import { useToast } from '@/components/toast';
import { Alert, Badge, Button, Skeleton, cx } from '@/components/ui';
import type { Tone } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import type { ClinicStatus } from './types';

const statusTone: Record<ClinicStatus, Tone> = { pending: 'amber', approved: 'green', rejected: 'red', suspended: 'gray' };
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status as ClinicStatus] ?? 'gray'}>{status}</Badge>;
}

/**
 * Runs an async action with a busy flag; errors become toasts (never unhandled rejections).
 * Resolves to true when the action succeeded.
 */
export function useAction() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (fn: () => Promise<unknown>, successText?: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        if (successText) toast('success', successText);
        return true;
      } catch (e) {
        setError(errorMessage(e));
        toast('error', errorMessage(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { run, busy, error };
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert tone="error" className="flex flex-wrap items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Alert>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function Pager({ page, pages, total, onPage, disabled }: { page: number; pages: number; total: number; onPage: (p: number) => void; disabled?: boolean }) {
  if (pages <= 1) return <p className="mt-3 text-sm text-muted">{total} total</p>;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">
        Page {page} of {pages} · {total} total
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/** Confirm modal. onConfirm errors are toasted and keep the dialog open. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  disabled,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  disabled?: boolean;
  onConfirm: () => Promise<unknown> | void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const { run, busy, error } = useAction();
  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={title}>
      <div className="space-y-4">
        <div className="text-sm">{message}</div>
        {children}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            disabled={disabled}
            onClick={async () => {
              if (await run(async () => onConfirm())) onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Responsive stat tile. */
export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cx('rounded-xl border border-border bg-card p-4', className)}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Horizontally scrollable wrapper so wide tables never scroll the whole page. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-border bg-card">{children}</div>;
}
export const th = 'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted';
export const td = 'px-3 py-2.5 align-top text-sm';
