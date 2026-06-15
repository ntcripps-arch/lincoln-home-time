import { FAMILY_TZ, fromZonedInput } from '@/lib/dates';

/**
 * Aviationstack returns each time as the departure/arrival airport's LOCAL wall
 * clock, but tags the ISO string with a "+00:00" (UTC) offset — e.g. a 2:18 PM
 * Pacific departure comes back as "2026-06-25T14:18:00+00:00". Trusting that
 * offset shifts every time by the airport's real UTC offset (the −7h bug).
 *
 * The digits are always the airport-local wall clock, so we take just the
 * 'YYYY-MM-DDTHH:mm' portion and re-interpret it in the airport's IANA zone to
 * recover the true instant. Works whether the bogus offset is "+00:00" or a
 * correct one — we never trust it.
 */
export function aviationstackInstant(raw: string | null, timeZone: string): string | null {
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(raw);
  if (!m) return raw; // unexpected format — leave untouched rather than mangle it
  return fromZonedInput(`${m[1]}T${m[2]}`, timeZone || FAMILY_TZ);
}

// True when the plan can't run a query as-is — e.g. date-filtered/historical
// lookups, which aren't on Aviationstack's free tier. Such a query can be
// retried real-time (without the date) instead of hard-failing.
export function isRestriction(code: string): boolean {
  return /function_access|historical|date|restrict/i.test(code) && !/access_key|https/i.test(code);
}

/** Map an Aviationstack error code/type string to a user-facing message. */
export function friendlyFlightError(code: string): string {
  const c = code.toLowerCase();
  if (c.includes('usage_limit') || c.includes('rate_limit')) return 'Monthly flight-lookup limit reached — enter the details manually.';
  if (c.includes('access_key')) return 'The flight-lookup key is missing or invalid.';
  if (c.includes('https')) return 'The flight service rejected the request (HTTPS not allowed on the free plan).';
  if (isRestriction(c)) return 'Looking up a flight by date needs a paid Aviationstack plan. On the free plan, look it up on or near the travel day, or enter the details manually.';
  return `The flight service returned an error${code ? ` (${code})` : ''} — enter the details manually.`;
}

export interface FlightQuery {
  flightIata?: string;
  airline?: string;
  flightNumber?: string;
  flightDate?: string;
}

/**
 * Build the Aviationstack query fields from the lookup form's date + airline +
 * number. Prefers an explicit IATA code (e.g. a stored "AS1366" on refresh),
 * then boarding-pass style "AS" + "1366", then a full airline name + number.
 * Returns null when there's nothing identifiable to query.
 */
export function flightQueryParams(input: FlightQuery): Record<string, string> | null {
  const direct = (input.flightIata ?? '').replace(/\s+/g, '').toUpperCase();
  const airline = (input.airline ?? '').trim();
  const airlineCode = airline.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const number = (input.flightNumber ?? '').replace(/\D+/g, ''); // digits only

  const q: Record<string, string> = {};
  if (input.flightDate) q.flight_date = input.flightDate;

  if (direct) {
    q.flight_iata = direct;
  } else if (airlineCode && airlineCode.length <= 3 && number) {
    q.flight_iata = `${airlineCode}${number}`;
  } else if (airline && number) {
    q.airline_name = airline;
    q.flight_number = number;
  } else {
    return null;
  }
  return q;
}
