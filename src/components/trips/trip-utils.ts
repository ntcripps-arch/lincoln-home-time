import { formatDay, formatInstant, formatInZone, toLocalInput, zoneAbbrev } from '@/lib/dates';
import type { ISODate, SegmentType, TripSegment } from '@/lib/types';

/**
 * Does a trip segment fall on the given calendar day (family/Pacific tz)?
 * Used to show only the segments relevant to the day being viewed — e.g. an
 * outbound flight on its departure day, not the return flight days later. A
 * multi-day segment (lodging) matches every day it covers. Undated segments
 * can't be placed, so they always show.
 */
export function segmentOnDate(seg: TripSegment, date: ISODate): boolean {
  if (!seg.start_at) return true;
  const start = toLocalInput(seg.start_at).slice(0, 10);
  const end = seg.end_at ? toLocalInput(seg.end_at).slice(0, 10) : start;
  return date >= start && date <= end;
}

// Live-tracking window: start polling shortly before scheduled departure and
// stop a couple hours after scheduled arrival — or as soon as the flight is in
// a terminal state. Keeps auto-refresh off for past/far-future flights.
const TRACK_TERMINAL = new Set(['landed', 'cancelled', 'incident', 'diverted']);
const TRACK_PRE_MS = 15 * 60_000;
const TRACK_POST_MS = 2 * 60 * 60_000;
const TRACK_FALLBACK_DURATION_MS = 3 * 60 * 60_000; // when arrival time is unknown

/** Should this flight be auto-refreshed right now (nowMs)? Pure; drives the timer. */
export function isFlightTrackingActive(seg: TripSegment, nowMs: number): boolean {
  if (seg.segment_type !== 'flight' || !seg.start_at) return false;
  const d = (seg.details ?? {}) as Record<string, unknown>;
  const iata = typeof d.flight_iata === 'string' ? d.flight_iata : '';
  if (!iata) return false; // nothing to query
  const status = typeof d.status === 'string' ? d.status : '';
  if (TRACK_TERMINAL.has(status)) return false; // already done
  const depMs = Date.parse(seg.start_at);
  if (Number.isNaN(depMs)) return false;
  const arrMs = seg.end_at ? Date.parse(seg.end_at) : depMs + TRACK_FALLBACK_DURATION_MS;
  return nowMs >= depMs - TRACK_PRE_MS && nowMs <= arrMs + TRACK_POST_MS;
}

// The flight's travel date (family/Pacific tz): the stored flight_date if set,
// else the departure instant's Pacific calendar date.
function flightDepDate(seg: TripSegment): ISODate | null {
  const d = (seg.details ?? {}) as Record<string, unknown>;
  const fd = typeof d.flight_date === 'string' ? d.flight_date : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(fd)) return fd;
  if (seg.start_at) return toLocalInput(seg.start_at).slice(0, 10);
  return null;
}

/**
 * May we refresh this flight's status as of `today` (Pacific date)? Only from the
 * travel day onward — before then there's no live data, so a refresh just wastes
 * the request. Non-flights / untracked flights can never refresh; an undated
 * flight isn't blocked (we can't tell when it travels).
 */
export function canRefreshFlight(seg: TripSegment, today: ISODate): boolean {
  if (seg.segment_type !== 'flight') return false;
  const d = (seg.details ?? {}) as Record<string, unknown>;
  if (typeof d.flight_iata !== 'string' || !d.flight_iata) return false;
  const dep = flightDepDate(seg);
  return dep === null || today >= dep;
}

// This is a light "helpful resource," not a live tracker: refresh sparsely and
// cap the total per viewing session so a flight costs ~10 API calls at most.
// Cadence widens/narrows by phase so the calls land where they matter — catching
// the takeoff and the landing — rather than burning the budget mid-cruise.
export const MAX_FLIGHT_REFRESHES = 10;
const REFRESH_PRE_MS = 20 * 60_000; // before departure (catch a delayed takeoff)
const REFRESH_AIR_MS = 30 * 60_000; // airborne (update the estimated landing)
const REFRESH_ARR_MS = 15 * 60_000; // past scheduled arrival (catch the landing)

/** Delay until the next auto-refresh for a flight, by phase. */
export function nextFlightRefreshMs(seg: TripSegment, nowMs: number): number {
  const depMs = seg.start_at ? Date.parse(seg.start_at) : NaN;
  if (Number.isNaN(depMs)) return REFRESH_AIR_MS;
  const arrMs = seg.end_at ? Date.parse(seg.end_at) : depMs + TRACK_FALLBACK_DURATION_MS;
  if (nowMs < depMs) return REFRESH_PRE_MS;
  if (nowMs < arrMs) return REFRESH_AIR_MS;
  return REFRESH_ARR_MS;
}

// segment_type enum, verbatim from 0002_collaboration.sql.
export const SEGMENT_TYPES: { value: SegmentType; label: string }[] = [
  { value: 'flight', label: 'Flight' },
  { value: 'lodging', label: 'Lodging' },
  { value: 'ground', label: 'Ground' },
  { value: 'other', label: 'Other' },
];

export function segmentTypeLabel(t: SegmentType): string {
  return SEGMENT_TYPES.find((x) => x.value === t)?.label ?? t;
}

export function formatTripRange(start: string, end: string): string {
  if (start === end) return formatDay(start, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${formatDay(start, { month: 'short', day: 'numeric' })} – ${formatDay(end, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

export function flightStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'scheduled':
      return { label: 'Scheduled', className: 'bg-muted text-muted-foreground' };
    case 'active':
      return { label: 'In the air', className: 'bg-sky-100 text-sky-800' };
    case 'landed':
      return { label: 'Landed', className: 'bg-emerald-100 text-emerald-800' };
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-rose-100 text-rose-800' };
    case 'incident':
      return { label: 'Incident', className: 'bg-rose-100 text-rose-800' };
    case 'diverted':
      return { label: 'Diverted', className: 'bg-amber-100 text-amber-800' };
    default:
      return { label: status, className: 'bg-muted text-muted-foreground' };
  }
}

// "Jul 3, 1:30 PM PDT" — instant rendered in a specific zone with its abbreviation.
const fz = (iso: string, tz: string) =>
  `${formatInZone(iso, tz, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ${zoneAbbrev(iso, tz)}`;
const pt = (iso: string) => `${formatInstant(iso, { hour: 'numeric', minute: '2-digit' })} PT`;
const ptStamp = (iso: string | null) =>
  iso ? `${formatInstant(iso, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PT` : null;

export interface SegmentDisplay {
  isFlight: boolean;
  title: string;
  location: string | null;
  times: string | null; // non-flight: "start → end" (PT)
  departs: string | null; // flight: scheduled departure in dep tz
  arrives: string | null; // flight: scheduled arrival in arr tz
  arrivesPt: string | null; // flight: scheduled arrival in PT
  actualLabel: string | null; // "Arrived" | "Now estimated"
  actual: string | null; // actual/estimated arrival in arr tz
  actualPt: string | null; // ...in PT
  status: { label: string; className: string } | null;
  statusUpdated: string | null; // "as of ..." (PT)
  confirmation: string | null;
  extra: string | null; // lodging room
}

export function segmentDisplay(seg: TripSegment): SegmentDisplay {
  const d = (seg.details ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');

  if (seg.segment_type === 'flight' && s('dep_tz') && s('arr_tz')) {
    const depTz = s('dep_tz');
    const arrTz = s('arr_tz');
    const actualIso = s('arr_actual') || s('arr_estimated');
    return {
      isFlight: true,
      title: seg.title ?? 'Flight',
      location: seg.location,
      times: null,
      departs: seg.start_at ? fz(seg.start_at, depTz) : null,
      arrives: seg.end_at ? fz(seg.end_at, arrTz) : null,
      arrivesPt: seg.end_at ? pt(seg.end_at) : null,
      actualLabel: s('arr_actual') ? 'Arrived' : s('arr_estimated') ? 'Now estimated' : null,
      actual: actualIso ? fz(actualIso, arrTz) : null,
      actualPt: actualIso ? pt(actualIso) : null,
      status: s('status') ? flightStatusBadge(s('status')) : null,
      statusUpdated: s('status_updated') ? ptStamp(s('status_updated')) : null,
      confirmation: seg.confirmation,
      extra: null,
    };
  }

  return {
    isFlight: false,
    title: seg.title ?? segmentTypeLabel(seg.segment_type),
    location: seg.location,
    times: [ptStamp(seg.start_at), ptStamp(seg.end_at)].filter(Boolean).join(' → ') || null,
    departs: null,
    arrives: null,
    arrivesPt: null,
    actualLabel: null,
    actual: null,
    actualPt: null,
    status: null,
    statusUpdated: null,
    confirmation: seg.confirmation,
    extra: s('room') || null,
  };
}
