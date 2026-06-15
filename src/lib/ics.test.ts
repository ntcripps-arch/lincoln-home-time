import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCalendarICS, type FeedData } from './ics';
import type { Household, ScheduleRule } from './types';

const MOM = 'mom-household-id';
const DAD = 'dad-household-id';
const households: Household[] = [
  { id: MOM, family_id: 'f', name: "Mom's", color: '#e879a6', pickup_default: null, dropoff_default: null, sort_order: 0 },
  { id: DAD, family_id: 'f', name: "Dad's", color: '#3b82f6', pickup_default: null, dropoff_default: null, sort_order: 1 },
];
const altRule: ScheduleRule = {
  id: 'r1', household_id: null, priority: 0, effective_start: null, effective_end: null, label: null,
  rule_type: 'alternating_weeks',
  config: { kind: 'alternating_weeks', anchorDate: '2026-01-05', parentA: MOM, parentB: DAD },
};

const emptyFeed: FeedData = { households, rules: [], exceptions: [], school: [], events: [], trips: [] };
const build = (over: Partial<FeedData> = {}) => buildCalendarICS({ ...emptyFeed, ...over });
const lines = (ics: string) => ics.split('\r\n');

describe('buildCalendarICS', () => {
  // todayISO() (the materialization window) and DTSTAMP both read the clock.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('wraps a valid VCALENDAR with CRLF endings and required headers', () => {
    const out = build({ trips: [{ id: 't1', title: 'Trip', start_date: '2026-06-20', end_date: '2026-06-22', destination: null }] });
    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(out).toContain('VERSION:2.0');
    expect(out).toContain('METHOD:PUBLISH');
    // Every newline is a CRLF (no lone \n).
    expect(/[^\r]\n/.test(out)).toBe(false);
  });

  it('folds every physical line to <= 75 units (RFC 5545)', () => {
    const longTitle = 'A very long event title that comfortably exceeds the seventy-five octet folding boundary for ICS lines';
    const out = build({ events: [{ id: 'e1', title: longTitle, date: '2026-06-20', all_day: true, start_time: null, end_time: null, location: null }] });
    for (const l of lines(out)) expect(l.length).toBeLessThanOrEqual(75);
    // A continuation line (CRLF + leading space) must exist for the long summary.
    expect(out).toContain('\r\n ');
  });

  it('renders an all-day event with an EXCLUSIVE end date (end + 1 day)', () => {
    const out = build({ school: [{ id: 's1', date: '2026-06-20', end_date: '2026-06-22', title: 'Spring Break' }] });
    expect(out).toContain('DTSTART;VALUE=DATE:20260620');
    expect(out).toContain('DTEND;VALUE=DATE:20260623'); // 06-22 + 1
    expect(out).toContain('SUMMARY:🎓 Spring Break');
  });

  it('renders a timed event as UTC instants with a default 1h duration', () => {
    const out = build({ events: [{ id: 'e1', title: 'Recital', date: '2026-06-20', all_day: false, start_time: '18:00', end_time: null, location: 'Civic Hall' }] });
    // 18:00 PDT (UTC-7) = 01:00Z the next day; default end = +1h.
    expect(out).toContain('DTSTART:20260621T010000Z');
    expect(out).toContain('DTEND:20260621T020000Z');
    expect(out).toContain('LOCATION:Civic Hall');
  });

  it('honours an explicit end time', () => {
    const out = build({ events: [{ id: 'e1', title: 'Game', date: '2026-06-20', all_day: false, start_time: '18:00', end_time: '20:30', location: null }] });
    expect(out).toContain('DTSTART:20260621T010000Z');
    expect(out).toContain('DTEND:20260621T033000Z'); // 20:30 PDT = 03:30Z
  });

  it('escapes commas, semicolons, backslashes, and newlines in text', () => {
    const out = build({ events: [{ id: 'e1', title: 'Soccer, practice; A\\B\nbring water', date: '2026-06-20', all_day: true, start_time: null, end_time: null, location: null }] });
    expect(out).toContain('SUMMARY:Soccer\\, practice\\; A\\\\B\\nbring water');
  });

  it('merges consecutive same-household parenting days into spanning events', () => {
    const out = build({ rules: [altRule] });
    const parentingEvents = (out.match(/UID:parenting-/g) ?? []).length;
    // The window is ~210 days; weekly rotation merges to ~30 events, not ~210.
    expect(parentingEvents).toBeGreaterThan(10);
    expect(parentingEvents).toBeLessThan(60);
    expect(out).toContain("SUMMARY:🏠 With Mom's");
  });

  it('skips days with no household assignment', () => {
    // No rules → no parenting events at all.
    const out = build();
    expect(out).not.toContain('UID:parenting-');
  });
});
