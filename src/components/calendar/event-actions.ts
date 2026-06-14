'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { occurrenceDates } from './calendar-utils';

export type EventResult = { ok: true } | { error: string };

export interface EventInput {
  title: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  category: string;
  notes: string;
}

function normalize(input: EventInput) {
  return {
    title: input.title.trim(),
    date: input.date,
    all_day: input.allDay,
    // Wall-clock text, stored verbatim (DESIGN.md tz rule). Cleared when all-day.
    start_time: input.allDay ? null : input.startTime || null,
    end_time: input.allDay ? null : input.endTime || null,
    location: input.location.trim() || null,
    category: input.category,
    notes: input.notes.trim() || null,
  };
}

// Any family member can add an event (RLS: created_by = auth.uid()).
export async function createEvent(input: EventInput): Promise<EventResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };
  if (!input.title.trim()) return { error: 'Title is required.' };

  const { data: me } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!me) return { error: 'You are not part of a family.' };

  const { error } = await supabase
    .from('manual_events')
    .insert({ family_id: me.family_id, created_by: user.id, ...normalize(input) });
  if (error) return { error: error.message };
  revalidatePath('/calendar');
  return { ok: true };
}

// RLS allows update/delete by the creator or a family admin. Editing one
// occurrence marks it overridden so a later series regenerate preserves it.
export async function updateEvent(input: EventInput & { id: string }): Promise<EventResult> {
  const supabase = createClient();
  if (!input.title.trim()) return { error: 'Title is required.' };
  const { data, error } = await supabase
    .from('manual_events')
    .update({ ...normalize(input), overridden: true })
    .eq('id', input.id)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Event not found or you lack permission to edit it.' };
  revalidatePath('/calendar');
  return { ok: true };
}

export async function deleteEvent(input: { id: string }): Promise<EventResult> {
  const supabase = createClient();
  const { data, error } = await supabase.from('manual_events').delete().eq('id', input.id).select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Event not found or you lack permission to delete it.' };
  revalidatePath('/calendar');
  return { ok: true };
}

// ---- Recurring events ------------------------------------------------------
export interface RecurInput {
  title: string;
  category: string;
  location: string;
  notes: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  weekdays: number[];
  startDate: string;
  endDate: string;
}

function seriesFields(input: RecurInput, familyId: string) {
  return {
    family_id: familyId,
    title: input.title.trim(),
    category: input.category,
    location: input.location.trim() || null,
    notes: input.notes.trim() || null,
    all_day: input.allDay,
    start_time: input.allDay ? null : input.startTime || null,
    end_time: input.allDay ? null : input.endTime || null,
    weekdays: input.weekdays,
    start_date: input.startDate,
    end_date: input.endDate,
  };
}

function occurrenceRows(input: RecurInput, familyId: string, userId: string, seriesId: string, dates: string[]) {
  return dates.map((d) => ({
    family_id: familyId,
    created_by: userId,
    series_id: seriesId,
    overridden: false,
    title: input.title.trim(),
    date: d,
    all_day: input.allDay,
    start_time: input.allDay ? null : input.startTime || null,
    end_time: input.allDay ? null : input.endTime || null,
    location: input.location.trim() || null,
    notes: input.notes.trim() || null,
    category: input.category,
  }));
}

function validateRecur(input: RecurInput): string | null {
  if (!input.title.trim()) return 'Title is required.';
  if (!input.weekdays.length) return 'Pick at least one day of the week.';
  if (input.endDate < input.startDate) return 'The repeat-until date is before the start date.';
  return null;
}

export async function createRecurringEvent(input: RecurInput): Promise<EventResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };
  const v = validateRecur(input);
  if (v) return { error: v };

  const { data: me } = await supabase.from('family_members').select('family_id').eq('profile_id', user.id).limit(1).maybeSingle();
  if (!me) return { error: 'You are not part of a family.' };
  const fid = me.family_id as string;

  const dates = occurrenceDates(input.weekdays, input.startDate, input.endDate);
  if (!dates.length) return { error: 'That range has no matching days.' };

  const { data: series, error: sErr } = await supabase
    .from('manual_event_series')
    .insert({ ...seriesFields(input, fid), created_by: user.id })
    .select('id')
    .single();
  if (sErr) return { error: sErr.message };

  const { error: oErr } = await supabase
    .from('manual_events')
    .insert(occurrenceRows(input, fid, user.id, series.id as string, dates));
  if (oErr) return { error: oErr.message };

  revalidatePath('/calendar');
  return { ok: true };
}

export async function updateSeries(input: RecurInput & { seriesId: string }): Promise<EventResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };
  const v = validateRecur(input);
  if (v) return { error: v };

  const { data: me } = await supabase.from('family_members').select('family_id').eq('profile_id', user.id).limit(1).maybeSingle();
  if (!me) return { error: 'You are not part of a family.' };
  const fid = me.family_id as string;

  const { data: updatedSeries, error: sErr } = await supabase
    .from('manual_event_series')
    .update(seriesFields(input, fid))
    .eq('id', input.seriesId)
    .select('id');
  if (sErr) return { error: sErr.message };
  if (!updatedSeries?.length) return { error: 'Series not found or you lack permission to edit it.' };

  // Keep individually-edited occurrences; regenerate the rest.
  const { data: kept } = await supabase
    .from('manual_events')
    .select('date')
    .eq('series_id', input.seriesId)
    .eq('overridden', true);
  const keepDates = new Set((kept ?? []).map((r) => r.date as string));

  const { error: dErr } = await supabase.from('manual_events').delete().eq('series_id', input.seriesId).eq('overridden', false);
  if (dErr) return { error: dErr.message };

  const dates = occurrenceDates(input.weekdays, input.startDate, input.endDate).filter((d) => !keepDates.has(d));
  if (dates.length) {
    const { error: oErr } = await supabase
      .from('manual_events')
      .insert(occurrenceRows(input, fid, user.id, input.seriesId, dates));
    if (oErr) return { error: oErr.message };
  }

  revalidatePath('/calendar');
  return { ok: true };
}

export async function deleteSeries(input: { seriesId: string }): Promise<EventResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('manual_event_series')
    .delete()
    .eq('id', input.seriesId)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Series not found or you lack permission to delete it.' };
  revalidatePath('/calendar');
  return { ok: true };
}
