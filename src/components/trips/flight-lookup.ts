'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
  return {
    airline: str(al.name),
    flightNumber: str(fl.iata) || str(fl.number),
    flightIata: str(fl.iata),
    flightDate: str(f.flight_date),
    depCity: str(dep.airport), depIata: str(dep.iata), depTz: str(dep.timezone),
    depScheduled: strOrNull(dep.scheduled), depActual: strOrNull(dep.actual), depEstimated: strOrNull(dep.estimated), depGate: str(dep.gate),
    arrCity: str(arr.airport), arrIata: str(arr.iata), arrTz: str(arr.timezone),
    arrScheduled: strOrNull(arr.scheduled), arrActual: strOrNull(arr.actual), arrEstimated: strOrNull(arr.estimated), arrGate: str(arr.gate), arrBaggage: str(arr.baggage),
    status: str(f.flight_status),
  };
}

function friendlyError(err: unknown): string {
  const e = obj(err);
  const code = `${str(e.code)}${str(e.type)}`;
  if (code.includes('usage_limit') || code.includes('rate_limit')) return 'Monthly flight-lookup limit reached — enter the details manually.';
  if (code.includes('https')) return 'The flight service rejected the request (HTTPS not allowed on the free plan).';
  if (code.includes('access_key')) return 'The flight-lookup key is missing or invalid.';
  return 'The flight service returned an error — enter the details manually.';
}

export async function lookupFlight(input: { flightIata: string; flightDate?: string }): Promise<LookupResponse> {
  const key = process.env.AVIATIONSTACK_API_KEY;
  if (!key) return { error: 'Flight lookup isn’t configured (set AVIATIONSTACK_API_KEY).' };
  const iata = input.flightIata.replace(/\s+/g, '').toUpperCase();
  if (!iata) return { error: 'Enter a flight number like BA49 or UA1234.' };

  const params = new URLSearchParams({ access_key: key, flight_iata: iata, limit: '1' });
  if (input.flightDate) params.set('flight_date', input.flightDate);

  try {
    const res = await fetch(`${BASE}?${params.toString()}`, { cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) return { error: 'The flight service returned no data.' };
    if (json.error) return { error: friendlyError(json.error) };
    const data = json.data;
    const f = Array.isArray(data) && data[0] ? (data[0] as Record<string, unknown>) : null;
    if (!f) {
      return {
        error:
          'No live data for that flight yet — the free plan tracks flights around their travel day. Enter the details manually and refresh status on the day.',
      };
    }
    return { ok: true, flight: normalize(f) };
  } catch {
    return { error: 'Couldn’t reach the flight service. Try again.' };
  }
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

  const r = await lookupFlight({ flightIata: iata, flightDate: str(details.flight_date) || undefined });
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

  const { error } = await supabase.from('trip_segments').update({ details: clean }).eq('id', input.id);
  if (error) return { error: error.message };
  revalidatePath(`/trips/${input.tripId}`);
  revalidatePath('/calendar');
  return { ok: true };
}
