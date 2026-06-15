'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { familyContext } from '@/lib/supabase/auth';

export type FeedResult = { ok: true; token: string } | { error: string };

// Mint (or return the existing) per-person feed token. Idempotent thanks to the
// unique(family_id, profile_id) constraint.
export async function enableCalendarFeed(): Promise<FeedResult> {
  const supabase = createClient();
  const ctx = await familyContext(supabase);
  if (!ctx.ok) return { error: ctx.error };

  const existing = await supabase.from('calendar_feeds').select('token').eq('profile_id', ctx.user.id).maybeSingle();
  if (existing.data?.token) return { ok: true, token: existing.data.token as string };

  const { data, error } = await supabase
    .from('calendar_feeds')
    .insert({ family_id: ctx.familyId, profile_id: ctx.user.id })
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
  const ctx = await familyContext(supabase);
  if (!ctx.ok) return { error: ctx.error };

  await supabase.from('calendar_feeds').delete().eq('profile_id', ctx.user.id);
  const { data, error } = await supabase
    .from('calendar_feeds')
    .insert({ family_id: ctx.familyId, profile_id: ctx.user.id })
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
