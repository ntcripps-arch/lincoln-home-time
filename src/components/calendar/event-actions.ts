'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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

// RLS allows update/delete by the creator or a family admin.
export async function updateEvent(input: EventInput & { id: string }): Promise<EventResult> {
  const supabase = createClient();
  if (!input.title.trim()) return { error: 'Title is required.' };
  const { error } = await supabase.from('manual_events').update(normalize(input)).eq('id', input.id);
  if (error) return { error: error.message };
  revalidatePath('/calendar');
  return { ok: true };
}

export async function deleteEvent(input: { id: string }): Promise<EventResult> {
  const supabase = createClient();
  const { error } = await supabase.from('manual_events').delete().eq('id', input.id);
  if (error) return { error: error.message };
  revalidatePath('/calendar');
  return { ok: true };
}
