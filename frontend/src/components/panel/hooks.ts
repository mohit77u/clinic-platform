'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

/** Today's calendar date in India (YYYY-MM-DD), regardless of the device's timezone. */
export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export function addDays(date: string, n: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

interface PollState<T> {
  path: string;
  data: T | null;
  error: string | null;
  updated: Date | null;
}

/**
 * Polls an endpoint while the tab is visible. Keeps the last good data when a refresh fails (clinics have flaky Wi-Fi)
 * and exposes `offline` so the screen can say so instead of going blank. `reload()` fetches immediately and resolves when done.
 */
export function usePolling<T>(path: string, intervalMs = 10_000) {
  const [state, setState] = useState<PollState<T> | null>(null);
  const runRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = 0;

    const run = async () => {
      clearTimeout(timer);
      const mine = ++inFlight;
      try {
        const data = await api<T>(path);
        if (!cancelled && mine === inFlight) setState({ path, data, error: null, updated: new Date() });
      } catch (e) {
        if (!cancelled && mine === inFlight) {
          const msg = e instanceof Error ? e.message : 'Error';
          setState((cur) => ({ path, data: cur?.path === path ? cur.data : null, error: msg, updated: cur?.path === path ? cur.updated : null }));
        }
      }
      if (!cancelled && mine === inFlight && !document.hidden) timer = setTimeout(() => void run(), intervalMs);
    };
    runRef.current = run;

    const onVisible = () => !document.hidden && void run();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    void run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [path, intervalMs]);

  const reload = useCallback(() => runRef.current(), []);
  // Data belongs to a path; while a new path loads we show the skeleton instead of the previous day's queue.
  const current = state?.path === path ? state : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    offline: Boolean(current?.error),
    updated: current?.updated ?? null,
    loading: current === null,
    reload,
  };
}
