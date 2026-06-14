import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { todayISO } from '@/lib/dates';
import { TripForm } from '@/components/trips/trip-form';
import { SegmentList } from '@/components/trips/segment-list';
import type { TripSegment } from '@/lib/types';

export default async function TripDetailPage({ params }: { params: { id: string } }) {
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

  const { data: trip } = await supabase
    .from('trips')
    .select('id, title, destination, start_date, end_date, traveling_household_id, notes, linked_request_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!trip) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">That trip could not be found.</p>
        <Link href="/trips" className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
          Back to trips
        </Link>
      </div>
    );
  }

  const [hhRes, reqRes, segRes] = await Promise.all([
    supabase.from('households').select('id, name').eq('family_id', familyId).order('sort_order'),
    supabase.from('time_requests').select('id, title').eq('family_id', familyId).eq('status', 'approved'),
    supabase
      .from('trip_segments')
      .select('id, trip_id, segment_type, title, start_at, end_at, location, confirmation, details, sort_order')
      .eq('trip_id', params.id)
      .order('sort_order'),
  ]);

  return (
    <div className="space-y-5">
      <Link href="/trips" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Trips
      </Link>
      <h1 className="text-xl font-semibold text-foreground">{trip.title}</h1>

      <TripForm
        mode="edit"
        households={(hhRes.data ?? []) as { id: string; name: string }[]}
        requests={(reqRes.data ?? []) as { id: string; title: string }[]}
        trip={trip as Parameters<typeof TripForm>[0]['trip']}
        today={todayISO()}
      />

      <SegmentList tripId={trip.id as string} segments={(segRes.data ?? []) as TripSegment[]} />
    </div>
  );
}
