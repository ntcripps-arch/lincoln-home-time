'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type FeedResult = { ok: true; token: string } | { error: string };

async function familyId(supabase: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('profile_id', userId)
    .limit(1)
    .maybeSingle();
  return (data?.family_id as string) ?? null;
}

// Mint (or return the existing) per-person feed token. Idempotent thanks to the
// unique(family_id, profile_id) constraint.
export async function enableCalendarFeed(): Promise<FeedResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };

  const existing = await supabase.from('calendar_feeds').select('token').eq('profile_id', user.id).maybeSingle();
  if (existing.data?.token) return { ok: true, token: existing.data.token as string };

  const fid = await familyId(supabase, user.id);
  if (!fid) return { error: 'You are not part of a family.' };

  const { data, error } = await supabase
    .from('calendar_feeds')
    .insert({ family_id: fid, profile_id: user.id })
    .select('token')
    .single();
  if (error) return { error: error.message };
  revalidatePath('/settings');
  return { ok: true, token: data.token as string };
}

// Invalidate the old URL and issue a fresh one (delete + re-insert gets a new
// default token without needing a crypto import).
export async function rotateCalendarFeed(): Promise<FeedResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };
  const fid = await familyId(supabase, user.id);
  if (!fid) return { error: 'You are not part of a family.' };

  await supabase.from('calendar_feeds').delete().eq('profile_id', user.id);
  const { data, error } = await supabase
    .from('calendar_feeds')
    .insert({ family_id: fid, profile_id: user.id })
    .select('token')
    .single();
  if (error) return { error: error.message };
  revalidatePath('/settings');
  return { ok: true, token: data.token as string };
}

export async function disableCalendarFeed(): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };
  const { error } = await supabase.from('calendar_feeds').delete().eq('profile_id', user.id);
  if (error) return { error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}
