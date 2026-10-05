import { API_URL } from './config';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function messageOf(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const m = body?.message;
    if (Array.isArray(m)) return m.join('. ');
    if (typeof m === 'string') return m;
  } catch {
    /* not JSON */
  }
  return res.statusText || `Request failed (${res.status})`;
}

let refreshing: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

/** Browser-side API call: sends the session cookies, silently refreshes an expired session once. */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const run = () =>
    fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
    });

  let res: Response;
  try {
    res = await run();
    if (res.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) res = await run();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'Network problem. Check your connection and try again.');
  }
  if (!res.ok) throw new ApiError(res.status, await messageOf(res));
  if (res.status === 204) return undefined as T;
  return (res.headers.get('content-type')?.includes('json') ? res.json() : res.blob()) as Promise<T>;
}

/** Server-component fetch for public data. Returns null on 404 so pages can call notFound(). */
export async function serverGet<T>(path: string, revalidate = 30): Promise<T | null> {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, await messageOf(res));
  return res.json() as Promise<T>;
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong');
