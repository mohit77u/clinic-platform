'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { ConfirmDialog, useAction } from './common';
import { thumbOf } from './format';
import type { AdminClinicDetail, AdminImage } from './types';

const MAX_IMAGES = 12;
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface UploadItem {
  key: string;
  name: string;
  state: 'waiting' | 'uploading' | 'done' | 'error';
  message?: string;
}

export function ImagesTab({ clinic, onChanged }: { clinic: AdminClinicDetail; onChanged: () => void }) {
  const images = [...clinic.images].sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id));
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<AdminImage | null>(null);
  const { run, busy } = useAction();

  const remaining = MAX_IMAGES - images.length;

  async function onFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const files = Array.from(list);
    const items: UploadItem[] = files.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, state: 'waiting' }));
    const patch = (key: string, p: Partial<UploadItem>) => setUploads((cur) => cur.map((u) => (u.key === key ? { ...u, ...p } : u)));
    setUploads(items);
    setUploading(true);
    let slots = remaining;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const key = items[i].key;
      if (!TYPES.includes(f.type)) {
        patch(key, { state: 'error', message: 'Only JPEG, PNG or WebP images are allowed' });
        continue;
      }
      if (f.size > MAX_BYTES) {
        patch(key, { state: 'error', message: 'Larger than 8 MB' });
        continue;
      }
      if (slots <= 0) {
        patch(key, { state: 'error', message: `A clinic can have at most ${MAX_IMAGES} images` });
        continue;
      }
      patch(key, { state: 'uploading' });
      try {
        const form = new FormData();
        form.append('file', f);
        await api(`/admin/clinics/${clinic.id}/images`, { method: 'POST', form });
        slots--;
        patch(key, { state: 'done' });
      } catch (e) {
        patch(key, { state: 'error', message: errorMessage(e) });
      }
    }
    setUploading(false);
    onChanged();
  }

  const move = (idx: number, dir: -1 | 1) => {
    const ids = images.map((i) => i.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    return run(async () => {
      await api(`/admin/clinics/${clinic.id}/images/order`, { method: 'PUT', body: { ids } });
      onChanged();
    }, 'Order saved');
  };

  const cover = (img: AdminImage) =>
    run(async () => {
      await api(`/admin/clinics/${clinic.id}/images/${img.id}/cover`, { method: 'POST' });
      onChanged();
    }, 'Cover image updated');

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <Field label={`Add images (${images.length}/${MAX_IMAGES} used)`} htmlFor="img-files" hint="JPEG, PNG or WebP, up to 8 MB each. You can pick several at once.">
          <Input id="img-files" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || remaining <= 0} onChange={(e) => {
              const el = e.target;
              void onFiles(el.files); // copies the FileList synchronously before the input is reset
              el.value = '';
            }} />
        </Field>
        {remaining <= 0 && <Alert tone="info">This clinic has reached the {MAX_IMAGES} image limit. Delete one to add another.</Alert>}
        {uploads.length > 0 && (
          <ul className="space-y-1 text-sm" aria-live="polite">
            {uploads.map((u) => (
              <li key={u.key} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-all">{u.name}</span>
                <Badge tone={u.state === 'done' ? 'green' : u.state === 'error' ? 'red' : u.state === 'uploading' ? 'blue' : 'gray'}>
                  {u.state === 'uploading' ? 'Uploading...' : u.state === 'done' ? 'Uploaded' : u.state === 'error' ? 'Failed' : 'Waiting'}
                </Badge>
                {u.message && <span className="text-red-600">{u.message}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {images.length === 0 ? (
        <Empty>No images yet. The first image you upload becomes the cover.</Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {images.map((img, idx) => {
            const isCover = clinic.coverUrl === img.imageUrl;
            return (
              <li key={img.id}>
                <Card className="space-y-2 p-2">
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbOf(img.imageUrl)} alt={img.caption || `Clinic image ${idx + 1}`} loading="lazy" className="aspect-[4/3] w-full rounded-lg bg-slate-200 object-cover dark:bg-white/10" />
                    {isCover && <Badge tone="brand" className="absolute left-2 top-2">Cover</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="secondary" disabled={busy || idx === 0} onClick={() => move(idx, -1)} aria-label={`Move image ${idx + 1} left`}>
                      ←
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy || idx === images.length - 1} onClick={() => move(idx, 1)} aria-label={`Move image ${idx + 1} right`}>
                      →
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy || isCover} onClick={() => cover(img)}>
                      Set as cover
                    </Button>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => setToDelete(img)}>
                      Delete
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete image?"
        message="This image will be removed from the clinic page permanently."
        confirmLabel="Delete"
        danger
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          await api(`/admin/clinics/${clinic.id}/images/${toDelete.id}`, { method: 'DELETE' });
          onChanged();
        }}
      />
    </div>
  );
}
