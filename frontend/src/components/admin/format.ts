const TZ = 'Asia/Kolkata';

/** ₹ with Indian digit grouping (12,34,567.50). Accepts numeric strings from the API. */
export function inr(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '₹0';
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}

/** ISO timestamp -> "5/10/2026, 3:30:00 pm" in IST. */
export function dt(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('en-IN', { timeZone: TZ });
}

/** ISO timestamp -> date only, in IST. */
export function dOnly(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}

/** 'YYYY-MM-DD' calendar date (no timezone shift). */
export function plainDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('en-IN', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

export const hhmm = (t: string) => t.slice(0, 5);

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Base price + GST -> total. */
export function withGst(price: string | number, gstPercent: string | number): number {
  const p = Number(price);
  const g = Number(gstPercent);
  if (!Number.isFinite(p)) return 0;
  return Math.round(p * (1 + (Number.isFinite(g) ? g : 0) / 100) * 100) / 100;
}

export const thumbOf = (url: string) => url.replace(/\.webp$/, '-thumb.webp');

const MAP_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'google.com', 'www.google.com']);
/** Mirrors the backend's isAllowedMapUrl. */
export function isAllowedMapUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || !MAP_HOSTS.has(u.hostname)) return false;
  if (u.hostname === 'google.com' || u.hostname === 'www.google.com') return u.pathname.startsWith('/maps');
  if (u.hostname === 'goo.gl') return u.pathname.startsWith('/maps');
  return true;
}
