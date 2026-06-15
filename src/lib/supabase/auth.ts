import type { SupabaseClient, User } from '@supabase/supabase-js';

export type FamilyContext =
  | { ok: false; error: string }
  | { ok: true; user: User; familyId: string; role: 'admin' | 'viewer'; householdId: string | null };

/**
 * Resolve the signed-in user and their own family membership (role + household)
 * — the single source of truth for the "who am I and what family am I in" check
 * server actions run before mutating. Returns a tagged result so callers can
 * `if (!ctx.ok) return { error: ctx.error }` and then add an admin gate via
 * `ctx.role`.
 *
 * Note: this resolves the caller's OWN family. Checks that a specific row
 * belongs to the caller's family (resource-scoped IDOR guards) stay inline.
 */
export async function familyContext(supabase: SupabaseClient): Promise<FamilyContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You are signed out.' };

  const { data: me } = await supabase
    .from('family_members')
    .select('family_id, role, household_id')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!me) return { ok: false, error: 'You are not part of a family.' };

  return {
    ok: true,
    user,
    familyId: me.family_id as string,
    role: me.role as 'admin' | 'viewer',
    householdId: (me.household_id as string | null) ?? null,
  };
}
