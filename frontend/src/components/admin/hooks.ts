'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { Paged } from '@/lib/types';

interface Result<T> {
  key: string;
  data?: T;
  error?: string;
}

/**
 * GET helper. Keeps the previous data on screen while a new request is in flight, so
 * reloading after an edit does not unmount forms. Pass `null` to skip fetching.
 */
export function useFetch<T>(path: string | null) {
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<Result<T> | null>(null);
  const key = path === null ? null : `${tick}:${path}`;

  useEffect(() => {
    if (path === null || key === null) return;
    let alive = true;
    api<T>(path)
      .then((data) => alive && setRes({ key, data }))
      .catch((e) => alive && setRes({ key, error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [path, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const settled = key !== null && res?.key === key;
  return {
    data: res?.data,
    error: settled ? res?.error : undefined,
    /** true while the first (or a replacing) request is in flight */
    loading: key !== null && !settled,
    reload,
  };
}

/** Paginated GET helper over `{items,total,page,limit,pages}` endpoints. */
export function usePaged<T>(basePath: string, params: Record<string, string | undefined> = {}, limit = 20) {
  const [page, setPage] = useState(1);
  const [lastParams, setLastParams] = useState(JSON.stringify(params));
  const sp = JSON.stringify(params);
  // Reset to page 1 whenever the filters change (state adjusted during render, per React docs).
  if (sp !== lastParams) {
    setLastParams(sp);
    setPage(1);
  }
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('limit', String(limit));
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const r = useFetch<Paged<T>>(`${basePath}?${qs.toString()}`);
  return { ...r, page, setPage };
}

/** Debounced copy of a value. */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
