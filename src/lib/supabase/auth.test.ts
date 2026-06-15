import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { familyContext } from './auth';

// Minimal stub of the chain familyContext uses:
//   auth.getUser() and from(...).select(...).eq(...).limit(...).maybeSingle()
function stub(user: unknown, member: unknown): SupabaseClient {
  const memberQuery = {
    select: () => memberQuery,
    eq: () => memberQuery,
    limit: () => memberQuery,
    maybeSingle: async () => ({ data: member }),
  };
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => memberQuery,
  } as unknown as SupabaseClient;
}

describe('familyContext', () => {
  it('rejects a signed-out caller', async () => {
    const ctx = await familyContext(stub(null, null));
    expect(ctx).toEqual({ ok: false, error: 'You are signed out.' });
  });

  it('rejects a user with no family membership', async () => {
    const ctx = await familyContext(stub({ id: 'u1' }, null));
    expect(ctx).toEqual({ ok: false, error: 'You are not part of a family.' });
  });

  it('returns the user, family, role, and household for a member', async () => {
    const user = { id: 'u1' };
    const ctx = await familyContext(stub(user, { family_id: 'fam1', role: 'admin', household_id: 'hh1' }));
    expect(ctx).toEqual({ ok: true, user, familyId: 'fam1', role: 'admin', householdId: 'hh1' });
  });

  it('tolerates a null household_id', async () => {
    const ctx = await familyContext(stub({ id: 'u1' }, { family_id: 'fam1', role: 'viewer', household_id: null }));
    expect(ctx.ok && ctx.householdId).toBe(null);
  });
});
