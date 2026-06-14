'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { alertClass, fieldClass, infoClass, linkButtonClass, primaryButtonClass } from '@/components/auth/field-styles';

interface Preview {
  valid: boolean;
  family_name: string | null;
  role: string | null;
  household_name: string | null;
  email: string | null;
}

export function AcceptInvite({
  token,
  preview,
  userEmail,
}: {
  token: string;
  preview: Preview | null;
  userEmail: string | null;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!preview?.valid) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Invitation unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This invitation link is invalid or has expired. Ask a family admin to send a new one.
        </p>
        <Link href="/login" className={primaryButtonClass}>
          Go to sign in
        </Link>
      </div>
    );
  }

  const inviteEmail = preview.email ?? '';
  const headline = `You've been invited to ${preview.family_name} as ${preview.role}${
    preview.household_name ? ` (${preview.household_name})` : ''
  }.`;

  function acceptNow() {
    setError(null);
    startTransition(async () => {
      const { error: accErr } = await supabase.rpc('accept_invitation', { p_token: token });
      if (accErr) {
        setError(accErr.message);
        return;
      }
      router.replace('/calendar');
      router.refresh();
    });
  }

  async function useDifferentAccount() {
    await supabase.auth.signOut();
    router.refresh();
  }

  function authThenAccept(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode === 'create' && password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    startTransition(async () => {
      if (mode === 'signin') {
        const { error: e1 } = await supabase.auth.signInWithPassword({ email: inviteEmail, password });
        if (e1) {
          setError(e1.message);
          return;
        }
      } else {
        const { data, error: e2 } = await supabase.auth.signUp({ email: inviteEmail, password });
        if (e2) {
          setError(e2.message);
          return;
        }
        if (!data.session) {
          setInfo('Check your email to confirm your address, then return to this link and sign in.');
          return;
        }
      }
      const { error: accErr } = await supabase.rpc('accept_invitation', { p_token: token });
      if (accErr) {
        setError(accErr.message);
        return;
      }
      router.replace('/calendar');
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Lincoln Home Time</h1>
        <p className="text-sm text-foreground">{headline}</p>
      </header>

      {error && (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      )}
      {info && <p className={infoClass}>{info}</p>}

      {userEmail ? (
        userEmail.toLowerCase() === inviteEmail.toLowerCase() ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Signed in as {userEmail}.</p>
            <button type="button" disabled={pending} onClick={acceptNow} className={primaryButtonClass}>
              {pending ? 'Joining…' : 'Accept invitation'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You&apos;re signed in as <strong>{userEmail}</strong>, but this invitation is for{' '}
              <strong>{inviteEmail}</strong>.
            </p>
            <button type="button" disabled={pending} onClick={useDifferentAccount} className={primaryButtonClass}>
              Use a different account
            </button>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <form onSubmit={authThenAccept} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="acc-email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <input id="acc-email" type="email" value={inviteEmail} readOnly className={`${fieldClass} bg-muted`} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="acc-password" className="text-sm font-medium text-foreground">
                {mode === 'create' ? 'Create a password' : 'Password'}
              </label>
              <input
                id="acc-password"
                type="password"
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
                placeholder={mode === 'create' ? 'At least 8 characters' : 'Your password'}
              />
            </div>
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? 'Working…' : mode === 'create' ? 'Create account & join' : 'Sign in & join'}
            </button>
          </form>
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === 'create' ? 'signin' : 'create'));
                setError(null);
                setInfo(null);
              }}
              className={linkButtonClass}
            >
              {mode === 'create' ? 'I already have an account' : 'Create a new account instead'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
