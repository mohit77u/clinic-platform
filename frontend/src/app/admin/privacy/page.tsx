'use client';

import { useState } from 'react';
import { ConfirmDialog, ErrorState, ListSkeleton, PageHeader } from '@/components/admin/common';
import { dt } from '@/components/admin/format';
import { useFetch } from '@/components/admin/hooks';
import type { PrivacyRequest } from '@/components/admin/types';
import { Alert, Button, Card, Empty, Field, Input } from '@/components/ui';
import { useToast } from '@/components/toast';
import { api } from '@/lib/api';

export default function PrivacyPage() {
  const { toast } = useToast();
  const { data, error, reload } = useFetch<PrivacyRequest[]>('/admin/privacy-requests');
  const [target, setTarget] = useState<PrivacyRequest | null>(null);
  const [typed, setTyped] = useState('');

  return (
    <>
      <PageHeader title="Privacy requests" subtitle="Patients who asked for their personal data to be deleted." />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : data.length === 0 ? (
        <Empty>No pending deletion requests.</Empty>
      ) : (
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{r.name || 'Unnamed patient'}</p>
                  <p className="text-sm text-muted">
                    {r.mobile} · requested {dt(r.requestedAt)}
                  </p>
                  {r.reason && <p className="mt-1 break-words text-sm">Reason: {r.reason}</p>}
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setTyped('');
                    setTarget(r);
                  }}
                >
                  Anonymize...
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!target}
        title="Anonymize this patient?"
        danger
        confirmLabel="Anonymize permanently"
        disabled={typed.trim().toUpperCase() !== 'ANONYMIZE'}
        onClose={() => setTarget(null)}
        message={
          <Alert tone="error">
            This permanently removes {target?.name || 'the patient'}&apos;s ({target?.mobile}) name, mobile and message history and disables the account. It cannot be undone. Upcoming bookings must be cancelled first.
          </Alert>
        }
        onConfirm={async () => {
          if (!target) return;
          await api(`/admin/users/${target.userId}/anonymize`, { method: 'POST' });
          toast('success', 'Patient anonymized');
          reload();
        }}
      >
        <Field label="Type ANONYMIZE to confirm" htmlFor="anon-confirm">
          <Input id="anon-confirm" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </>
  );
}
