import { describe, expect, it } from 'vitest';
import { aviationstackInstant } from './flight-times';
import { toZonedInput } from '@/lib/dates';

describe('aviationstackInstant', () => {
  // Regression for AS1366: a 2:18 PM Pacific departure came back as
  // "…T14:18:00+00:00" and was rendered as 7:18 AM (−7h). The fix re-anchors the
  // local wall-clock digits to the airport zone instead of trusting the offset.
  it('treats the tagged-UTC time as the airport-local wall clock', () => {
    const dep = aviationstackInstant('2026-06-25T14:18:00+00:00', 'America/Los_Angeles');
    const arr = aviationstackInstant('2026-06-25T16:32:00+00:00', 'America/Los_Angeles');
    // 14:18 PDT = 21:18Z, 16:32 PDT = 23:32Z.
    expect(dep).toBe('2026-06-25T21:18:00.000Z');
    expect(arr).toBe('2026-06-25T23:32:00.000Z');
    // And it round-trips back to the original local wall clock for the form.
    expect(toZonedInput(dep!, 'America/Los_Angeles')).toBe('2026-06-25T14:18');
    expect(toZonedInput(arr!, 'America/Los_Angeles')).toBe('2026-06-25T16:32');
  });

  it('anchors to the correct zone for a non-Pacific airport', () => {
    // 10:00 local in London (BST, +1) = 09:00Z.
    expect(aviationstackInstant('2026-06-25T10:00:00+00:00', 'Europe/London')).toBe(
      '2026-06-25T09:00:00.000Z',
    );
  });

  it('falls back to the family zone when the airport tz is blank', () => {
    expect(aviationstackInstant('2026-06-25T14:18:00+00:00', '')).toBe('2026-06-25T21:18:00.000Z');
  });

  it('passes through nulls and unparseable values', () => {
    expect(aviationstackInstant(null, 'America/Los_Angeles')).toBeNull();
    expect(aviationstackInstant('not-a-date', 'America/Los_Angeles')).toBe('not-a-date');
  });
});
