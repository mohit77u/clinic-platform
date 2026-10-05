'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cx } from './ui';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

const Ctx = createContext<{ toast: (tone: ToastTone, text: string) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((tone: ToastTone, text: string) => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur.slice(-3), { id, tone, text }]);
    setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), 4500);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div
            key={i.id}
            className={cx(
              'pointer-events-auto max-w-md rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg',
              i.tone === 'success' && 'bg-emerald-700',
              i.tone === 'error' && 'bg-red-700',
              i.tone === 'info' && 'bg-slate-800',
            )}
          >
            {i.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}
