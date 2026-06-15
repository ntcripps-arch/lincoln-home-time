import { describe, expect, it } from 'vitest';
import {
  MAX_FLIGHT_REFRESHES, canRefreshFlight, isFlightTrackingActive, nextFlightRefreshMs, segmentOnDate,
} from './trip-utils';
import type { TripSegment } from '@/lib/types';

// Minimal segment — only start_at/end_at matter to segmentOnDate.
const seg = (start_at: string | null, end_at: string | null = null): TripSegment =>
  ({ id: 's', segment_type: 'flight', start_at, end_at } as unknown as TripSegment);

// Trackable flight: AS1366, dep 14:18 PDT (21:18Z), arr 16:32 PDT (23:32Z).
const trackable = (status = 'scheduled'): TripSegment =>
  ({
    id: 's',
    segment_type: 'flight',
    start_at: '2026-06-25T21:18:00.000Z',
    end_at: '2026-06-25T23:32:00.000Z',
    details: { flight_iata: 'AS1366', status },
  } as unknown as TripSegment);

const at = (iso: string) => Date.parse(iso);

describe('segmentOnDate', () => {
  it('matches a flight only on its (Pacific) departure day', () => {
    // 2026-06-25 14:18 PDT = 21:18Z; arrives 16:32 PDT = 23:32Z, same day.
    const flight = seg('2026-06-25T21:18:00.000Z', '2026-06-25T23:32:00.000Z');
    expect(segmentOnDate(flight, '2026-06-25')).toBe(true);
    expect(segmentOnDate(flight, '2026-06-24')).toBe(false);
    expect(segmentOnDate(flight, '2026-06-26')).toBe(false);
    expect(segmentOnDate(flight, '2026-06-29')).toBe(false); // the return-flight day
  });

  it('matches every day a multi-day stay covers', () => {
    const lodging = seg('2026-06-25T23:00:00.000Z', '2026-06-29T18:00:00.000Z');
    expect(segmentOnDate(lodging, '2026-06-25')).toBe(true);
    expect(segmentOnDate(lodging, '2026-06-27')).toBe(true);
    expect(segmentOnDate(lodging, '2026-06-29')).toBe(true);
    expect(segmentOnDate(lodging, '2026-06-24')).toBe(false);
    expect(segmentOnDate(lodging, '2026-06-30')).toBe(false);
  });

  it('uses the Pacific calendar date, not UTC', () => {
    // 2026-06-26 04:00Z is still 2026-06-25 (21:00) in Pacific.
    const lateFlight = seg('2026-06-26T04:00:00.000Z', '2026-06-26T06:00:00.000Z');
    expect(segmentOnDate(lateFlight, '2026-06-25')).toBe(true);
    expect(segmentOnDate(lateFlight, '2026-06-26')).toBe(false);
  });

  it('always shows undated segments (cannot place them)', () => {
    expect(segmentOnDate(seg(null), '2026-06-25')).toBe(true);
  });
});

describe('isFlightTrackingActive', () => {
  it('is active in the air, within the window', () => {
    expect(isFlightTrackingActive(trackable('active'), at('2026-06-25T22:00:00Z'))).toBe(true);
  });

  it('is active just before departure (catches a delayed takeoff)', () => {
    // 21:10Z is within the 15-min pre-departure lead (dep 21:18Z).
    expect(isFlightTrackingActive(trackable('scheduled'), at('2026-06-25T21:10:00Z'))).toBe(true);
    // 20:00Z is well before the window.
    expect(isFlightTrackingActive(trackable('scheduled'), at('2026-06-25T20:00:00Z'))).toBe(false);
  });

  it('stops once landed, even inside the window', () => {
    expect(isFlightTrackingActive(trackable('landed'), at('2026-06-25T22:00:00Z'))).toBe(false);
    expect(isFlightTrackingActive(trackable('cancelled'), at('2026-06-25T22:00:00Z'))).toBe(false);
  });

  it('stops a couple hours after scheduled arrival', () => {
    // arr 23:32Z + 2h grace = 01:32Z; 02:00Z is past it.
    expect(isFlightTrackingActive(trackable('active'), at('2026-06-26T01:00:00Z'))).toBe(true);
    expect(isFlightTrackingActive(trackable('active'), at('2026-06-26T02:00:00Z'))).toBe(false);
  });

  it('never tracks non-flights, untracked flights, or undated flights', () => {
    expect(isFlightTrackingActive(seg('2026-06-25T21:18:00.000Z'), at('2026-06-25T22:00:00Z'))).toBe(false); // no flight_iata
    expect(isFlightTrackingActive({ ...trackable(), segment_type: 'lodging' } as TripSegment, at('2026-06-25T22:00:00Z'))).toBe(false);
    expect(isFlightTrackingActive({ ...trackable(), start_at: null } as TripSegment, at('2026-06-25T22:00:00Z'))).toBe(false);
  });
});

describe('nextFlightRefreshMs', () => {
  const f = trackable('scheduled'); // dep 21:18Z, arr 23:32Z

  it('refreshes loosely before departure (catch a delay)', () => {
    expect(nextFlightRefreshMs(f, at('2026-06-25T20:00:00Z'))).toBe(20 * 60_000);
  });

  it('refreshes every ~30 min while airborne', () => {
    expect(nextFlightRefreshMs(f, at('2026-06-25T22:00:00Z'))).toBe(30 * 60_000);
  });

  it('tightens to ~15 min past scheduled arrival to catch the landing', () => {
    expect(nextFlightRefreshMs(f, at('2026-06-26T00:00:00Z'))).toBe(15 * 60_000);
  });

  it('walks the whole window sparsely — far from the old ~100 calls', () => {
    let steps = 0;
    let t = at('2026-06-25T21:08:00Z'); // window start (≈ dep − 15 min lead)
    const endMs = at('2026-06-25T23:32:00Z') + 2 * 60 * 60_000; // arr + 2h grace
    while (t <= endMs && steps < 1000) {
      steps += 1;
      t += nextFlightRefreshMs(f, t);
    }
    expect(steps).toBeGreaterThan(5); // it does keep checking across the flight
    expect(steps).toBeLessThan(16); // but sparsely
  });

  it('the hard cap bounds a viewing session to ~10 calls', () => {
    expect(MAX_FLIGHT_REFRESHES).toBe(10);
  });
});

describe('canRefreshFlight', () => {
  it('blocks refresh before the travel day, allows it from then on', () => {
    const f = trackable(); // departs 2026-06-25 (Pacific)
    expect(canRefreshFlight(f, '2026-06-24')).toBe(false);
    expect(canRefreshFlight(f, '2026-06-25')).toBe(true);
    expect(canRefreshFlight(f, '2026-06-26')).toBe(true);
  });

  it('uses the stored flight_date when present', () => {
    const f = {
      id: 's',
      segment_type: 'flight',
      start_at: '2026-07-01T00:00:00.000Z', // deliberately different from flight_date
      details: { flight_iata: 'AS1366', flight_date: '2026-06-25' },
    } as unknown as TripSegment;
    expect(canRefreshFlight(f, '2026-06-24')).toBe(false);
    expect(canRefreshFlight(f, '2026-06-25')).toBe(true);
  });

  it('never allows refresh for non-flights or untracked flights', () => {
    expect(canRefreshFlight({ ...trackable(), segment_type: 'lodging' } as TripSegment, '2026-06-25')).toBe(false);
    expect(canRefreshFlight(seg('2026-06-25T21:18:00.000Z'), '2026-06-25')).toBe(false); // no flight_iata
  });

  it('does not block an undated trackable flight (cannot tell when it travels)', () => {
    const f = { id: 's', segment_type: 'flight', start_at: null, details: { flight_iata: 'AS1366' } } as unknown as TripSegment;
    expect(canRefreshFlight(f, '2026-06-25')).toBe(true);
  });
});
