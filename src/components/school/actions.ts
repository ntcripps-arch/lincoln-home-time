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

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB (bucket cap is 25 MB; Claude allows 32 MB)

// Intake: upload the calendar PDF, create the upload row (pending_review), then
// go to its review screen where the admin runs vision extraction.
export async function createUpload(formData: FormData): Promise<SchoolResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };
  const fid = await familyId(supabase);
  if (!fid) return { error: 'You are not part of a family.' };

  const schoolYear = String(formData.get('schoolYear') ?? '').trim();
  const file = formData.get('file');
  if (!schoolYear) return { error: 'School year is required.' };
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a PDF to upload.' };
  if (file.type !== 'application/pdf') return { error: 'The calendar must be a PDF.' };
  if (file.size > MAX_PDF_BYTES) return { error: 'That PDF is too large (max 25 MB).' };

  const { data: upload, error: insErr } = await supabase
    .from('school_calendar_uploads')
    .insert({ family_id: fid, school_year: schoolYear, status: 'pending_review', uploaded_by: user.id })
    .select('id')
    .single();
  if (insErr) return { error: insErr.message };

  const path = `${fid}/${upload.id}.pdf`;
  const { error: upErr } = await supabase.storage
    .from('school-calendars')
    .upload(path, await file.arrayBuffer(), { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    // Don't leave an upload row with no file behind.
    await supabase.from('school_calendar_uploads').delete().eq('id', upload.id);
    return { error: upErr.message };
  }

  const { error: updErr } = await supabase
    .from('school_calendar_uploads')
    .update({ file_path: path })
    .eq('id', upload.id);
  if (updErr) return { error: updErr.message };

  revalidatePath('/school-calendars');
  redirect(`/school-calendars/${upload.id}`);
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
  const { data, error } = await supabase
    .from('school_calendar_dates')
    .update({
      date: input.date,
      end_date: input.endDate,
      category: input.category,
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
    })
    .eq('id', input.id)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Date not found or you lack permission to edit it.' };
  revalidatePath(`/school-calendars/${input.uploadId}`);
  return { ok: true };
}

export async function deleteDate(input: { id: string; uploadId: string }): Promise<SchoolResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('school_calendar_dates')
    .delete()
    .eq('id', input.id)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Date not found or you lack permission to delete it.' };
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

  const { data: approved, error: dErr } = await supabase
    .from('school_calendar_dates')
    .update({ status: 'approved' })
    .in('id', input.ids)
    .select('id');
  if (dErr) return { error: dErr.message };
  if (!approved?.length) return { error: 'You do not have permission to approve these dates.' };

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
  const { data, error } = await supabase
    .from('school_calendar_dates')
    .update({ status: 'rejected' })
    .in('id', input.ids)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'You do not have permission to reject these dates.' };
  revalidatePath(`/school-calendars/${input.uploadId}`);
  return { ok: true };
}
