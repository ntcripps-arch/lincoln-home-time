'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestType } from '@/lib/types';
import { formatDateRange, requestTypeLabel } from './request-utils';

export type ActionResult = { ok: true } | { error: string };

// Notify is wired but strictly non-blocking: a failure (RESEND on test values /
// no key) must never break the in-app flow. Recipients + templates are reviewed
// before this emails the real households.
async function fireNotify(supabase: SupabaseClient, type: string, requestId: string) {
  try {
    await supabase.functions.invoke('notify', { body: { type, requestId } });
  } catch {
    /* swallow */
  }
}

export async function submitRequest(input: {
  requestType: RequestType;
  startDate: string;
  endDate: string;
  note: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };

  const { data: membership } = await supabase
    .from('family_members')
    .select('family_id, household_id')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return { error: 'You are not part of a family.' };

  const start = input.startDate;
  const end = input.endDate && input.endDate >= start ? input.endDate : start;
  // title is NOT NULL in the schema and isn't part of the bounded form — derive a
  // readable one from the type + dates.
  const title = `${requestTypeLabel(input.requestType)} · ${formatDateRange(start, end)}`;

  const { data, error } = await supabase
    .from('time_requests')
    .insert({
      family_id: membership.family_id,
      requester_id: user.id,
      request_type: input.requestType,
      requested_household_id: membership.household_id,
      start_date: start,
      end_date: end,
      title,
      note: input.note.trim() || null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  await fireNotify(supabase, 'request_submitted', data.id as string);
  revalidatePath('/requests');
  return { ok: true };
}

// All admin decisions go through the SECURITY DEFINER RPC (enforces admin,
// materializes the exception, writes audit atomically).
export async function decideRequest(input: {
  requestId: string;
  decision: 'approve' | 'deny' | 'counter';
  note?: string;
  proposedStart?: string;
  proposedEnd?: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('decide_time_request', {
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_note: input.note?.trim() || null,
    p_proposed_start: input.proposedStart ?? null,
    p_proposed_end: input.proposedEnd ?? null,
  });
  if (error) return { error: error.message };
  await fireNotify(supabase, 'request_decided', input.requestId);
  revalidatePath('/requests');
  revalidatePath('/calendar'); // approve materializes a calendar exception
  return { ok: true };
}

// Requester accepts the other household's counter -> the requester-scoped
// accept_counter RPC finalizes using the stored proposed dates.
export async function acceptCounter(input: { requestId: string }): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('accept_counter', { p_request_id: input.requestId });
  if (error) return { error: error.message };
  await fireNotify(supabase, 'request_decided', input.requestId);
  revalidatePath('/requests');
  revalidatePath('/calendar');
  return { ok: true };
}

// Requester declines a counter = withdraws their own request. This is a
// self-update permitted by RLS (requester_id = auth.uid()), not an
// exception-materializing decision, so it does not go through the RPC.
export async function declineCounter(input: { requestId: string }): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };

  const { error } = await supabase
    .from('time_requests')
    .update({ status: 'withdrawn' })
    .eq('id', input.requestId)
    .eq('requester_id', user.id);
  if (error) return { error: error.message };
  revalidatePath('/requests');
  return { ok: true };
}
