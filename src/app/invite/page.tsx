import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell/app-shell';
import { AcceptInvite } from '@/components/invite/accept-invite';
import { AdminInvite, type InvitationRow } from '@/components/invite/admin-invite';

interface Preview {
  valid: boolean;
  family_name: string | null;
  role: string | null;
  household_name: string | null;
  email: string | null;
}

export default async function InvitePage({ searchParams }: { searchParams: { token?: string } }) {
  const supabase = createClient();
  const token = searchParams.token;

  // Public accept flow (works signed-in or not). Outside the shell, like /login.
  if (token) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data } = await supabase.rpc('preview_invitation', { p_token: token });
    const preview = (Array.isArray(data) ? data[0] : null) as Preview | null;
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 pb-safe pt-safe">
        <div className="py-10">
          <AcceptInvite token={token} preview={preview} userEmail={user?.email ?? null} />
        </div>
      </main>
    );
  }

  // Admin management UI.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase
    .from('family_members')
    .select('family_id, role')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!me || me.role !== 'admin') {
    return (
      <AppShell>
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">Only family admins can manage invitations.</p>
        </div>
      </AppShell>
    );
  }
  const familyId = me.family_id as string;

  const [hhRes, invRes] = await Promise.all([
    supabase.from('households').select('id, name').eq('family_id', familyId).order('sort_order'),
    supabase
      .from('invitations')
      .select('id, email, role, household_id, status, token, created_at, expires_at')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false }),
  ]);

  const households = (hhRes.data ?? []) as { id: string; name: string }[];
  const invitations = (invRes.data ?? []) as InvitationRow[];

  return (
    <AppShell>
      <AdminInvite households={households} invitations={invitations} />
    </AppShell>
  );
}
