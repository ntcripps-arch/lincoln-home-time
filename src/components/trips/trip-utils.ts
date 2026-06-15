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
