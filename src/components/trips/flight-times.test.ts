import { describe, expect, it } from 'vitest';
import { aviationstackInstant, flightQueryParams, friendlyFlightError, isRestriction } from './flight-times';
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

describe('flightQueryParams', () => {
  it('always includes the flight date so the right day is fetched', () => {
    expect(flightQueryParams({ airline: 'AS', flightNumber: '1366', flightDate: '2026-06-25' })).toEqual({
      flight_date: '2026-06-25',
      flight_iata: 'AS1366',
    });
  });

  it('combines a short airline code + number into a flight_iata', () => {
    expect(flightQueryParams({ airline: 'as', flightNumber: '1366' })).toEqual({ flight_iata: 'AS1366' });
    // strips non-digits from the number and spaces/punctuation from the code
    expect(flightQueryParams({ airline: 'B6', flightNumber: 'no. 49' })).toEqual({ flight_iata: 'B649' });
  });

  it('queries by airline name + number when the airline is a full name', () => {
    expect(flightQueryParams({ airline: 'Alaska Airlines', flightNumber: '1366' })).toEqual({
      airline_name: 'Alaska Airlines',
      flight_number: '1366',
    });
  });

  it('prefers an explicit IATA code (refresh path)', () => {
    expect(flightQueryParams({ flightIata: 'as 1366', flightDate: '2026-06-25' })).toEqual({
      flight_date: '2026-06-25',
      flight_iata: 'AS1366',
    });
  });

  it('returns null when nothing identifiable is given', () => {
    expect(flightQueryParams({ flightDate: '2026-06-25' })).toBeNull();
    expect(flightQueryParams({ airline: 'Alaska' })).toBeNull();
    expect(flightQueryParams({ flightNumber: '1366' })).toBeNull();
  });
});

describe('isRestriction', () => {
  it('flags date/historical/feature-access errors as retryable real-time', () => {
    expect(isRestriction('function_access_restricted')).toBe(true);
    expect(isRestriction('historical_data_restricted')).toBe(true);
    expect(isRestriction('restricted')).toBe(true);
  });

  it('does not flag usage/key/https errors (a real-time retry would not help)', () => {
    expect(isRestriction('usage_limit_reached')).toBe(false);
    expect(isRestriction('rate_limit_reached')).toBe(false);
    expect(isRestriction('invalid_access_key')).toBe(false);
    expect(isRestriction('https_access_restricted')).toBe(false);
  });
});

describe('friendlyFlightError', () => {
  it('explains the paid-plan limit for date-restricted lookups', () => {
    expect(friendlyFlightError('function_access_restricted')).toMatch(/paid Aviationstack plan/i);
  });

  it('maps the known error codes', () => {
    expect(friendlyFlightError('usage_limit_reached')).toMatch(/limit reached/i);
    expect(friendlyFlightError('invalid_access_key')).toMatch(/key is missing or invalid/i);
    expect(friendlyFlightError('https_access_restricted')).toMatch(/HTTPS/);
  });

  it('surfaces the raw code for unknown errors so they are actionable', () => {
    expect(friendlyFlightError('some_new_code')).toContain('some_new_code');
  });
});
