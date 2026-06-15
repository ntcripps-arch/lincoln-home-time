'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { todayISO } from '@/lib/dates';
import { aviationstackInstant, flightQueryParams, friendlyFlightError, isRestriction } from './flight-times';

// Aviationstack v1 real-time flights.
//   • Free plan is HTTP-only (HTTPS needs a paid plan) and ~100 requests/month.
//   • So every call here is ON-DEMAND (manual lookup / refresh) — never polling.
//   • It returns real-time data, so a lookup works best around the travel day;
//     ahead of time the form's manual fields are the fallback.
const BASE = 'http://api.aviationstack.com/v1/flights';

export interface FlightInfo {
  airline: string;
  flightNumber: string;
  flightIata: string;
  flightDate: string;
  depCity: string; depIata: string; depTz: string;
  depScheduled: string | null; depActual: string | null; depEstimated: string | null; depGate: string;
  arrCity: string; arrIata: string; arrTz: string;
  arrScheduled: string | null; arrActual: string | null; arrEstimated: string | null; arrGate: string; arrBaggage: string;
  status: string;
}

export type LookupResponse = { ok: true; flight: FlightInfo } | { error: string };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function normalize(f: Record<string, unknown>): FlightInfo {
  const dep = obj(f.departure);
  const arr = obj(f.arrival);
  const al = obj(f.airline);
  const fl = obj(f.flight);
  const depTz = str(dep.timezone);
  const arrTz = str(arr.timezone);
  // Aviationstack reports airport-local times tagged "+00:00"; re-anchor each to
  // its airport's zone so downstream storage/display gets a true instant.
  return {
    airline: str(al.name),
    flightNumber: str(fl.number) || str(fl.iata),
    flightIata: str(fl.iata),
    flightDate: str(f.flight_date),
    depCity: str(dep.airport), depIata: str(dep.iata), depTz,
    depScheduled: aviationstackInstant(strOrNull(dep.scheduled), depTz),
    depActual: aviationstackInstant(strOrNull(dep.actual), depTz),
    depEstimated: aviationstackInstant(strOrNull(dep.estimated), depTz),
    depGate: str(dep.gate),
    arrCity: str(arr.airport), arrIata: str(arr.iata), arrTz,
    arrScheduled: aviationstackInstant(strOrNull(arr.scheduled), arrTz),
    arrActual: aviationstackInstant(strOrNull(arr.actual), arrTz),
    arrEstimated: aviationstackInstant(strOrNull(arr.estimated), arrTz),
    arrGate: str(arr.gate), arrBaggage: str(arr.baggage),
    status: str(f.flight_status),
  };
}

function errorCode(err: unknown): string {
  const e = obj(err);
  return `${str(e.code)} ${str(e.type)} ${str(e.info)}`.trim();
}

type QueryResult = { ok: true; flight: FlightInfo } | { error: string; restricted: boolean };

async function runQuery(key: string, fields: Record<string, string>): Promise<QueryResult> {
  const params = new URLSearchParams({ access_key: key, limit: '1', ...fields });
  try {
    const res = await fetch(`${BASE}?${params.toString()}`, { cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) return { error: 'The flight service returned no data.', restricted: false };
    if (json.error) {
      const code = errorCode(json.error);
      return { error: friendlyFlightError(code), restricted: isRestriction(code) };
    }
    const data = json.data;
    const f = Array.isArray(data) && data[0] ? (data[0] as Record<string, unknown>) : null;
    if (!f) {
      return {
        error:
          'No live data for that flight yet — the free plan tracks flights around their travel day. Enter the details manually and refresh status on the day.',
        restricted: false,
      };
    }
    return { ok: true, flight: normalize(f) };
  } catch {
    return { error: 'Couldn’t reach the flight service. Try again.', restricted: false };
  }
}

export async function lookupFlight(input: {
  flightIata?: string;
  airline?: string;
  flightNumber?: string;
  flightDate?: string;
}): Promise<LookupResponse> {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return { error: 'Flight lookup isn’t configured (set AVIATIONSTACK_API_KEY).' };

  const query = flightQueryParams(input);
  if (!query) return { error: 'Enter the airline and flight number (e.g. AS 1366).' };

  let r = await runQuery(key, query);
  // Date filtering is a paid feature; if the plan rejects it, fall back to a
  // real-time lookup (the pre-date behavior) so current flights still resolve.
  if ('error' in r && r.restricted && query.flight_date) {
    const realtime = { ...query };
    delete realtime.flight_date;
    r = await runQuery(key, realtime);
  }
  return 'ok' in r ? { ok: true, flight: r.flight } : { error: r.error };
}

// Re-query a saved flight segment by its stored flight number + date and merge
// the live status/actual times back into details.
export async function refreshFlightStatus(input: { id: string; tripId: string }): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient();
  const { data: seg } = await supabase.from('trip_segments').select('details').eq('id', input.id).maybeSingle();
  if (!seg) return { error: 'Segment not found.' };
  const details = (seg.details ?? {}) as Record<string, unknown>;
  const iata = str(details.flight_iata);
  if (!iata) return { error: 'This flight has no flight number to track. Add one by looking it up.' };

  // No live data exists before the travel day — don't spend a request on it.
  const flightDate = str(details.flight_date);
  if (flightDate && todayISO() < flightDate) {
    return { error: 'Flight status updates are available on the day of travel.' };
  }

  const r = await lookupFlight({ flightIata: iata, flightDate: flightDate || undefined });
  if ('error' in r) return { error: r.error };
  const f = r.flight;

  const merged: Record<string, unknown> = {
    ...details,
    status: f.status || details.status,
    dep_actual: f.depActual,
    dep_estimated: f.depEstimated,
    arr_actual: f.arrActual,
    arr_estimated: f.arrEstimated,
    arr_gate: f.arrGate || str(details.arr_gate),
    arr_baggage: f.arrBaggage || str(details.arr_baggage),
    status_updated: new Date().toISOString(),
  };
  const clean = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );

  // Write the cached status via a definer RPC: any family member may refresh a
  // flight, while structural segment edits stay restricted to the trip owner/admin.
  const { error } = await supabase.rpc('refresh_segment_status', { p_id: input.id, p_details: clean });
  if (error) return { error: 'Could not save the updated flight status.' };
  revalidatePath(`/trips/${input.tripId}`);
  revalidatePath('/calendar');
  return { ok: true };
}
