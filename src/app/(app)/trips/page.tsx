import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { todayISO } from '@/lib/dates';
import { primaryButtonClass } from '@/components/auth/field-styles';
import { formatTripRange } from '@/components/trips/trip-utils';

interface TripRow {
  id: string;
  title: string;
  destination: string | null;
  start_date: string;
  end_date: string;
  traveling_household_id: string | null;
}

export default async function TripsPage() {
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
  if (!me) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">You are not part of a family yet.</p>
      </div>
    );
  }
  const familyId = me.family_id as string;

  const [tripsRes, hhRes, segRes] = await Promise.all([
    supabase
      .from('trips')
      .select('id, title, destination, start_date, end_date, traveling_household_id')
      .eq('family_id', familyId),
    supabase.from('households').select('id, color').eq('family_id', familyId),
    supabase.from('trip_segments').select('trip_id').eq('family_id', familyId),
  ]);

  const trips = (tripsRes.data ?? []) as TripRow[];
  const colorByHousehold = new Map((hhRes.data ?? []).map((h) => [h.id as string, h.color as string]));
  const segCount = new Map<string, number>();
  for (const s of (segRes.data ?? []) as { trip_id: string }[]) {
    segCount.set(s.trip_id, (segCount.get(s.trip_id) ?? 0) + 1);
  }

  const today = todayISO();
  const upcoming = trips
    .filter((t) => t.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = trips
    .filter((t) => t.end_date < today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Trips</h1>
      <Link href="/trips/new" className={primaryButtonClass}>
        <Plus className="h-5 w-5" />
        New trip
      </Link>

      {trips.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          No trips yet.
        </p>
      ) : (
        <div className="space-y-5">
          {upcoming.length > 0 && <TripGroup label="Upcoming" trips={upcoming} colorByHousehold={colorByHousehold} segCount={segCount} />}
          {past.length > 0 && <TripGroup label="Past" trips={past} colorByHousehold={colorByHousehold} segCount={segCount} />}
        </div>
      )}
    </div>
  );
}

function TripGroup({
  label,
  trips,
  colorByHousehold,
  segCount,
}: {
  label: string;
  trips: TripRow[];
  colorByHousehold: Map<string, string>;
  segCount: Map<string, number>;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
      <ul className="space-y-3">
        {trips.map((t) => {
          const color = t.traveling_household_id ? colorByHousehold.get(t.traveling_household_id) : null;
          const n = segCount.get(t.id) ?? 0;
          return (
            <li key={t.id}>
              <Link
                href={`/trips/${t.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
                    <span className="truncate text-sm font-semibold text-foreground">{t.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatTripRange(t.start_date, t.end_date)}
                    {t.destination ? ` · ${t.destination}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {n} segment{n === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
