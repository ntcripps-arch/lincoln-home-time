import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDay, formatInstant, fromLocalInput, fromZonedInput, todayISO } from './dates';
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

describe('fromZonedInput (arbitrary tz, for flights)', () => {
  it('London BST (+1) in July', () => {
    expect(fromZonedInput('2026-07-04T06:30', 'Europe/London')).toBe('2026-07-04T05:30:00.000Z');
  });
  it('London GMT (+0) in January (pins DST)', () => {
    expect(fromZonedInput('2026-01-04T06:30', 'Europe/London')).toBe('2026-01-04T06:30:00.000Z');
  });
  it('a SEA 1:30 PM PDT departure and LHR 8:30 AM BST arrival land at the right instants', () => {
    const dep = fromZonedInput('2026-07-03T13:30', 'America/Los_Angeles'); // 20:30Z
    const arr = fromZonedInput('2026-07-04T08:30', 'Europe/London'); // 07:30Z next day
    expect(dep).toBe('2026-07-03T20:30:00.000Z');
    expect(arr).toBe('2026-07-04T07:30:00.000Z');
    // The same arrival instant reads as 8:30 AM in London and 12:30 AM PT.
    expect(formatInstant(arr, { hour: 'numeric', minute: '2-digit' })).toBe('12:30 AM');
  });
});
