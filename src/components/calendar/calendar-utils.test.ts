import { describe, expect, it } from 'vitest';
import { DEFAULT_RECUR_DAYS, defaultRepeatUntil, occurrenceDates } from './calendar-utils';
import { diffDays, weekday } from '@/lib/rules-engine';

describe('occurrenceDates', () => {
  it('expands every selected weekday across the range', () => {
    // Mon (1) + Thu (4) over two months → both weekdays appear, not just the first.
    const dates = occurrenceDates([1, 4], '2026-06-01', '2026-07-31');
    expect(dates.length).toBe(18);
    expect(new Set(dates.map(weekday))).toEqual(new Set([1, 4]));
  });

  it('caps runaway ranges', () => {
    expect(occurrenceDates([0, 1, 2, 3, 4, 5, 6], '2000-01-01', '2100-01-01', 50)).toHaveLength(50);
  });

  it('returns nothing for an empty weekday list or an inverted range', () => {
    expect(occurrenceDates([], '2026-06-01', '2026-07-31')).toEqual([]);
    expect(occurrenceDates([1], '2026-07-31', '2026-06-01')).toEqual([]);
  });
});

describe('defaultRepeatUntil', () => {
  it('lands DEFAULT_RECUR_DAYS after the start date', () => {
    const until = defaultRepeatUntil('2026-06-15');
    expect(diffDays('2026-06-15', until)).toBe(DEFAULT_RECUR_DAYS);
    expect(until > '2026-06-15').toBe(true);
  });

  // Regression for the "Baseball Practice" bug: a Mon+Thu series whose
  // "repeat until" equals the start date materialized a single occurrence.
  // The default span must always yield a genuinely repeating series.
  it('produces more than one occurrence for a multi-weekday series', () => {
    const start = '2026-06-15'; // a Monday
    expect(occurrenceDates([1, 4], start, start)).toHaveLength(1); // the old trap
    expect(occurrenceDates([1, 4], start, defaultRepeatUntil(start)).length).toBeGreaterThan(1);
  });
});
