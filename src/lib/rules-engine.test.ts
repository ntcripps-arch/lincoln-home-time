import { describe, expect, it } from 'vitest';
import { applyExceptions, generateBaseline, resolveRotation } from './rules-engine';
import type { ExceptionRow, Household, ScheduleRule } from './types';

const MOM = 'mom-household-id';
const DAD = 'dad-household-id';

const households: Household[] = [
  { id: MOM, family_id: 'f', name: "Mom's", color: '#e879a6', pickup_default: '15:30', dropoff_default: null, sort_order: 0 },
  { id: DAD, family_id: 'f', name: "Dad's", color: '#3b82f6', pickup_default: '08:00', dropoff_default: null, sort_order: 1 },
];
function rule(p: Partial<ScheduleRule> & Pick<ScheduleRule, 'config' | 'rule_type'>): ScheduleRule {
  return { id: Math.random().toString(36).slice(2), household_id: null, priority: 0,
    effective_start: null, effective_end: null, label: null, ...p };
}

describe('resolveRotation', () => {
  it('alternates weeks from the anchor', () => {
    const cfg = { kind: 'alternating_weeks', anchorDate: '2026-01-05', parentA: MOM, parentB: DAD } as const;
    expect(resolveRotation('2026-01-05', cfg)).toBe(MOM);
    expect(resolveRotation('2026-01-12', cfg)).toBe(DAD);
    expect(resolveRotation('2026-01-19', cfg)).toBe(MOM);
  });
  it('gives an even 7/7 split for 2-2-5-5', () => {
    const cfg = { kind: 'cycle_2255', anchorDate: '2026-01-05', parentA: MOM, parentB: DAD } as const;
    const days = Array.from({ length: 14 }, (_, i) =>
      resolveRotation(new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10), cfg));
    expect(days.filter((d) => d === MOM)).toHaveLength(7);
    expect(days.filter((d) => d === DAD)).toHaveLength(7);
  });
  it('custom_cycle reproduces an arbitrary repeating pattern', () => {
    const cfg = { kind: 'custom_cycle', anchorDate: '2026-01-01', parentA: DAD, parentB: MOM,
      pattern: ['A','A','A','A','A','B','B','B','B','B','B','B','B','B'] } as const;
    expect(resolveRotation('2026-01-01', cfg)).toBe(DAD); // Thu
    expect(resolveRotation('2026-01-05', cfg)).toBe(DAD); // Mon
    expect(resolveRotation('2026-01-06', cfg)).toBe(MOM); // Tue
    expect(resolveRotation('2026-01-15', cfg)).toBe(DAD); // +14, next block
  });
});

describe('generateBaseline overrides', () => {
  it('lets a higher-priority holiday override the rotation', () => {
    const rules: ScheduleRule[] = [
      rule({ rule_type: 'alternating_weeks',
        config: { kind: 'alternating_weeks', anchorDate: '2026-01-05', parentA: MOM, parentB: DAD } }),
      rule({ rule_type: 'holiday', priority: 100,
        config: { kind: 'holiday', name: 'Break with Dad', householdId: DAD,
          occurrences: [{ start: '2026-01-06', end: '2026-01-08' }] } }),
    ];
    const days = generateBaseline({ rules, households, rangeStart: '2026-01-05', rangeEnd: '2026-01-09' });
    expect(days.find((d) => d.date === '2026-01-07')).toMatchObject({ householdId: DAD, source: 'override' });
    expect(days.find((d) => d.date === '2026-01-09')).toMatchObject({ householdId: MOM, source: 'baseline' });
  });
});

describe('applyExceptions', () => {
  it('overlays a one-time swap distinctly', () => {
    const rules: ScheduleRule[] = [rule({ rule_type: 'alternating_weeks',
      config: { kind: 'alternating_weeks', anchorDate: '2026-01-05', parentA: MOM, parentB: DAD } })];
    const days = generateBaseline({ rules, households, rangeStart: '2026-01-05', rangeEnd: '2026-01-07' });
    const exceptions: ExceptionRow[] = [{ id: 'ex1', exception_type: 'swap', start_date: '2026-01-06',
      end_date: '2026-01-06', household_id: DAD, pickup_time: null, dropoff_time: null,
      note: 'dentist trip', created_by: 'u1' }];
    const merged = applyExceptions(days, exceptions);
    expect(merged.find((d) => d.date === '2026-01-06')).toMatchObject({ householdId: DAD, source: 'exception' });
    expect(merged.find((d) => d.date === '2026-01-05')?.source).toBe('baseline');
  });

  it('resolves overlapping exceptions by recency, not UUID order', () => {
    const days = generateBaseline({
      rules: [rule({ rule_type: 'alternating_weeks',
        config: { kind: 'alternating_weeks', anchorDate: '2026-01-05', parentA: MOM, parentB: DAD } })],
      households, rangeStart: '2026-01-06', rangeEnd: '2026-01-06',
    });
    // The newer exception (later created_at) assigns MOM but has an id that sorts
    // FIRST — so the old id-only sort would have made it LOSE; only created_at
    // ordering yields the correct (recency) winner.
    const older: ExceptionRow = { id: 'zzz', exception_type: 'swap', start_date: '2026-01-06',
      end_date: '2026-01-06', household_id: DAD, pickup_time: null, dropoff_time: null,
      note: null, created_by: 'u1', created_at: '2026-01-01T00:00:00Z' };
    const newer: ExceptionRow = { id: 'aaa', exception_type: 'swap', start_date: '2026-01-06',
      end_date: '2026-01-06', household_id: MOM, pickup_time: null, dropoff_time: null,
      note: null, created_by: 'u1', created_at: '2026-02-01T00:00:00Z' };
    // Feed them in id order to prove the sort, not insertion order, decides it.
    const merged = applyExceptions(days, [newer, older]);
    expect(merged[0].householdId).toBe(MOM);
  });
});

// ---- The REAL schedule, verified against the app's actual overnights --------
describe('real Clearman/Barrett schedule (Dad=green, Mom=blue)', () => {
  const base = rule({ rule_type: 'custom_cycle', priority: 0, label: 'Week on/off (Dad Thu→Tue)',
    config: { kind: 'custom_cycle', anchorDate: '2026-01-01', parentA: DAD, parentB: MOM,
      pattern: ['A','A','A','A','A','B','B','B','B','B','B','B','B','B'] } });
  const summer = rule({ rule_type: 'summer_override', priority: 50,
    effective_start: '2026-06-13', effective_end: '2026-08-31',
    config: { kind: 'summer_override', start: '2026-06-13', end: '2026-08-31',
      rotation: { kind: 'custom_cycle', anchorDate: '2026-07-03', parentA: DAD, parentB: MOM,
        pattern: ['A','A','A','A','A','A','A','B','B','B','B','B','B','B'] } } });

  function dad(date: string) {
    return generateBaseline({ rules: [base, summer], households, rangeStart: date, rangeEnd: date })[0].householdId === DAD;
  }

  it('school year: Dad has Thu→Mon every other week', () => {
    expect(dad('2026-01-01')).toBe(true);  // Thu block start
    expect(dad('2026-01-05')).toBe(true);  // Mon
    expect(dad('2026-01-06')).toBe(false); // Tue -> Mom
    expect(dad('2025-11-06')).toBe(true);  // verified vs screenshot
    expect(dad('2026-05-21')).toBe(true);
  });
  it('summer: every-other-week Friday rotation, Dad first (even year)', () => {
    expect(dad('2026-06-18')).toBe(false); // Mom (gap week)
    expect(dad('2026-06-19')).toBe(true);  // Dad's first summer Friday
    expect(dad('2026-07-03')).toBe(true);
    expect(dad('2026-07-10')).toBe(false); // Mom
    expect(dad('2026-08-28')).toBe(true);
  });
  it('back to school: base resumes in-phase on Sept 1', () => {
    expect(dad('2026-09-01')).toBe(false); // school resumes, Mom
    expect(dad('2026-09-10')).toBe(true);  // first fall Dad block
    expect(dad('2026-09-24')).toBe(true);
  });
});
