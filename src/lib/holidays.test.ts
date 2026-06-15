import { describe, expect, it } from 'vitest';
import {
  easterSunday,
  fixedHolidayDate,
  fixedHolidayOccurrences,
  lastWeekdayOfMonth,
  nthWeekdayOfMonth,
  yearMatchesParity,
} from './holidays';

describe('nthWeekdayOfMonth', () => {
  it('finds the 2nd Sunday of May 2026 (Mother’s Day)', () => {
    expect(nthWeekdayOfMonth(2026, 5, 0, 2)).toBe('2026-05-10');
  });
  it('finds the 3rd Sunday of June 2026 (Father’s Day)', () => {
    expect(nthWeekdayOfMonth(2026, 6, 0, 3)).toBe('2026-06-21');
  });
  it('finds the 4th Thursday of November 2026 (Thanksgiving)', () => {
    expect(nthWeekdayOfMonth(2026, 11, 4, 4)).toBe('2026-11-26');
  });
});

describe('lastWeekdayOfMonth', () => {
  it('finds the last Monday of May 2026 (Memorial Day)', () => {
    expect(lastWeekdayOfMonth(2026, 5, 1)).toBe('2026-05-25');
  });
});

describe('easterSunday', () => {
  it('matches known Gregorian dates', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2024)).toBe('2024-03-31');
  });
});

describe('fixedHolidayDate', () => {
  it('computes fixed-date holidays', () => {
    expect(fixedHolidayDate('independence_day', 2026)).toBe('2026-07-04');
    expect(fixedHolidayDate('halloween', 2027)).toBe('2027-10-31');
    expect(fixedHolidayDate('christmas_day', 2026)).toBe('2026-12-25');
    expect(fixedHolidayDate('new_years_day', 2027)).toBe('2027-01-01');
  });
});

describe('yearMatchesParity', () => {
  it('splits even/odd/every', () => {
    expect(yearMatchesParity(2026, 'even')).toBe(true);
    expect(yearMatchesParity(2026, 'odd')).toBe(false);
    expect(yearMatchesParity(2027, 'odd')).toBe(true);
    expect(yearMatchesParity(2027, 'every')).toBe(true);
  });
});

describe('fixedHolidayOccurrences', () => {
  it('emits one single-day range per matching year (Halloween, Mother=odd years)', () => {
    const occ = fixedHolidayOccurrences('halloween', [2026, 2027, 2028, 2029], 'odd');
    expect(occ).toEqual([
      { start: '2027-10-31', end: '2027-10-31' },
      { start: '2029-10-31', end: '2029-10-31' },
    ]);
  });
  it('emits every year when parity is "every" (Mother’s Day)', () => {
    const occ = fixedHolidayOccurrences('mothers_day', [2026, 2027], 'every');
    expect(occ).toEqual([
      { start: '2026-05-10', end: '2026-05-10' },
      { start: '2027-05-09', end: '2027-05-09' },
    ]);
  });
});
