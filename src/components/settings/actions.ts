'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type SettingsResult = { ok: true } | { error: string };

// Self-edit (profiles RLS allows update where id = auth.uid()).
export async function updateProfile(input: { displayName: string; phone: string }): Promise<SettingsResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };
  if (!input.displayName.trim()) return { error: 'Display name is required.' };

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: input.displayName.trim(), phone: input.phone.trim() || null })
    .eq('id', user.id);
  if (error) return { error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}

// Stores the storage object PATH (not a URL); the bucket is private and we sign
// URLs at render time.
export async function updateAvatar(input: { path: string }): Promise<SettingsResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You are signed out.' };

  const { error } = await supabase.from('profiles').update({ avatar_url: input.path }).eq('id', user.id);
  if (error) return { error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}

// Admin-gated by households RLS (admin-write). Color is intentionally not editable.
export async function updateHousehold(input: {
  id: string;
  name: string;
  pickupDefault: string | null;
  dropoffDefault: string | null;
}): Promise<SettingsResult> {
  const supabase = createClient();
  if (!input.name.trim()) return { error: 'Household name is required.' };

  const { data, error } = await supabase
    .from('households')
    .update({
      name: input.name.trim(),
      pickup_default: input.pickupDefault?.trim() || null,
      dropoff_default: input.dropoffDefault?.trim() || null,
    })
    .eq('id', input.id)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Only an admin can edit households.' };
  revalidatePath('/settings');
  revalidatePath('/calendar'); // pickup/dropoff surface in the day sheet
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
