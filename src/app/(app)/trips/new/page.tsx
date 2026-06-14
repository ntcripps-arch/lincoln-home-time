import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { todayISO } from '@/lib/dates';
import { TripForm } from '@/components/trips/trip-form';

export default async function NewTripPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!me) redirect('/trips');
  const familyId = me!.family_id as string;

  const [hhRes, reqRes] = await Promise.all([
    supabase.from('households').select('id, name').eq('family_id', familyId).order('sort_order'),
    supabase.from('time_requests').select('id, title').eq('family_id', familyId).eq('status', 'approved'),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/trips" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Trips
      </Link>
      <h1 className="text-xl font-semibold text-foreground">New trip</h1>
      <TripForm
        mode="create"
        households={(hhRes.data ?? []) as { id: string; name: string }[]}
        requests={(reqRes.data ?? []) as { id: string; title: string }[]}
        today={todayISO()}
      />
    </div>
  );
}
