import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Single PKCE code-exchange endpoint for BOTH flows:
//   • magic-link  → emailRedirectTo = /auth/callback        → next defaults to /calendar
//   • recovery    → redirectTo      = /auth/callback?next=/auth/reset
// `next` is constrained to same-origin paths to avoid an open redirect.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const requested = searchParams.get('next') ?? '/calendar';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/calendar';

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  const message = 'That sign-in link is invalid or has expired. Please try again.';
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
}
