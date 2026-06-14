import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { RequestCard, type RequestView } from '@/components/requests/request-card';
import { SubmitRequest } from '@/components/requests/submit-request';
import type { RequestRow } from '@/components/requests/request-utils';

type Membership = { family_id: string; household_id: string | null; role: 'admin' | 'viewer' };

export default async function RequestsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: meData } = await supabase
    .from('family_members')
    .select('family_id, household_id, role')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();
  const me = meData as Membership | null;

  if (!me) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">You are not part of a family yet.</p>
      </div>
    );
  }

  const [reqRes, membersRes, householdsRes] = await Promise.all([
    supabase.from('time_requests').select('*').eq('family_id', me.family_id),
    // Display names come through the family_members embed so we never read the
    // whole profiles table — only this family's members.
    supabase
      .from('family_members')
      .select('profile_id, household_id, role, profiles(display_name)')
      .eq('family_id', me.family_id),
    supabase.from('households').select('id, name, color').eq('family_id', me.family_id),
  ]);

  if (reqRes.error) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">Couldn’t load requests. Please try again.</p>
      </div>
    );
  }

  const requests = (reqRes.data ?? []) as RequestRow[];
  // PostgREST returns the to-one `profiles` embed as an object at runtime; the
  // generated types call it an array, so cast through unknown.
  const members = (membersRes.data ?? []) as unknown as {
    profile_id: string;
    household_id: string | null;
    profiles: { display_name: string | null } | null;
  }[];
  const householdById = new Map((householdsRes.data ?? []).map((h) => [h.id as string, h]));
  const householdByProfile = new Map(members.map((m) => [m.profile_id, m.household_id]));
  const nameByProfile = new Map(members.map((m) => [m.profile_id, m.profiles?.display_name ?? 'A parent']));

  const myHouseholdName = me.household_id ? householdById.get(me.household_id)?.name ?? null : null;

  // Active (pending / countered) first, then closed — each newest first.
  const rank = (s: string) => (s === 'pending' || s === 'countered' ? 0 : 1);
  const sorted = [...requests].sort((a, b) => {
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    const ad = a.decided_at ?? a.created_at;
    const bd = b.decided_at ?? b.created_at;
    return ad < bd ? 1 : ad > bd ? -1 : 0;
  });

  const views: RequestView[] = sorted.map((r) => {
    const reqHouseholdId = householdByProfile.get(r.requester_id) ?? null;
    const isOtherHousehold = Boolean(me.household_id && reqHouseholdId && reqHouseholdId !== me.household_id);
    return {
      request: r,
      requesterName: nameByProfile.get(r.requester_id) ?? 'A parent',
      requesterColor: reqHouseholdId ? householdById.get(reqHouseholdId)?.color ?? null : null,
      caps: {
        // The other household decides (any role) — matches the cross-household RPC gate.
        canDecide: isOtherHousehold && r.status === 'pending',
        canRespondCounter: r.requester_id === user.id && r.status === 'countered',
      },
    };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Requests</h1>
      <SubmitRequest householdName={myHouseholdName} />

      {views.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          No time requests yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {views.map((v) => (
            <RequestCard key={v.request.id} {...v} />
          ))}
        </ul>
      )}
    </div>
  );
}
