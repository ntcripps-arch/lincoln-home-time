import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GraduationCap, UserPlus, Upload } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Household } from '@/lib/types';
import { Avatar } from '@/components/settings/avatar';
import { CalendarFeed } from '@/components/settings/calendar-feed';
import { HouseholdsForm } from '@/components/settings/households-form';
import { ProfileForm } from '@/components/settings/profile-form';
import { signOut } from '@/components/settings/actions';

// Sign every avatar path in ONE Storage round-trip; returns path -> signed URL.
async function signAvatars(
  supabase: SupabaseClient,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(paths.filter((p): p is string => Boolean(p))));
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data } = await supabase.storage.from('avatars').createSignedUrls(unique, 3600);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
  }
  return map;
}

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const { data: me } = await supabase
    .from('family_members')
    .select('family_id, household_id, role')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();

  const familyId = me?.family_id as string | undefined;
  const isAdmin = me?.role === 'admin';

  let households: Household[] = [];
  let roster: { profile_id: string; role: string; name: string; color: string | null; avatar: string | null }[] = [];
  let avatarByPath = new Map<string, string>();

  if (familyId) {
    const [hhRes, rosterRes] = await Promise.all([
      supabase.from('households').select('*').eq('family_id', familyId).order('sort_order'),
      supabase
        .from('family_members')
        .select('profile_id, household_id, role, profiles(display_name, avatar_url)')
        .eq('family_id', familyId),
    ]);
    households = (hhRes.data ?? []) as Household[];
    const colorByHousehold = new Map(households.map((h) => [h.id, h.color]));

    // PostgREST returns the to-one `profiles` embed as an object at runtime;
    // supabase-js types it as an array, so cast through unknown.
    const members = (rosterRes.data ?? []) as unknown as {
      profile_id: string;
      household_id: string | null;
      role: string;
      profiles: { display_name: string | null; avatar_url: string | null } | null;
    }[];
    const signed = await signAvatars(supabase, [
      ...members.map((m) => m.profiles?.avatar_url),
      profile?.avatar_url,
    ]);
    roster = members.map((m) => ({
      profile_id: m.profile_id,
      role: m.role,
      name: m.profiles?.display_name ?? 'Member',
      color: m.household_id ? colorByHousehold.get(m.household_id) ?? null : null,
      avatar: (m.profiles?.avatar_url && signed.get(m.profiles.avatar_url)) || null,
    }));
    avatarByPath = signed;
  } else if (profile?.avatar_url) {
    avatarByPath = await signAvatars(supabase, [profile.avatar_url]);
  }

  const myAvatar = (profile?.avatar_url && avatarByPath.get(profile.avatar_url)) || null;

  const { data: feed } = await supabase.from('calendar_feeds').select('token').eq('profile_id', user.id).maybeSingle();

  const linkClass =
    'flex min-h-[2.75rem] items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>

      <ProfileForm
        userId={user.id}
        displayName={profile?.display_name ?? ''}
        phone={profile?.phone ?? ''}
        avatarUrl={myAvatar}
      />

      {isAdmin && households.length > 0 && <HouseholdsForm households={households} />}

      <CalendarFeed initialToken={(feed?.token as string | undefined) ?? null} />

      {roster.length > 0 && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">Family</h2>
          <ul className="space-y-3">
            {roster.map((m) => (
              <li key={m.profile_id} className="flex items-center gap-3">
                <Avatar src={m.avatar} name={m.name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {m.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />}
                    <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
                  </div>
                </div>
                <span className="shrink-0 text-xs capitalize text-muted-foreground">{m.role}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">Manage</h2>
          <p className="text-sm text-muted-foreground">
            Admin tools that don&apos;t have their own tab.
          </p>
          <div className="flex flex-col gap-2">
            <Link href="/invite" className={linkClass}>
              <UserPlus className="h-4 w-4" />
              Invite a family member
            </Link>
            <Link href="/school-calendars" className={linkClass}>
              <GraduationCap className="h-4 w-4" />
              Review school calendars
            </Link>
            <Link href="/uploads" className={linkClass}>
              <Upload className="h-4 w-4" />
              New upload
            </Link>
          </div>
        </section>
      )}

      <form action={signOut}>
        <button
          type="submit"
          className="min-h-[3rem] w-full rounded-lg border border-border bg-card px-4 text-base font-semibold text-foreground transition hover:bg-muted"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
