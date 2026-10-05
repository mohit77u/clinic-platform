import type { Locale, MessageKey } from '@/i18n/messages';
import type { PublicSchedule } from './types';

/** "09:30" -> "9:30 AM" */
export function fmt12(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`;
}

export const intlLocale = (l: Locale) => (l === 'hi' ? 'hi-IN' : 'en-IN');

/** "2026-10-05" -> "Mon, 5 Oct" in the user's language (date is an IST calendar date, no timezone shifting). */
export function fmtDay(date: string, locale: Locale, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(intlLocale(locale), { ...opts, timeZone: 'UTC' });
}

export const rupees = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export interface TimingRow {
  days: number[];
  start: string;
  end: string;
  name: string;
}

/** Collapses "Mon..Sat 9-1" into one row instead of six. Weekdays shown Monday-first. */
export function groupTimings(schedules: PublicSchedule[]): TimingRow[] {
  const map = new Map<string, TimingRow>();
  for (const s of schedules) {
    const key = `${s.startTime}-${s.endTime}-${s.sessionName}`;
    const row = map.get(key) ?? { days: [], start: s.startTime, end: s.endTime, name: s.sessionName };
    row.days.push(s.weekday);
    map.set(key, row);
  }
  const order = (d: number) => (d + 6) % 7;
  return [...map.values()]
    .map((r) => ({ ...r, days: [...new Set(r.days)].sort((a, b) => order(a) - order(b)) }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** [1,2,3,4,5,6] -> "Mon–Sat"; [1,3,5] -> "Mon, Wed, Fri" */
export function formatDays(days: number[], t: (k: MessageKey) => string): string {
  const name = (d: number) => t(`dayShort.${d}` as MessageKey);
  const ord = days.map((d) => (d + 6) % 7);
  const consecutive = ord.length > 2 && ord.every((v, i) => i === 0 || v === ord[i - 1] + 1);
  if (consecutive) return `${name(days[0])}–${name(days[days.length - 1])}`;
  return days.map(name).join(', ');
}

export const telHref = (phone: string) => `tel:${phone.startsWith('+') ? phone : `+91${phone.replace(/^0/, '')}`}`;
export const waHref = (phone: string, text?: string) =>
  `https://wa.me/91${phone.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** 90 -> "1 hr 30 min" / "1 घंटा 30 मिनट" */
export function fmtLead(totalMinutes: number, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return [h ? t('common.hourShort', { n: h }) : '', m ? t('common.minShort', { n: m }) : ''].filter(Boolean).join(' ');
}
