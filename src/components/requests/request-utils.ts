import { formatDay } from '@/lib/dates';
import type { RequestStatus, RequestType, TimeRequest } from '@/lib/types';

// time_requests has created_at/updated_at columns that the shared TimeRequest
// type omits; the inbox needs created_at for sorting + display.
export type RequestRow = TimeRequest & { created_at: string; updated_at: string };

// request_type enum values, verbatim from 0002_collaboration.sql.
export const REQUEST_TYPES: { value: RequestType; label: string }[] = [
  { value: 'swap', label: 'Swap' },
  { value: 'vacation', label: 'Vacation' },
  { value: 'family_event', label: 'Family event' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'travel', label: 'Travel' },
  { value: 'other', label: 'Other' },
];

export function requestTypeLabel(t: RequestType): string {
  return REQUEST_TYPES.find((x) => x.value === t)?.label ?? t;
}

export function statusBadge(s: RequestStatus): { label: string; className: string } {
  switch (s) {
    case 'pending':
      return { label: 'Pending', className: 'bg-amber-100 text-amber-800' };
    case 'countered':
      return { label: 'Counter proposed', className: 'bg-sky-100 text-sky-800' };
    case 'approved':
      return { label: 'Approved', className: 'bg-emerald-100 text-emerald-800' };
    case 'denied':
      return { label: 'Declined', className: 'bg-rose-100 text-rose-800' };
    case 'withdrawn':
      return { label: 'Withdrawn', className: 'bg-muted text-muted-foreground' };
    case 'expired':
      return { label: 'Expired', className: 'bg-muted text-muted-foreground' };
    default:
      return { label: s, className: 'bg-muted text-muted-foreground' };
  }
}

export function formatDateRange(start: string, end: string): string {
  const s = formatDay(start, { month: 'short', day: 'numeric' });
  if (start === end) return s;
  return `${s} – ${formatDay(end, { month: 'short', day: 'numeric' })}`;
}
