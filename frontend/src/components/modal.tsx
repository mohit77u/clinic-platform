'use client';

import { useEffect, useRef } from 'react';
import { Button } from './ui';

/** Accessible dialog on the native <dialog> element (focus trap, Esc to close). */
export function Modal({ open, onClose, title, children, closeLabel = 'Close' }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; closeLabel?: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={closeLabel}>
            ✕
          </Button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}
