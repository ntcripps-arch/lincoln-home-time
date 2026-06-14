// Pure helpers for the calendar UI: month-grid math, range expansion, and
// display formatting. All date math goes through the rules-engine helpers, which
// are UTC-based on 'YYYY-MM-DD' strings (no timezone drift). No React, no I/O.
import type { CSSProperties } from 'react';
import { addDays, eachDay, weekday } from '@/lib/rules-engine';
import { formatDay, formatInstant } from '@/lib/dates';
import type {
  ExceptionType, ISODate, SchoolCategory, Trip, TripSegment,
} from '@/lib/types';

// ---- Row shapes loaded by the calendar page (subset of the DB columns) -------
export interface SchoolDateRow {
  id: string;
  date: ISODate;
  end_date: ISODate | null;
  category: SchoolCategory;
  title: string;
  notes: string | null;
}
export interface ManualEventRow {
  id: string;
  title: string;
  date: ISODate;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  category: string;
  created_by: string | null;
  series_id: string | null;
}
export type TripWithSegments = Trip & { trip_segments: TripSegment[] };

// Recurrence definition for a repeating event (one row per series).
export interface SeriesRow {
  id: string;
  title: string;
  category: string;
  location: string | null;
  notes: string | null;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  weekdays: number[]; // 0=Sun .. 6=Sat
  start_date: ISODate;
  end_date: ISODate;
}

// manual_category enum, verbatim from 0001_init.sql.
export const MANUAL_CATEGORIES: { value: string; label: string }[] = [
  { value: 'sports', label: 'Sports' },
  { value: 'performance', label: 'Performance' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'travel', label: 'Travel' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'other', label: 'Other' },
];
export function manualCategoryLabel(c: string): string {
  return MANUAL_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

// Single-letter weekday labels for the recurrence picker (index = 0=Sun..6=Sat).
export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Calendar dates in [start, end] whose weekday is in `weekdays` (0=Sun..6=Sat). */
export function occurrenceDates(weekdays: number[], start: ISODate, end: ISODate, cap = 400): ISODate[] {
  if (!weekdays.length || start > end) return [];
  const set = new Set(weekdays);
  return eachDay(start, end).filter((d) => set.has(weekday(d))).slice(0, cap);
}

// ---- Constants ---------------------------------------------------------------
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---- Grid --------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');

export interface MonthGrid {
  monthStart: ISODate;
  monthEnd: ISODate;
  gridStart: ISODate; // Sunday on/before the 1st
  gridEnd: ISODate; // Saturday on/after the last
  days: ISODate[]; // 35 or 42 days
}

/** Calendar grid (incl. leading/trailing days) for a 1-indexed month. */
export function monthGrid(year: number, month: number): MonthGrid {
  const monthStart = `${year}-${pad(month)}-01`;
  const nextMonthStart = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
  const monthEnd = addDays(nextMonthStart, -1);
  const gridStart = addDays(monthStart, -weekday(monthStart));
  const gridEnd = addDays(monthEnd, 6 - weekday(monthEnd));
  return { monthStart, monthEnd, gridStart, gridEnd, days: eachDay(gridStart, gridEnd) };
}

export function isSameMonth(date: ISODate, year: number, month: number): boolean {
  return Number(date.slice(0, 4)) === year && Number(date.slice(5, 7)) === month;
}

/**
 * Expand date-range rows into a per-day lookup, clamped to [clampStart, clampEnd].
 * Used for school dates, events, trips, and exceptions overlays.
 */
export function buildRangeMap<T>(
  items: { start: ISODate; end: ISODate; item: T }[],
  clampStart: ISODate,
  clampEnd: ISODate,
): Map<ISODate, T[]> {
  const map = new Map<ISODate, T[]>();
  for (const { start, end, item } of items) {
    const s = start < clampStart ? clampStart : start;
    const e = end > clampEnd ? clampEnd : end;
    if (s > e) continue;
    for (let d = s; d <= e; d = addDays(d, 1)) {
      const arr = map.get(d);
      if (arr) arr.push(item);
      else map.set(d, [item]);
    }
  }
  return map;
}

// ---- Display formatting (see src/lib/dates.ts for the tz rules) ---------------
export function formatFullDate(iso: ISODate): string {
  return formatDay(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function weekdayShort(iso: ISODate): string {
  return WEEKDAYS[weekday(iso)];
}

/** 'HH:MM[:SS]' -> '3:30 PM'. */
export function formatClock(t: string | null | undefined): string | null {
  if (!t) return null;
  const [hStr, mStr] = t.split(':');
  let h = Number(hStr);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/** timestamptz -> 'Jul 3, 9:15 AM PT' (family tz). */
export function formatStamp(ts: string | null | undefined): string | null {
  if (!ts) return null;
  return `${formatInstant(ts, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PT`;
}

export function schoolCategoryLabel(c: SchoolCategory): string {
  return c.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
}

const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  swap: 'Swap',
  vacation: 'Vacation',
  holiday_override: 'Holiday',
  pickup_dropoff_change: 'Pickup / dropoff change',
  note: 'Note',
};
export function exceptionTypeLabel(t: ExceptionType): string {
  return EXCEPTION_LABELS[t] ?? t;
}

export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

/** Day tint: the household color at ~15% over white (DESIGN.md). */
export function tintStyle(color: string): CSSProperties {
  return { backgroundColor: `color-mix(in srgb, ${color} 15%, white)` };
}

// Layer chip/dot styling. Household (parenting) colors come from the DB; the
// non-parenting layers get fixed, distinct hues that never recolor the day.
export type LayerKey = 'parenting' | 'school' | 'events' | 'trips';
export const LAYER_ORDER: LayerKey[] = ['parenting', 'school', 'events', 'trips'];
export const LAYER_META: Record<LayerKey, { label: string; dot: string; chip: string }> = {
  parenting: { label: 'Parenting', dot: 'bg-primary', chip: '' },
  school: { label: 'School', dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800' },
  events: { label: 'Events', dot: 'bg-violet-500', chip: 'bg-violet-100 text-violet-800' },
  trips: { label: 'Trips', dot: 'bg-sky-500', chip: 'bg-sky-100 text-sky-800' },
};
