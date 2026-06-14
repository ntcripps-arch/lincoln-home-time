'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { SchoolCategory } from '@/lib/types';

export type SchoolResult = { ok: true } | { error: string };

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

// Intake: create the upload (pending_review), then go to its review screen.
export async function createUpload(input: { schoolYear: string; sourceText: string }): Promise<SchoolResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };
  const fid = await familyId(supabase);
  if (!fid) return { error: 'You are not part of a family.' };

  const { data, error } = await supabase
    .from('school_calendar_uploads')
    .insert({
      family_id: fid,
      school_year: input.schoolYear.trim(),
      source_text: input.sourceText.trim() || null,
      status: 'pending_review',
      uploaded_by: user.id,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  revalidatePath('/school-calendars');
  redirect(`/school-calendars/${data.id}`);
}

export async function addDate(input: {
  uploadId: string;
  date: string;
  endDate: string | null;
  category: SchoolCategory;
  title: string;
  notes: string | null;
}): Promise<SchoolResult> {
  const supabase = createClient();
  const fid = await familyId(supabase);
  if (!fid) return { error: 'You are not part of a family.' };
  if (!input.title.trim()) return { error: 'Title is required.' };

  const { error } = await supabase.from('school_calendar_dates').insert({
    upload_id: input.uploadId,
    family_id: fid,
    date: input.date,
    end_date: input.endDate,
    category: input.category,
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    status: 'proposed',
  });
  if (error) return { error: error.message };
  revalidatePath(`/school-calendars/${input.uploadId}`);
  return { ok: true };
}

export async function updateDate(input: {
  id: string;
  uploadId: string;
  date: string;
  endDate: string | null;
  category: SchoolCategory;
  title: string;
  notes: string | null;
}): Promise<SchoolResult> {
  const supabase = createClient();
  if (!input.title.trim()) return { error: 'Title is required.' };
  const { error } = await supabase
    .from('school_calendar_dates')
    .update({
      date: input.date,
      end_date: input.endDate,
      category: input.category,
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
    })
    .eq('id', input.id);
  if (error) return { error: error.message };
  revalidatePath(`/school-calendars/${input.uploadId}`);
  return { ok: true };
}

export async function deleteDate(input: { id: string; uploadId: string }): Promise<SchoolResult> {
  const supabase = createClient();
  const { error } = await supabase.from('school_calendar_dates').delete().eq('id', input.id);
  if (error) return { error: error.message };
  revalidatePath(`/school-calendars/${input.uploadId}`);
  return { ok: true };
}

// Approve flips the rows to 'approved', marks the upload active, stamps the
// approver, and writes the audit entry. Only approved dates reach the calendar.
export async function approveDates(input: { uploadId: string; ids: string[] }): Promise<SchoolResult> {
  if (input.ids.length === 0) return { error: 'Nothing selected to approve.' };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };
  const fid = await familyId(supabase);
  if (!fid) return { error: 'You are not part of a family.' };

  const { error: dErr } = await supabase
    .from('school_calendar_dates')
    .update({ status: 'approved' })
    .in('id', input.ids);
  if (dErr) return { error: dErr.message };

  const { error: uErr } = await supabase
    .from('school_calendar_uploads')
    .update({ status: 'active', approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', input.uploadId);
  if (uErr) return { error: uErr.message };

  await supabase.rpc('write_audit', {
    p_family_id: fid,
    p_action: 'school_dates_approved',
    p_entity_type: 'school_calendar_uploads',
    p_entity_id: input.uploadId,
  });

  revalidatePath(`/school-calendars/${input.uploadId}`);
  revalidatePath('/school-calendars');
  revalidatePath('/calendar'); // approved dates now render on the School layer
  return { ok: true };
}

export async function rejectDates(input: { uploadId: string; ids: string[] }): Promise<SchoolResult> {
  if (input.ids.length === 0) return { error: 'Nothing selected to reject.' };
  const supabase = createClient();
  const { error } = await supabase
    .from('school_calendar_dates')
    .update({ status: 'rejected' })
    .in('id', input.ids);
  if (error) return { error: error.message };
  revalidatePath(`/school-calendars/${input.uploadId}`);
  return { ok: true };
}
