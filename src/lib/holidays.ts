// =============================================================================
// Fixed-date holiday math (pure, no I/O). The parenting plan allocates holidays
// by even/odd year; the rules engine wants concrete date ranges. This computes
// the concrete date for each fixed holiday in a year, so the plan-extraction
// flow can materialize `HolidayConfig.occurrences`. Break-tied holidays
// (winter/spring/mid-winter/Thanksgiving break) come from the school calendar,
// not here. All dates are 'YYYY-MM-DD' (no timezone component).
// =============================================================================

import type { ISODate } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number): ISODate => `${y}-${pad(m)}-${pad(d)}`;

/** The n-th `weekday` (0=Sun..6=Sat) of a month. n is 1-based. */
export function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): ISODate {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
  return iso(year, month, day);
}

/** The last `weekday` (0=Sun..6=Sat) of a month. */
export function lastWeekdayOfMonth(year: number, month: number, weekday: number): ISODate {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); // day 0 of next month = last of this
  const lastDow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  const day = lastDay - ((lastDow - weekday + 7) % 7);
  return iso(year, month, day);
}

/** Easter Sunday (Gregorian / Anonymous computus). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

// The fixed (computable) holidays the plan can allocate by even/odd year.
export type FixedHolidayKind =
  | 'mothers_day'
  | 'fathers_day'
  | 'independence_day'
  | 'halloween'
  | 'easter'
  | 'new_years_day'
  | 'christmas_day';

export const FIXED_HOLIDAY_LABELS: Record<FixedHolidayKind, string> = {
  mothers_day: "Mother's Day",
  fathers_day: "Father's Day",
  independence_day: 'Fourth of July',
  halloween: 'Halloween',
  easter: 'Easter',
  new_years_day: "New Year's Day",
  christmas_day: 'Christmas Day',
};

/** The single calendar date a fixed holiday falls on in `year`. */
export function fixedHolidayDate(kind: FixedHolidayKind, year: number): ISODate {
  switch (kind) {
    case 'mothers_day':
      return nthWeekdayOfMonth(year, 5, 0, 2); // 2nd Sunday of May
    case 'fathers_day':
      return nthWeekdayOfMonth(year, 6, 0, 3); // 3rd Sunday of June
    case 'independence_day':
      return iso(year, 7, 4);
    case 'halloween':
      return iso(year, 10, 31);
    case 'easter':
      return easterSunday(year);
    case 'new_years_day':
      return iso(year, 1, 1);
    case 'christmas_day':
      return iso(year, 12, 25);
  }
}

/** Whether a fixed holiday is a parent's per the even/odd allocation. */
export function yearMatchesParity(year: number, parity: 'even' | 'odd' | 'every'): boolean {
  if (parity === 'every') return true;
  return parity === 'even' ? year % 2 === 0 : year % 2 === 1;
}

/**
 * Concrete single-day occurrences ({start,end} equal) for a fixed holiday across
 * `years`, filtered to those matching the parity (even/odd/every).
 */
export function fixedHolidayOccurrences(
  kind: FixedHolidayKind,
  years: number[],
  parity: 'even' | 'odd' | 'every',
): { start: ISODate; end: ISODate }[] {
  return years
    .filter((y) => yearMatchesParity(y, parity))
    .map((y) => {
      const d = fixedHolidayDate(kind, y);
      return { start: d, end: d };
    });
}
