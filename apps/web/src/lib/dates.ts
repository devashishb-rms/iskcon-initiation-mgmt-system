import type { Locale } from '@iskcon/contracts';

/** BCP-47 tags used for Intl. Indian English/Bengali/Hindi conventions (day-month-year). */
export const LOCALE_TAG: Record<Locale, string> = { en: 'en-IN', bn: 'bn-IN', hi: 'hi-IN' };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isIsoDate = (v: unknown): boolean => typeof v === 'string' && ISO_DATE.test(v);

/**
 * Formats a calendar date (`YYYY-MM-DD`). The date is built at UTC midnight and formatted in UTC, so
 * no time-zone conversion can move it to the previous or next day.
 */
export function formatCalendarDate(iso: string, locale: Locale, style: 'short' | 'long' = 'short'): string {
  const m = ISO_DATE.exec(iso);
  if (!m) return iso;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Formats an instant (ISO date-time with offset) in the temple's time zone. */
export function formatInstant(iso: string, locale: Locale, timeZone: string, withTime = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone,
  }).format(d);
}

/** Whole days between two calendar dates (b - a). Pure calendar arithmetic in UTC. */
export function daysBetween(a: string, b: string): number {
  const pa = ISO_DATE.exec(a);
  const pb = ISO_DATE.exec(b);
  if (!pa || !pb) return 0;
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.round((tb - ta) / 86_400_000);
}

/** Today's calendar date in a time zone, as `YYYY-MM-DD` (used only to cap date pickers). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
