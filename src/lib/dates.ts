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

/** Format a timestamptz instant (trip segments, created_at) in the family tz. */
export function formatInstant(ts: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(ts).toLocaleString('en-US', { timeZone: FAMILY_TZ, ...opts });
}

/** 'YYYY-MM-DDTHH:mm' Pacific wall-clock (datetime-local input) -> ISO instant. */
export function fromLocalInput(local: string): string {
  const [d, t] = local.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const utc = Date.UTC(y, mo - 1, da, h, mi); // treat wall-clock as UTC
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: FAMILY_TZ,
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

/** Inverse of fromLocalInput: ISO instant -> 'YYYY-MM-DDTHH:mm' Pacific wall-clock,
 *  for pre-filling a datetime-local input when editing. */
export function toLocalInput(iso: string): string {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: FAMILY_TZ,
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
