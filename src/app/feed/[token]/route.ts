import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildCalendarICS, type FeedData } from '@/lib/ics';

// Public, unauthenticated subscribe feed. Authorization is the bearer token in
// the URL, resolved by the SECURITY DEFINER get_calendar_feed() function — this
// route never uses the service role and never reads cookies. (Allow-listed in
// middleware via the /feed prefix.)
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token.replace(/\.ics$/i, '');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.rpc('get_calendar_feed', { p_token: token });
  if (error || !data) {
    return new NextResponse('Calendar not found.', { status: 404 });
  }

  const ics = buildCalendarICS(data as unknown as FeedData);
  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="calendar.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  });
}
