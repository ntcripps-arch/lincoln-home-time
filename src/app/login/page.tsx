import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginForm } from '@/components/auth/login-form';

// Outside the (app) shell — no top bar / bottom nav on the sign-in screen.
export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/calendar');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 pb-safe pt-safe">
      <div className="py-10">
        <LoginForm initialError={searchParams?.error} />
      </div>
    </main>
  );
}
