import { formatDay } from '@/lib/dates';
import type { SegmentType } from '@/lib/types';

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
