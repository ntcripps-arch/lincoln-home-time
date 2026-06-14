'use client';

import { useState, useTransition } from 'react';
import { CalendarPlus, Copy, RefreshCw } from 'lucide-react';
import { disableCalendarFeed, enableCalendarFeed, rotateCalendarFeed } from './feed-actions';

const btnBase =
  'flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-60';

function feedUrl(token: string): string {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}/feed/${token}.ics`;
}

export function CalendarFeed({ initialToken }: { initialToken: string | null }) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [pending, startTransition] = useTransition();

  function enable() {
    setError(null);
    startTransition(async () => {
      const res = await enableCalendarFeed();
      if ('error' in res) setError(res.error);
      else setToken(res.token);
    });
  }

  function rotate() {
    setError(null);
    startTransition(async () => {
      const res = await rotateCalendarFeed();
      if ('error' in res) setError(res.error);
      else {
        setToken(res.token);
        setConfirmRotate(false);
      }
    });
  }

  function disable() {
    setError(null);
    startTransition(async () => {
      const res = await disableCalendarFeed();
      if ('error' in res) setError(res.error);
      else setToken(null);
    });
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(feedUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy — long-press the link to copy manually.');
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Calendar subscription</h2>
      <p className="text-sm text-muted-foreground">
        Add the family schedule (parenting, events, school, trips) to your phone’s calendar. It refreshes
        automatically and is read-only. Keep the link private — anyone with it can view the schedule.
      </p>
      {error && <p className="text-sm text-rose-700">{error}</p>}

      {!token ? (
        <button type="button" disabled={pending} onClick={enable} className={btnBase}>
          <CalendarPlus className="h-4 w-4" />
          {pending ? 'Enabling…' : 'Enable subscription link'}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              readOnly
              value={feedUrl(token)}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground"
            />
            <button type="button" onClick={copy} className={btnBase}>
              <Copy className="h-4 w-4" />
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            In Apple/Google Calendar, choose “Add calendar by URL” and paste this link.
          </p>

          {confirmRotate ? (
            <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm font-medium text-rose-900">
                Reset the link? The old URL stops working and any device using it must re-subscribe.
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={pending} onClick={rotate} className={`${btnBase} text-rose-700`}>
                  <RefreshCw className="h-4 w-4" />
                  {pending ? 'Resetting…' : 'Reset link'}
                </button>
                <button type="button" disabled={pending} onClick={() => setConfirmRotate(false)} className={btnBase}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => setConfirmRotate(true)} className={btnBase}>
                <RefreshCw className="h-4 w-4" />
                Reset link
              </button>
              <button type="button" disabled={pending} onClick={disable} className={`${btnBase} text-rose-700`}>
                Turn off
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
