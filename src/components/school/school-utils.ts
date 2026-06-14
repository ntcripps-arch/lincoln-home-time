import { formatDay, todayISO } from '@/lib/dates';
import type { SchoolCategory } from '@/lib/types';

export type SchoolUploadStatus = 'pending_review' | 'active' | 'archived';
export type SchoolDateStatus = 'proposed' | 'approved' | 'rejected';

export interface SchoolUploadRow {
  id: string;
  school_year: string;
  status: SchoolUploadStatus;
  uploaded_at: string;
  approved_at: string | null;
}

export interface SchoolDateEditRow {
  id: string;
  date: string;
  end_date: string | null;
  category: SchoolCategory;
  title: string;
  notes: string | null;
  status: SchoolDateStatus;
}

// school_category enum, verbatim from 0001_init.sql.
export const SCHOOL_CATEGORIES: { value: SchoolCategory; label: string }[] = [
  { value: 'holiday', label: 'Holiday' },
  { value: 'no_school', label: 'No school' },
  { value: 'early_release', label: 'Early release' },
  { value: 'break', label: 'Break' },
  { value: 'teacher_work_day', label: 'Teacher work day' },
  { value: 'first_day', label: 'First day' },
  { value: 'last_day', label: 'Last day' },
  { value: 'event', label: 'Event' },
];
export const SCHOOL_CATEGORY_VALUES: SchoolCategory[] = SCHOOL_CATEGORIES.map((c) => c.value);

export function schoolCategoryLabel(c: SchoolCategory): string {
  return SCHOOL_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

/** e.g. '2025-2026' — Aug+ rolls into the upcoming year. */
export function currentSchoolYear(): string {
  const [y, m] = todayISO().split('-').map(Number);
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export function formatDateRange(date: string, endDate: string | null): string {
  if (!endDate || endDate === date) {
    return formatDay(date, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return `${formatDay(date, { month: 'short', day: 'numeric' })} – ${formatDay(endDate, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

export function uploadStatusBadge(s: SchoolUploadStatus): { label: string; className: string } {
  switch (s) {
    case 'pending_review':
      return { label: 'Pending review', className: 'bg-amber-100 text-amber-800' };
    case 'active':
      return { label: 'Active', className: 'bg-emerald-100 text-emerald-800' };
    case 'archived':
      return { label: 'Archived', className: 'bg-muted text-muted-foreground' };
  }
}

export function dateStatusBadge(s: SchoolDateStatus): { label: string; className: string } {
  switch (s) {
    case 'proposed':
      return { label: 'Proposed', className: 'bg-amber-100 text-amber-800' };
    case 'approved':
      return { label: 'Approved', className: 'bg-emerald-100 text-emerald-800' };
    case 'rejected':
      return { label: 'Rejected', className: 'bg-rose-100 text-rose-800' };
  }
}
