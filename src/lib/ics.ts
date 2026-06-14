// =============================================================================
// ICS (RFC 5545) serializer for the read-only calendar subscribe feed.
//   • Parenting assignments come from the rules engine (consecutive same-home
//     days are merged into one all-day event).
//   • School dates and trips render as all-day events; manual events render at
//     their Pacific wall-clock time, emitted as UTC instants so no VTIMEZONE
//     block is needed.
// All schedule math stays in rules-engine.ts (UTC-based on 'YYYY-MM-DD').
// =============================================================================

import { addDays, applyExceptions, generateBaseline } from './rules-engine';
import { fromLocalInput, todayISO } from './dates';
import type { ExceptionRow, Household, ScheduleRule } from './types';

export interface FeedData {
  family_name?: string | null;
  households: Household[];
  rules: ScheduleRule[];
  exceptions: ExceptionRow[];
  school: { id: string; date: string; end_date: string | null; title: string }[];
  events: {
    id: string; title: string; date: string; all_day: boolean;
    start_time: string | null; end_time: string | null; location: string | null;
  }[];
  trips: { id: string; title: string; start_date: string; end_date: string; destination: string | null }[];
}

// How far back/forward the feed materializes (a subscription re-fetches, so this
// is just the visible window any calendar app will show).
const PAST_DAYS = 30;
const FUTURE_DAYS = 180;

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Fold lines to 75 octets per RFC 5545 (continuation lines start with a space).
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(' ' + rest);
  return parts.join('\r\n');
}

const dateStamp = (iso: string) => iso.replace(/-/g, ''); // YYYY-MM-DD -> YYYYMMDD
function utcStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

interface VEvent {
  uid: string;
  summary: string;
  location?: string | null;
  allDay?: { start: string; endExclusive: string };
  timed?: { startUtc: string; endUtc: string };
}

function renderEvent(ev: VEvent, dtstamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${ev.uid}`, `DTSTAMP:${dtstamp}`];
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(ev.allDay.start)}`);
    lines.push(`DTEND;VALUE=DATE:${dateStamp(ev.allDay.endExclusive)}`);
  } else if (ev.timed) {
    lines.push(`DTSTART:${ev.timed.startUtc}`);
    lines.push(`DTEND:${ev.timed.endUtc}`);
  }
  lines.push(`SUMMARY:${escapeText(ev.summary)}`);
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  lines.push('END:VEVENT');
  return lines;
}

export function buildCalendarICS(data: FeedData, uidDomain = 'lincolnhometime'): string {
  const today = todayISO();
  const rangeStart = addDays(today, -PAST_DAYS);
  const rangeEnd = addDays(today, FUTURE_DAYS);
  const householdName = (id: string | null) => data.households.find((h) => h.id === id)?.name ?? 'Unassigned';

  const events: VEvent[] = [];

  // Parenting schedule — merge consecutive same-household days.
  if (data.rules.length) {
    const days = applyExceptions(
      generateBaseline({ rules: data.rules, households: data.households, rangeStart, rangeEnd }),
      data.exceptions,
    );
    let i = 0;
    while (i < days.length) {
      const hid = days[i].householdId;
      if (!hid) { i++; continue; }
      let j = i;
      while (j + 1 < days.length && days[j + 1].householdId === hid) j++;
      events.push({
        uid: `parenting-${days[i].date}@${uidDomain}`,
        summary: `🏠 With ${householdName(hid)}`,
        allDay: { start: days[i].date, endExclusive: addDays(days[j].date, 1) },
      });
      i = j + 1;
    }
  }

  // School dates (all-day, possibly multi-day).
  for (const s of data.school) {
    const end = s.end_date ?? s.date;
    events.push({
      uid: `school-${s.id}@${uidDomain}`,
      summary: `🎓 ${s.title}`,
      allDay: { start: s.date, endExclusive: addDays(end, 1) },
    });
  }

  // Manual events — timed (Pacific wall-clock -> UTC instants) or all-day.
  for (const e of data.events) {
    if (e.all_day || !e.start_time) {
      events.push({
        uid: `event-${e.id}@${uidDomain}`,
        summary: e.title,
        location: e.location,
        allDay: { start: e.date, endExclusive: addDays(e.date, 1) },
      });
    } else {
      const startUtc = utcStamp(new Date(fromLocalInput(`${e.date}T${e.start_time.slice(0, 5)}`)));
      const endSource = e.end_time
        ? fromLocalInput(`${e.date}T${e.end_time.slice(0, 5)}`)
        : new Date(new Date(fromLocalInput(`${e.date}T${e.start_time.slice(0, 5)}`)).getTime() + 3600_000).toISOString();
      events.push({
        uid: `event-${e.id}@${uidDomain}`,
        summary: e.title,
        location: e.location,
        timed: { startUtc, endUtc: utcStamp(new Date(endSource)) },
      });
    }
  }

  // Trips (all-day spanning the stay).
  for (const t of data.trips) {
    events.push({
      uid: `trip-${t.id}@${uidDomain}`,
      summary: `✈️ ${t.title}`,
      location: t.destination,
      allDay: { start: t.start_date, endExclusive: addDays(t.end_date, 1) },
    });
  }

  const dtstamp = utcStamp(new Date());
  const calName = `${data.family_name ?? 'Family'} schedule`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${uidDomain}//calendar feed//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
    'X-PUBLISHED-TTL:PT6H',
    ...events.flatMap((ev) => renderEvent(ev, dtstamp)),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
