// =============================================================================
// Single source of truth for the date/time RENDERING boundary.
//
// Both households are in Seattle, so the app's calendar sense of "today" and all
// instant formatting are anchored to Pacific. Schedule/date MATH stays in
// rules-engine.ts (UTC-based on 'YYYY-MM-DD'); this module is display-only.
//
//   • calendar dates ('YYYY-MM-DD')      -> formatDay   (no tz shift)
//   • timestamptz instants               -> formatInstant (Pacific, label "PT")
//   • wall-clock text ("15:30")          -> render verbatim (already Pacific)
// =============================================================================

export const FAMILY_TZ = 'America/Los_Angeles';

/** Current calendar date in the family's tz — identical on server and client. */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FAMILY_TZ }).format(new Date());
}

/** Format a calendar date 'YYYY-MM-DD' with NO tz shift. */
export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
}

/** Format a timestamptz instant in an arbitrary IANA tz. */
export function formatInZone(ts: string, timeZone: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(ts).toLocaleString('en-US', { timeZone, ...opts });
}

/** Format a timestamptz instant (trip segments, created_at) in the family tz. */
export function formatInstant(ts: string, opts: Intl.DateTimeFormatOptions): string {
  return formatInZone(ts, FAMILY_TZ, opts);
}

/** Short tz abbreviation for an instant in a given zone (e.g. PDT, GMT+1). */
export function zoneAbbrev(ts: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date(ts));
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/** 'YYYY-MM-DDTHH:mm' wall-clock in a given IANA tz -> ISO instant. */
export function fromZonedInput(local: string, timeZone: string): string {
  const [d, t] = local.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const utc = Date.UTC(y, mo - 1, da, h, mi); // treat wall-clock as UTC
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
    .formatToParts(new Date(utc))
    .reduce<Record<string, string>>((a, x) => {
      a[x.type] = x.value;
      return a;
    }, {});
  const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utc;
  return new Date(utc - offset).toISOString();
}

/** Inverse: ISO instant -> 'YYYY-MM-DDTHH:mm' wall-clock in a given tz (edit prefill). */
export function toZonedInput(iso: string, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
    .formatToParts(new Date(iso))
    .reduce<Record<string, string>>((a, x) => {
      a[x.type] = x.value;
      return a;
    }, {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Pacific wall-clock convenience wrappers (manual events, lodging, etc.). */
export function fromLocalInput(local: string): string {
  return fromZonedInput(local, FAMILY_TZ);
}
export function toLocalInput(iso: string): string {
  return toZonedInput(iso, FAMILY_TZ);
}

// Curated IANA zones for the flight timezone pickers (covers the realistic set).
export const TIME_ZONES: { value: string; label: string }[] = [
  { value: 'America/Los_Angeles', label: 'Pacific — Seattle, LA' },
  { value: 'America/Denver', label: 'Mountain — Denver' },
  { value: 'America/Phoenix', label: 'Arizona — Phoenix' },
  { value: 'America/Chicago', label: 'Central — Chicago' },
  { value: 'America/New_York', label: 'Eastern — New York' },
  { value: 'America/Anchorage', label: 'Alaska — Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii — Honolulu' },
  { value: 'America/Toronto', label: 'Eastern Canada — Toronto' },
  { value: 'America/Mexico_City', label: 'Mexico City' },
  { value: 'Europe/London', label: 'UK — London' },
  { value: 'Europe/Paris', label: 'Central Europe — Paris, Berlin' },
  { value: 'Europe/Athens', label: 'Eastern Europe — Athens' },
  { value: 'Asia/Dubai', label: 'Gulf — Dubai' },
  { value: 'Asia/Kolkata', label: 'India' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Japan — Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
];
