import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { todayISO } from '@/lib/dates';
import { CalendarView } from '@/components/calendar/calendar-view';
import type { ExceptionRow, Household, ScheduleRule } from '@/lib/types';
import type { ManualEventRow, SchoolDateRow, SeriesRow, TripWithSegments } from '@/components/calendar/calendar-utils';

export default async function CalendarPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('family_members')
    .select('family_id, role')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">You are not part of a family yet.</p>
      </div>
    );
  }
  const familyId = membership.family_id as string;

  // All reads are RLS-scoped to this signed-in user.
  const [householdsRes, planRes, exceptionsRes, schoolRes, eventsRes, seriesRes, tripsRes] = await Promise.all([
    supabase.from('households').select('*').eq('family_id', familyId).order('sort_order'),
    supabase.from('parenting_plan_versions').select('id').eq('family_id', familyId).eq('status', 'active').maybeSingle(),
    supabase.from('exceptions').select('*').eq('family_id', familyId),
    supabase
      .from('school_calendar_dates')
      .select('id,date,end_date,category,title,notes')
      .eq('family_id', familyId)
      .eq('status', 'approved'),
    supabase
      .from('manual_events')
      .select('id,title,date,start_time,end_time,all_day,location,notes,category,created_by,series_id')
      .eq('family_id', familyId),
    supabase
      .from('manual_event_series')
      .select('id,title,category,location,notes,all_day,start_time,end_time,weekdays,start_date,end_date')
      .eq('family_id', familyId),
    supabase.from('trips').select('*, trip_segments(*)').eq('family_id', familyId),
  ]);

  // Load every rule on the active plan version (base rotation + overrides); the
  // engine layers them by priority.
  let rules: ScheduleRule[] = [];
  if (planRes.data?.id) {
    const { data } = await supabase
      .from('parenting_schedule_rules')
      .select('*')
      .eq('plan_version_id', planRes.data.id);
    rules = (data ?? []) as ScheduleRule[];
  }

  const today = todayISO();
  const [y, m] = today.split('-').map(Number);

  return (
    <CalendarView
      households={(householdsRes.data ?? []) as Household[]}
      rules={rules}
      exceptions={(exceptionsRes.data ?? []) as ExceptionRow[]}
      schoolDates={(schoolRes.data ?? []) as SchoolDateRow[]}
      events={(eventsRes.data ?? []) as ManualEventRow[]}
      series={(seriesRes.data ?? []) as SeriesRow[]}
      trips={(tripsRes.data ?? []) as TripWithSegments[]}
      hasActivePlan={Boolean(planRes.data?.id)}
      currentUserId={user.id}
      isAdmin={(membership.role as string) === 'admin'}
      today={today}
      initialYear={y}
      initialMonth={m}
    />
  );
}
