'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { FAMILY_TZ, fromLocalInput, fromZonedInput } from '@/lib/dates';
import type { SegmentType } from '@/lib/types';

export type TripResult = { ok: true } | { error: string };

async function familyId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();
  return (data?.family_id as string) ?? null;
}

// Wired but non-blocking — RESEND_* on test values.
async function fireTripEmail(supabase: SupabaseClient, tripId: string) {
  try {
    await supabase.functions.invoke('notify', { body: { type: 'trip_added', tripId } });
  } catch {
    /* swallow */
  }
}

interface TripInput {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelingHouseholdId: string;
  notes: string;
  linkedRequestId: string;
}

function normalizeTrip(input: TripInput) {
  const start = input.startDate;
  const end = input.endDate && input.endDate >= start ? input.endDate : start;
  return {
    title: input.title.trim(),
    destination: input.destination.trim() || null,
    start_date: start,
    end_date: end,
    traveling_household_id: input.travelingHouseholdId || null,
    notes: input.notes.trim() || null,
    linked_request_id: input.linkedRequestId || null,
  };
}

export async function createTrip(input: TripInput): Promise<TripResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };
  const fid = await familyId(supabase);
  if (!fid) return { error: 'You are not part of a family.' };
  if (!input.title.trim()) return { error: 'Title is required.' };

  const { data, error } = await supabase
    .from('trips')
    .insert({ family_id: fid, created_by: user.id, ...normalizeTrip(input) })
    .select('id')
    .single();
  if (error) return { error: error.message };

  await fireTripEmail(supabase, data.id as string);
  revalidatePath('/trips');
  redirect(`/trips/${data.id}`);
}

export async function updateTrip(input: TripInput & { id: string }): Promise<TripResult> {
  const supabase = createClient();
  if (!input.title.trim()) return { error: 'Title is required.' };
  const { error } = await supabase.from('trips').update(normalizeTrip(input)).eq('id', input.id);
  if (error) return { error: error.message };
  revalidatePath('/trips');
  revalidatePath(`/trips/${input.id}`);
  revalidatePath('/calendar');
  return { ok: true };
}

export async function deleteTrip(input: { id: string }): Promise<TripResult> {
  const supabase = createClient();
  const { error } = await supabase.from('trips').delete().eq('id', input.id);
  if (error) return { error: error.message };
  revalidatePath('/trips');
  revalidatePath('/calendar');
  redirect('/trips');
}

interface SegmentInput {
  tripId: string;
  segmentType: SegmentType;
  confirmation: string;
  // non-flight
  title: string;
  startLocal: string;
  endLocal: string;
  location: string;
  room: string;
  // flight (each endpoint carries its own IANA tz)
  airline: string;
  flightNumber: string;
  flightIata: string;
  flightDate: string;
  depCity: string;
  depIata: string;
  depTz: string;
  depLocal: string;
  arrCity: string;
  arrIata: string;
  arrTz: string;
  arrLocal: string;
  status: string;
  depActual: string;
  depEstimated: string;
  arrActual: string;
  arrEstimated: string;
  depGate: string;
  arrGate: string;
  arrBaggage: string;
}

const cleanDetails = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v.trim() !== ''));

function normalizeSegment(input: SegmentInput) {
  if (input.segmentType === 'flight') {
    const title =
      [input.airline, input.flightNumber].map((x) => x.trim()).filter(Boolean).join(' ') ||
      input.flightIata.trim() ||
      'Flight';
    const location = [input.depCity.trim(), input.arrCity.trim()].filter(Boolean).join(' → ') || null;
    return {
      segment_type: 'flight' as const,
      title,
      // Each endpoint's wall-clock is interpreted in its own airport timezone.
      start_at: input.depLocal ? fromZonedInput(input.depLocal, input.depTz || FAMILY_TZ) : null,
      end_at: input.arrLocal ? fromZonedInput(input.arrLocal, input.arrTz || FAMILY_TZ) : null,
      location,
      confirmation: input.confirmation.trim() || null,
      details: cleanDetails({
        airline: input.airline,
        flight_number: input.flightNumber,
        flight_iata: input.flightIata,
        flight_date: input.flightDate,
        dep_city: input.depCity,
        dep_iata: input.depIata,
        dep_tz: input.depTz,
        arr_city: input.arrCity,
        arr_iata: input.arrIata,
        arr_tz: input.arrTz,
        status: input.status,
        dep_actual: input.depActual,
        dep_estimated: input.depEstimated,
        arr_actual: input.arrActual,
        arr_estimated: input.arrEstimated,
        dep_gate: input.depGate,
        arr_gate: input.arrGate,
        arr_baggage: input.arrBaggage,
      }),
    };
  }

  return {
    segment_type: input.segmentType,
    title: input.title.trim() || null,
    start_at: input.startLocal ? fromLocalInput(input.startLocal) : null,
    end_at: input.endLocal ? fromLocalInput(input.endLocal) : null,
    location: input.location.trim() || null,
    confirmation: input.confirmation.trim() || null,
    details: input.segmentType === 'lodging' ? cleanDetails({ room: input.room }) : {},
  };
}

export async function addSegment(input: SegmentInput): Promise<TripResult> {
  const supabase = createClient();
  const fid = await familyId(supabase);
  if (!fid) return { error: 'You are not part of a family.' };

  const { data: maxRow } = await supabase
    .from('trip_segments')
    .select('sort_order')
    .eq('trip_id', input.tripId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((maxRow?.sort_order as number) ?? -1) + 1;

  const { error } = await supabase
    .from('trip_segments')
    .insert({ trip_id: input.tripId, family_id: fid, sort_order: sortOrder, ...normalizeSegment(input) });
  if (error) return { error: error.message };
  revalidatePath(`/trips/${input.tripId}`);
  revalidatePath('/calendar');
  return { ok: true };
}

export async function updateSegment(input: SegmentInput & { id: string }): Promise<TripResult> {
  const supabase = createClient();
  const { error } = await supabase.from('trip_segments').update(normalizeSegment(input)).eq('id', input.id);
  if (error) return { error: error.message };
  revalidatePath(`/trips/${input.tripId}`);
  revalidatePath('/calendar');
  return { ok: true };
}

export async function deleteSegment(input: { id: string; tripId: string }): Promise<TripResult> {
  const supabase = createClient();
  const { error } = await supabase.from('trip_segments').delete().eq('id', input.id);
  if (error) return { error: error.message };
  revalidatePath(`/trips/${input.tripId}`);
  revalidatePath('/calendar');
  return { ok: true };
}
