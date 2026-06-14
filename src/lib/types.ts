// =============================================================================
// Domain types shared across the app. Rule-config types are the structured
// contract the rules engine reads — keep any rule-authoring UI in sync.
// Generate exact DB row types later with: npm run db:types
// =============================================================================

export type FamilyRole = 'admin' | 'viewer';
export type PlanStatus = 'draft' | 'active' | 'archived';

export type RuleType =
  | 'alternating_weeks'
  | 'cycle_2255'
  | 'cycle_223'
  | 'weekday_weekend'
  | 'custom_cycle'
  | 'holiday'
  | 'summer_override'
  | 'school_break_override'
  | 'custom';

export type SchoolCategory =
  | 'holiday' | 'no_school' | 'early_release' | 'break'
  | 'teacher_work_day' | 'first_day' | 'last_day' | 'event';

export type ExceptionType =
  | 'swap' | 'vacation' | 'holiday_override' | 'pickup_dropoff_change' | 'note';

export type RequestType = 'vacation' | 'family_event' | 'swap' | 'holiday' | 'travel' | 'other';
export type RequestStatus = 'pending' | 'approved' | 'denied' | 'countered' | 'withdrawn' | 'expired';
export type SegmentType = 'flight' | 'lodging' | 'ground' | 'other';

/** ISO calendar date, no time component: 'YYYY-MM-DD' */
export type ISODate = string;

export interface Household {
  id: string;
  family_id: string;
  name: string;
  color: string;
  pickup_default: string | null;
  dropoff_default: string | null;
  sort_order: number;
}

// -----------------------------------------------------------------------------
// Rule config shapes (stored in parenting_schedule_rules.config jsonb)
// -----------------------------------------------------------------------------

/** A rotation resolves a household for any given date. Used as a baseline and
 *  reusable inside overrides (e.g. a summer block running its own rotation). */
export type RotationConfig =
  | AlternatingWeeksConfig
  | Cycle2255Config
  | Cycle223Config
  | WeekdayWeekendConfig
  | CustomCycleConfig;

export interface AlternatingWeeksConfig {
  kind: 'alternating_weeks';
  anchorDate: ISODate; // a changeover date that begins parentA's week
  parentA: string;
  parentB: string;
}
export interface Cycle2255Config {
  kind: 'cycle_2255';
  anchorDate: ISODate;
  parentA: string;
  parentB: string;
}
export interface Cycle223Config {
  kind: 'cycle_223';
  anchorDate: ISODate;
  parentA: string;
  parentB: string;
}
export interface WeekdayWeekendConfig {
  kind: 'weekday_weekend';
  weekdayHousehold: string;
  weekendHousehold: string;
  weekendDays?: number[]; // 0=Sun..6=Sat, default [0,6]
}
/** Arbitrary repeating N-day pattern anchored to a date — for real-world
 *  schedules that don't fit the presets (e.g. "Dad has Thu→Mon every other
 *  week" is a 14-day pattern). */
export interface CustomCycleConfig {
  kind: 'custom_cycle';
  anchorDate: ISODate;     // index-0 date of the cycle
  parentA: string;         // household for 'A' slots
  parentB: string;         // household for 'B' slots
  pattern: ('A' | 'B')[];  // length defines the cycle (e.g. 14)
}

export interface HolidayConfig {
  kind: 'holiday';
  name: string;
  householdId: string;
  occurrences: { start: ISODate; end: ISODate }[];
  pickupTime?: string;
  dropoffTime?: string;
}
export interface SummerOverrideConfig {
  kind: 'summer_override';
  start: ISODate;
  end: ISODate;
  householdId?: string;       // whole block to one household, OR…
  rotation?: RotationConfig;  // …run a rotation during the block
}
export interface SchoolBreakOverrideConfig {
  kind: 'school_break_override';
  ranges: { start: ISODate; end: ISODate }[];
  householdId?: string;
  rotation?: RotationConfig;
}
export interface CustomConfig {
  kind: 'custom';
  ranges: { start: ISODate; end: ISODate }[];
  householdId: string;
  note?: string;
}

export type RuleConfig =
  | RotationConfig
  | HolidayConfig
  | SummerOverrideConfig
  | SchoolBreakOverrideConfig
  | CustomConfig;

export interface ScheduleRule {
  id: string;
  rule_type: RuleType;
  household_id: string | null;
  config: RuleConfig;
  priority: number;
  effective_start: ISODate | null;
  effective_end: ISODate | null;
  label: string | null;
}

export interface ExceptionRow {
  id: string;
  exception_type: ExceptionType;
  start_date: ISODate;
  end_date: ISODate;
  household_id: string | null;
  pickup_time: string | null;
  dropoff_time: string | null;
  note: string | null;
  created_by: string | null;
}

// -----------------------------------------------------------------------------
// Engine output
// -----------------------------------------------------------------------------
export type DaySource = 'baseline' | 'override' | 'exception' | 'unassigned';

export interface DayAssignment {
  date: ISODate;
  householdId: string | null;
  source: DaySource;
  ruleId: string | null;
  ruleType: RuleType | null;
  pickupTime: string | null;
  dropoffTime: string | null;
  label: string | null;
}

// -----------------------------------------------------------------------------
// Collaboration row types (mirror the SQL; for app code & email payloads)
// -----------------------------------------------------------------------------
export interface TimeRequest {
  id: string;
  family_id: string;
  requester_id: string;
  request_type: RequestType;
  requested_household_id: string | null;
  start_date: ISODate;
  end_date: ISODate;
  start_time: string | null;
  end_time: string | null;
  title: string;
  note: string | null;
  status: RequestStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  proposed_start_date: ISODate | null;
  proposed_end_date: ISODate | null;
  linked_exception_id: string | null;
}

export interface Trip {
  id: string;
  family_id: string;
  title: string;
  traveling_household_id: string | null;
  start_date: ISODate;
  end_date: ISODate;
  destination: string | null;
  notes: string | null;
  linked_request_id: string | null;
  created_by: string | null;
}

export interface TripSegment {
  id: string;
  trip_id: string;
  segment_type: SegmentType;
  title: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  confirmation: string | null;
  details: Record<string, unknown>;
  sort_order: number;
}
