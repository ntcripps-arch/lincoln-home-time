import { describe, expect, it } from 'vitest';
import { segmentOnDate } from './trip-utils';
import type { TripSegment } from '@/lib/types';

// Minimal segment — only start_at/end_at matter to segmentOnDate.
const seg = (start_at: string | null, end_at: string | null = null): TripSegment =>
  ({ id: 's', segment_type: 'flight', start_at, end_at } as unknown as TripSegment);

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
