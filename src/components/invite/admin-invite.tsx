'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { alertClass, fieldClass, infoClass, primaryButtonClass } from '@/components/auth/field-styles';
import { formatInstant } from '@/lib/dates';
import type { FamilyRole } from '@/lib/types';
import { createInvitation, resendInvitation, revokeInvitation, type InviteResult } from './actions';

// invitation_status enum, verbatim from 0001_init.sql.
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface InvitationRow {
  id: string;
  email: string;
  role: FamilyRole;
  household_id: string | null;
  status: InvitationStatus;
  token: string;
  created_at: string;
  expires_at: string;
}

const btnBase =
  'flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium transition disabled:opacity-60';

function inviteLink(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/invite?token=${token}`;
}

function statusBadge(s: InvitationStatus, expired: boolean): { label: string; className: string } {
  if (s === 'pending' && expired) return { label: 'Expired', className: 'bg-muted text-muted-foreground' };
  switch (s) {
    case 'pending':
      return { label: 'Pending', className: 'bg-amber-100 text-amber-800' };
    case 'accepted':
      return { label: 'Accepted', className: 'bg-emerald-100 text-emerald-800' };
    case 'revoked':
      return { label: 'Revoked', className: 'bg-muted text-muted-foreground' };
    case 'expired':
      return { label: 'Expired', className: 'bg-muted text-muted-foreground' };
  }
}

export function AdminInvite({
  households,
  invitations,
}: {
  households: { id: string; name: string }[];
  invitations: InvitationRow[];
}) {
  const householdName = (id: string | null) => (id ? households.find((h) => h.id === id)?.name ?? '—' : '—');

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Invitations</h1>
      <CreateForm households={households} />

      {invitations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No invitations yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {invitations.map((inv) => (
            <InvitationCard key={inv.id} inv={inv} householdName={householdName(inv.household_id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateForm({ households }: { households: { id: string; name: string }[] }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<FamilyRole>('viewer');
  const [householdId, setHouseholdId] = useState(households[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedToken(null);
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    startTransition(async () => {
      const res = await createInvitation({ email, role, householdId });
      if ('error' in res) setError(res.error);
      else {
        setCreatedToken(res.token ?? null);
        setEmail('');
      }
    });
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy — long-press the link to copy manually.');
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Invite a family member</h2>
      {error && <p className={alertClass}>{error}</p>}
      {createdToken && (
        <div className={infoClass}>
          <p>Invitation created. Email isn’t live yet — copy the link and send it directly.</p>
          <button type="button" onClick={() => copy(createdToken)} className={`${btnBase} mt-2 w-full`}>
            {copied ? 'Copied ✓' : 'Copy invite link'}
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="inv-email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="inv-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
            placeholder="person@example.com"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="inv-role" className="text-sm font-medium text-foreground">
              Role
            </label>
            <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as FamilyRole)} className={fieldClass}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inv-household" className="text-sm font-medium text-foreground">
              Household
            </label>
            <select
              id="inv-household"
              value={householdId}
              onChange={(e) => setHouseholdId(e.target.value)}
              className={fieldClass}
            >
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? 'Creating…' : 'Create invitation'}
        </button>
      </form>
    </section>
  );
}

function InvitationCard({ inv, householdName }: { inv: InvitationRow; householdName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resent, setResent] = useState(false);
  const [pending, startTransition] = useTransition();

  const expired = new Date(inv.expires_at).getTime() <= Date.now();
  const badge = statusBadge(inv.status, expired);
  const canRevoke = inv.status === 'pending';

  function run(fn: () => Promise<InviteResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ('error' in res) setError(res.error);
      else after?.();
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteLink(inv.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy the link.');
    }
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{inv.email}</p>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">
            {inv.role} · {householdName}
          </p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', badge.className)}>
          {badge.label}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Created {formatInstant(inv.created_at, { month: 'short', day: 'numeric' })} PT · Expires{' '}
        {formatInstant(inv.expires_at, { month: 'short', day: 'numeric' })} PT
      </p>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={btnBase}>
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => resendInvitation({ id: inv.id }), () => { setResent(true); setTimeout(() => setResent(false), 1500); })} className={btnBase}>
          {resent ? 'Sent ✓' : 'Resend'}
        </button>
        {canRevoke && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => revokeInvitation({ id: inv.id }))}
            className={`${btnBase} text-rose-700 hover:bg-rose-50`}
          >
            Revoke
          </button>
        )}
      </div>
    </li>
  );
}
