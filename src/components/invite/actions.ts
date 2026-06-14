'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { FamilyRole } from '@/lib/types';

export type InviteResult = { ok: true; token?: string } | { error: string };

// Wired but non-blocking — RESEND_* are on test values, so don't depend on it
// sending. Copy-link is the primary path until email is live.
async function fireInviteEmail(supabase: SupabaseClient, invitationId: string) {
  try {
    await supabase.functions.invoke('notify', { body: { type: 'invitation', invitationId } });
  } catch {
    /* swallow */
  }
}

export async function createInvitation(input: {
  email: string;
  role: FamilyRole;
  householdId: string;
}): Promise<InviteResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };

  const { data: me } = await supabase
    .from('family_members')
    .select('family_id, role')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!me) return { error: 'You are not part of a family.' };
  if (me.role !== 'admin') return { error: 'Only admins can send invitations.' };

  const email = input.email.trim().toLowerCase();
  if (!email) return { error: 'Email is required.' };

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      family_id: me.family_id,
      email,
      role: input.role,
      household_id: input.householdId,
      invited_by: user.id,
    })
    .select('id, token')
    .single();
  if (error) return { error: error.message };

  await fireInviteEmail(supabase, data.id as string);
  revalidatePath('/invite');
  return { ok: true, token: data.token as string };
}

export async function revokeInvitation(input: { id: string }): Promise<InviteResult> {
  const supabase = createClient();
  const { error } = await supabase.from('invitations').update({ status: 'revoked' }).eq('id', input.id);
  if (error) return { error: error.message };
  revalidatePath('/invite');
  return { ok: true };
}

export async function resendInvitation(input: { id: string }): Promise<InviteResult> {
  const supabase = createClient();
  await fireInviteEmail(supabase, input.id);
  return { ok: true };
}
