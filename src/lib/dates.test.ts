import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDay, formatInstant, fromLocalInput, todayISO } from './dates';
import { weekday } from './rules-engine';

describe('todayISO', () => {
  afterEach(() => vi.useRealTimers());

  it('uses the family (Pacific) tz, not UTC', () => {
    // 04:30 UTC on the 19th is still the evening of the 18th in Pacific.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T04:30:00Z'));
    expect(todayISO()).toBe('2026-06-18');
  });
});

describe('formatDay', () => {
  it('formats a calendar date with no tz shift', () => {
    expect(formatDay('2026-06-19', { month: 'short', day: 'numeric' })).toBe('Jun 19');
  });
});

describe('engine weekday (used for calendar layout)', () => {
  it('treats 2026-06-19 as Friday', () => {
    expect(weekday('2026-06-19')).toBe(5);
  });
});

describe('fromLocalInput (Pacific wall-clock -> instant)', () => {
  it('uses PDT (-7) in July', () => {
    expect(fromLocalInput('2026-07-17T08:10')).toBe('2026-07-17T15:10:00.000Z');
  });
  it('uses PST (-8) in January', () => {
    expect(fromLocalInput('2026-01-10T08:10')).toBe('2026-01-10T16:10:00.000Z');
  });
  it('round-trips back to the same wall-clock via formatInstant', () => {
    const iso = fromLocalInput('2026-07-17T08:10');
    expect(formatInstant(iso, { hour: 'numeric', minute: '2-digit' })).toBe('8:10 AM');
  });
});
