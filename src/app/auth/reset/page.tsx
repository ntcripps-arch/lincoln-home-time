import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { primaryButtonClass } from '@/components/auth/field-styles';

// Outside the (app) shell. Reached after /auth/callback establishes a recovery
// session. If there's no session (link expired / opened cold), show a way back.
export default async function ResetPasswordPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 pb-safe pt-safe">
      <div className="space-y-6 py-10">
        <header className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Set a new password</h1>
          <p className="text-sm text-muted-foreground">
            {user
              ? 'Choose a new password for your account.'
              : 'This reset link is invalid or has expired.'}
          </p>
        </header>
        {user ? (
          <ResetPasswordForm />
        ) : (
          <Link href="/login" className={primaryButtonClass}>
            Back to sign in
          </Link>
        )}
      </div>
    </main>
  );
}
