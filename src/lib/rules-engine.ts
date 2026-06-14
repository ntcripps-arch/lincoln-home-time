// =============================================================================
// Parenting-schedule rules engine (pure, no I/O).
//   generateBaseline(rules, range)    -> day-by-day household assignment
//   applyExceptions(days, exceptions) -> overlay swaps/vacations/overrides
//
// Dates are plain calendar dates ('YYYY-MM-DD') to avoid timezone drift. All
// arithmetic goes through the helpers below.
// =============================================================================

import type {
  DayAssignment, ExceptionRow, Household, ISODate,
  RotationConfig, RuleConfig, ScheduleRule,
} from './types';

// ----------------------------- date helpers ----------------------------------
export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
export function toISO(d: Date): ISODate { return d.toISOString().slice(0, 10); }
export function addDays(d: ISODate, n: number): ISODate {
  const dt = parseISO(d); dt.setUTCDate(dt.getUTCDate() + n); return toISO(dt);
}
/** Whole calendar days from a to b (b - a). Can be negative. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}
/** 0=Sun .. 6=Sat */
export function weekday(d: ISODate): number { return parseISO(d).getUTCDay(); }
export function inRange(d: ISODate, start: ISODate, end: ISODate): boolean { return d >= start && d <= end; }
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
/** Floored modulo (handles anchors in the future). */
function mod(n: number, m: number): number { return ((n % m) + m) % m; }

// --------------------------- rotation resolution ------------------------------
// Fixed 14-day patterns. 'A' = parentA, 'B' = parentB.
const PATTERN_2255 = ['A','A','B','B','A','A','A','A','A','B','B','B','B','B'];
const PATTERN_223  = ['A','A','B','B','A','A','A','B','B','A','A','B','B','B'];

/** Resolve which household has the child on `date` for a pure rotation. */
export function resolveRotation(date: ISODate, cfg: RotationConfig): string | null {
  switch (cfg.kind) {
    case 'alternating_weeks': {
      const weeks = Math.floor(diffDays(cfg.anchorDate, date) / 7);
      return mod(weeks, 2) === 0 ? cfg.parentA : cfg.parentB;
    }
    case 'cycle_2255': {
      const idx = mod(diffDays(cfg.anchorDate, date), 14);
      return PATTERN_2255[idx] === 'A' ? cfg.parentA : cfg.parentB;
    }
    case 'cycle_223': {
      const idx = mod(diffDays(cfg.anchorDate, date), 14);
      return PATTERN_223[idx] === 'A' ? cfg.parentA : cfg.parentB;
    }
    case 'weekday_weekend': {
      const weekend = cfg.weekendDays ?? [0, 6];
      return weekend.includes(weekday(date)) ? cfg.weekendHousehold : cfg.weekdayHousehold;
    }
    case 'custom_cycle': {
      const idx = mod(diffDays(cfg.anchorDate, date), cfg.pattern.length);
      return cfg.pattern[idx] === 'A' ? cfg.parentA : cfg.parentB;
    }
  }
}

const ROTATION_KINDS = new Set([
  'alternating_weeks', 'cycle_2255', 'cycle_223', 'weekday_weekend', 'custom_cycle',
]);
function isRotation(cfg: RuleConfig): cfg is RotationConfig {
  return ROTATION_KINDS.has((cfg as RotationConfig).kind);
}

// ------------------------------ baseline build --------------------------------
interface GenerateInput {
  rules: ScheduleRule[];
  households: Household[];
  rangeStart: ISODate;
  rangeEnd: ISODate;
}

/**
 * Build the day-by-day baseline. One rotation rule acts as the baseline (highest
 * priority wins if several). Override rules (holiday / summer / school break /
 * custom) are layered by priority (higher wins) within their effective window.
 */
export function generateBaseline({ rules, households, rangeStart, rangeEnd }: GenerateInput): DayAssignment[] {
  const householdIds = new Set(households.map((h) => h.id));
  const pickup = (id: string | null) => households.find((h) => h.id === id)?.pickup_default ?? null;
  const dropoff = (id: string | null) => households.find((h) => h.id === id)?.dropoff_default ?? null;
  const within = (r: ScheduleRule, d: ISODate) =>
    (!r.effective_start || d >= r.effective_start) && (!r.effective_end || d <= r.effective_end);

  const baselineRules = rules.filter((r) => isRotation(r.config)).sort((a, b) => b.priority - a.priority);
  const overrideRules = rules.filter((r) => !isRotation(r.config)).sort((a, b) => b.priority - a.priority);

  return eachDay(rangeStart, rangeEnd).map((date) => {
    for (const r of overrideRules) {
      if (!within(r, date)) continue;
      const hit = matchOverride(date, r);
      if (hit && householdIds.has(hit)) {
        return { date, householdId: hit, source: 'override', ruleId: r.id, ruleType: r.rule_type,
          pickupTime: pickup(hit), dropoffTime: dropoff(hit), label: r.label ?? overrideLabel(r) };
      }
    }
    for (const r of baselineRules) {
      if (!within(r, date)) continue;
      const hid = resolveRotation(date, r.config as RotationConfig);
      if (hid && householdIds.has(hid)) {
        return { date, householdId: hid, source: 'baseline', ruleId: r.id, ruleType: r.rule_type,
          pickupTime: pickup(hid), dropoffTime: dropoff(hid), label: r.label };
      }
    }
    return { date, householdId: null, source: 'unassigned', ruleId: null, ruleType: null,
      pickupTime: null, dropoffTime: null, label: null };
  });
}

/** Household an override assigns to `date`, or null if it doesn't apply. */
function matchOverride(date: ISODate, rule: ScheduleRule): string | null {
  const cfg = rule.config;
  switch (cfg.kind) {
    case 'holiday':
      return cfg.occurrences.some((o) => inRange(date, o.start, o.end)) ? cfg.householdId : null;
    case 'summer_override':
      if (!inRange(date, cfg.start, cfg.end)) return null;
      if (cfg.rotation) return resolveRotation(date, cfg.rotation);
      return cfg.householdId ?? null;
    case 'school_break_override':
      if (!cfg.ranges.some((r) => inRange(date, r.start, r.end))) return null;
      if (cfg.rotation) return resolveRotation(date, cfg.rotation);
      return cfg.householdId ?? null;
    case 'custom':
      return cfg.ranges.some((r) => inRange(date, r.start, r.end)) ? cfg.householdId : null;
    default:
      return null;
  }
}

function overrideLabel(rule: ScheduleRule): string | null {
  const cfg = rule.config;
  if (cfg.kind === 'holiday') return cfg.name;
  if (cfg.kind === 'summer_override') return 'Summer schedule';
  if (cfg.kind === 'school_break_override') return 'School break';
  if (cfg.kind === 'custom') return cfg.note ?? 'Custom';
  return null;
}

// ------------------------------ exceptions ------------------------------------
/**
 * Overlay exceptions onto baseline assignments. Exceptions never alter the
 * locked plan — they replace the resolved household for their date range and
 * are flagged `source: 'exception'` so the UI can style them distinctly.
 * `note`-type exceptions annotate without changing the household.
 */
export function applyExceptions(days: DayAssignment[], exceptions: ExceptionRow[]): DayAssignment[] {
  const sorted = [...exceptions].sort((a, b) => a.id.localeCompare(b.id));
  return days.map((day) => {
    let next = day;
    for (const ex of sorted) {
      if (!inRange(day.date, ex.start_date, ex.end_date)) continue;
      if (ex.exception_type === 'note') { next = { ...next, label: ex.note ?? next.label }; continue; }
      next = { ...next, householdId: ex.household_id ?? next.householdId, source: 'exception',
        ruleId: ex.id, ruleType: null, pickupTime: ex.pickup_time ?? next.pickupTime,
        dropoffTime: ex.dropoff_time ?? next.dropoffTime, label: ex.note ?? next.label };
    }
    return next;
  });
}
