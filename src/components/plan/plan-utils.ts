// Pure helpers for the parenting-plan review UI (no React, no I/O).
import { formatDay } from '@/lib/dates';
import type { ISODate } from '@/lib/types';

export interface PlanVersionRow {
  id: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  locked: boolean;
  created_at: string;
  notes: string | null;
}

export interface PlanRuleRow {
  id: string;
  rule_type: string;
  household_id: string | null;
  config: Record<string, unknown>;
  priority: number;
  label: string | null;
}

const ROTATION_KINDS = new Set(['alternating_weeks', 'cycle_2255', 'cycle_223', 'weekday_weekend', 'custom_cycle']);
export function isRotationRule(rule: PlanRuleRow): boolean {
  return ROTATION_KINDS.has(rule.rule_type);
}
export function isHolidayRule(rule: PlanRuleRow): boolean {
  return rule.rule_type === 'holiday';
}

/** Day-count split of a custom_cycle pattern, mapped to household ids. */
export function rotationSummary(config: Record<string, unknown>): { aDays: number; bDays: number; length: number } {
  const pattern = Array.isArray(config.pattern) ? (config.pattern as string[]) : [];
  const aDays = pattern.filter((p) => p === 'A').length;
  return { aDays, bDays: pattern.length - aDays, length: pattern.length };
}

export function ruleHouseholdId(rule: PlanRuleRow): string | null {
  return rule.household_id ?? ((rule.config.householdId as string | undefined) ?? null);
}

export function holidayOccurrences(config: Record<string, unknown>): { start: ISODate; end: ISODate }[] {
  const occ = config.occurrences;
  return Array.isArray(occ) ? (occ as { start: ISODate; end: ISODate }[]) : [];
}

export function formatOccurrence(o: { start: ISODate; end: ISODate }): string {
  const start = formatDay(o.start, { month: 'short', day: 'numeric', year: 'numeric' });
  if (!o.end || o.end === o.start) return start;
  return `${formatDay(o.start, { month: 'short', day: 'numeric' })} – ${formatDay(o.end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function holidayTimes(config: Record<string, unknown>): string | null {
  const p = config.pickupTime as string | undefined;
  const d = config.dropoffTime as string | undefined;
  if (!p && !d) return null;
  return [p && `from ${p}`, d && `until ${d}`].filter(Boolean).join(' ');
}
