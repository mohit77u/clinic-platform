'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Field, Input, Select } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/components/toast';
import { ErrorState, ListSkeleton, useAction } from './common';
import { dt } from './format';
import { useFetch } from './hooks';
import type { AdminDocument } from './types';

const DOC_TYPES: Record<string, string> = {
  clinic_registration: 'Clinic registration',
  doctor_licence: 'Doctor licence',
  id_proof: 'ID proof',
};
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_BYTES = 8 * 1024 * 1024;

export function DocumentsTab({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const docs = useFetch<AdminDocument[]>(`/admin/clinics/${clinicId}/documents`);
  const [docType, setDocType] = useState('clinic_registration');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [local, setLocal] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const { run, busy, error } = useAction();

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setLocal(null);
    if (!file) return setLocal('Choose a file to upload');
    if (!FILE_TYPES.includes(file.type)) return setLocal('Only PDF, JPEG or PNG files are allowed');
    if (file.size > MAX_BYTES) return setLocal('File must be smaller than 8 MB');
    const form = new FormData();
    form.append('docType', docType);
    form.append('file', file);
    const ok = await run(() => api(`/admin/clinics/${clinicId}/documents`, { method: 'POST', form }), 'Document uploaded');
    if (ok) {
      setFile(null);
      setFileKey((k) => k + 1);
      docs.reload();
    }
  }

  async function toggle(d: AdminDocument) {
    setWorkingId(d.id);
    const ok = await run(() => api(`/admin/documents/${d.id}/verify`, { method: 'POST', body: { verified: !d.verified } }), d.verified ? 'Marked as not verified' : 'Marked as verified');
    setWorkingId(null);
    if (ok) docs.reload();
  }

  async function view(d: AdminDocument) {
    setWorkingId(d.id);
    // Open the tab synchronously (inside the click) so popup blockers allow it, then point it at the signed link.
    const w = window.open('about:blank', '_blank');
    try {
      const { url } = await api<{ url: string; expiresAt: string }>(`/admin/clinics/${clinicId}/documents/${d.id}/link`);
      if (w) {
        w.opener = null;
        w.location.href = url;
      } else {
        toast('info', 'Pop-up blocked. Allow pop-ups for this site and try again.');
      }
    } catch (e) {
      w?.close();
      toast('error', errorMessage(e));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Alert tone="info">Documents are private. &quot;View&quot; creates a signed link that works for 5 minutes.</Alert>
      {docs.error ? (
        <ErrorState message={docs.error} onRetry={docs.reload} />
      ) : !docs.data ? (
        <ListSkeleton rows={2} />
      ) : docs.data.length === 0 ? (
        <Empty>No documents uploaded yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {docs.data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{DOC_TYPES[d.docType] ?? d.docType}</p>
                <p className="text-xs text-muted">Uploaded {dt(d.uploadedAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={d.verified ? 'green' : 'amber'}>{d.verified ? 'Verified' : 'Not verified'}</Badge>
                <Button size="sm" variant="secondary" disabled={workingId === d.id} onClick={() => view(d)}>
                  View
                </Button>
                <Button size="sm" variant={d.verified ? 'secondary' : 'success'} loading={workingId === d.id && busy} disabled={workingId !== null && workingId !== d.id} onClick={() => toggle(d)}>
                  {d.verified ? 'Unverify' : 'Mark verified'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <form onSubmit={upload} noValidate className="space-y-3">
          <h3 className="font-semibold">Upload document</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Document type" htmlFor="doc-type">
              <Select id="doc-type" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {Object.entries(DOC_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="File" htmlFor="doc-file" hint="PDF, JPEG or PNG, up to 8 MB">
              <Input key={fileKey} id="doc-file" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          </div>
          {(local || error) && <Alert tone="error">{local ?? error}</Alert>}
          <Button type="submit" loading={busy && workingId === null}>
            Upload
          </Button>
        </form>
      </Card>
    </div>
  );
}
