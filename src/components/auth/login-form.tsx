'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { alertClass, fieldClass, infoClass, linkButtonClass, primaryButtonClass } from './field-styles';

type View = 'password' | 'magic' | 'forgot';

export function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [view, setView] = useState<View>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [otpSent, setOtpSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // emailRedirectTo must be an absolute URL; prefer the configured site, fall
  // back to the current origin so it also works on localhost during dev.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? (typeof window !== 'undefined' ? window.location.origin : '');

  function switchView(next: View) {
    setView(next);
    setError(null);
    setOtpSent(false);
    setResetSent(false);
    setCode('');
    setPassword('');
  }

  function toCalendar() {
    router.replace('/calendar');
    router.refresh();
  }

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) return setError(error.message);
    toCalendar();
  }

  async function handleSendMagic(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // Invite-only app: don't silently create accounts for unknown emails.
      options: { emailRedirectTo: `${siteUrl}/auth/callback`, shouldCreateUser: false },
    });
    setPending(false);
    if (error) return setError(error.message);
    setOtpSent(true);
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    setPending(false);
    if (error) return setError(error.message);
    toCalendar();
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Route through the callback so the one endpoint does the code exchange,
      // then it forwards to the reset form.
      redirectTo: `${siteUrl}/auth/callback?next=/auth/reset`,
    });
    setPending(false);
    if (error) return setError(error.message);
    setResetSent(true);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Lincoln Home Time</h1>
        <p className="text-sm text-muted-foreground">
          {view === 'password' && 'Sign in to your family calendar.'}
          {view === 'magic' && 'Sign in with a one-time email link or code.'}
          {view === 'forgot' && 'Reset your password.'}
        </p>
      </header>

      {error && (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      )}

      {view === 'password' && (
        <form onSubmit={handlePasswordSignIn} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
              placeholder="Your password"
            />
          </div>
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={() => switchView('magic')} className={linkButtonClass}>
              Email me a link instead
            </button>
            <button type="button" onClick={() => switchView('forgot')} className={linkButtonClass}>
              Forgot password?
            </button>
          </div>
        </form>
      )}

      {view === 'magic' && (
        <div className="space-y-4">
          {!otpSent ? (
            <form onSubmit={handleSendMagic} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="magic-email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <input
                  id="magic-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                  placeholder="you@example.com"
                />
              </div>
              <button type="submit" disabled={pending} className={primaryButtonClass}>
                {pending ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className={infoClass}>
                Check your email — we sent a sign-in link and a 6-digit code to <strong>{email}</strong>.
                Tap the link, or enter the code below.
              </p>
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="code" className="text-sm font-medium text-foreground">
                    6-digit code
                  </label>
                  <input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d*"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className={`${fieldClass} text-center text-xl tracking-[0.4em]`}
                    placeholder="••••••"
                  />
                </div>
                <button type="submit" disabled={pending || code.length < 6} className={primaryButtonClass}>
                  {pending ? 'Verifying…' : 'Verify code'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setCode('');
                    setError(null);
                  }}
                  className={linkButtonClass}
                >
                  Use a different email
                </button>
              </form>
            </div>
          )}
          <div className="pt-1 text-center">
            <button type="button" onClick={() => switchView('password')} className={linkButtonClass}>
              Sign in with a password instead
            </button>
          </div>
        </div>
      )}

      {view === 'forgot' && (
        <div className="space-y-4">
          {!resetSent ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="forgot-email" className="text-sm font-medium text-foreground">
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                  placeholder="you@example.com"
                />
              </div>
              <button type="submit" disabled={pending} className={primaryButtonClass}>
                {pending ? 'Sending…' : 'Send password reset link'}
              </button>
            </form>
          ) : (
            <p className={infoClass}>
              Check your email — we sent a password reset link to <strong>{email}</strong>.
            </p>
          )}
          <div className="pt-1 text-center">
            <button type="button" onClick={() => switchView('password')} className={linkButtonClass}>
              Back to sign in
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
