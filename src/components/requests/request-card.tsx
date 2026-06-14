'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { fieldClass } from '@/components/auth/field-styles';
import { formatInstant } from '@/lib/dates';
import { acceptCounter, declineCounter, decideRequest, type ActionResult } from './actions';
import { formatDateRange, requestTypeLabel, statusBadge, type RequestRow } from './request-utils';

export interface RequestView {
  request: RequestRow;
  requesterName: string;
  requesterColor: string | null;
  caps: { canDecide: boolean; canRespondCounter: boolean };
}

const btnBase =
  'flex min-h-[2.75rem] items-center justify-center rounded-lg px-3 text-sm font-semibold transition disabled:opacity-60';
const btnPrimary = `${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`;
const btnDanger = `${btnBase} border border-border bg-card text-rose-700 hover:bg-rose-50`;
const btnGhost = `${btnBase} border border-border bg-card text-foreground hover:bg-muted`;

const stamp = (ts: string) =>
  `${formatInstant(ts, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PT`;

export function RequestCard({ request, requesterName, requesterColor, caps }: RequestView) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const [cStart, setCStart] = useState(request.start_date);
  const [cEnd, setCEnd] = useState(request.end_date);
  const [note, setNote] = useState('');

  const badge = statusBadge(request.status);

  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ('error' in res) setError(res.error);
      else setCounterOpen(false);
    });
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {requesterColor && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: requesterColor }} />
            )}
            <p className="truncate text-sm font-semibold text-foreground">{requesterName}</p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {requestTypeLabel(request.request_type)} · {formatDateRange(request.start_date, request.end_date)}
          </p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', badge.className)}>
          {badge.label}
        </span>
      </div>

      {request.note && <p className="mt-2 text-sm text-foreground">{request.note}</p>}

      {request.status === 'countered' && request.proposed_start_date && request.proposed_end_date && (
        <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Proposed alternative: {formatDateRange(request.proposed_start_date, request.proposed_end_date)}
        </p>
      )}
      {request.decision_note && <p className="mt-1 text-xs text-muted-foreground">Note: {request.decision_note}</p>}

      <p className="mt-2 text-[11px] text-muted-foreground">
        Submitted {stamp(request.created_at)}
        {request.decided_at && ` · Decided ${stamp(request.decided_at)}`}
      </p>

      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}

      {/* Admin decisions on a pending request from the other household */}
      {caps.canDecide && !counterOpen && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => decideRequest({ requestId: request.id, decision: 'approve' }))}
            className={btnPrimary}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => decideRequest({ requestId: request.id, decision: 'deny' }))}
            className={btnDanger}
          >
            Deny
          </button>
          <button type="button" disabled={pending} onClick={() => setCounterOpen(true)} className={btnGhost}>
            Counter
          </button>
        </div>
      )}

      {caps.canDecide && counterOpen && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm font-medium text-foreground">Propose an alternative</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor={`cs-${request.id}`} className="text-xs font-medium text-foreground">
                Start
              </label>
              <input
                id={`cs-${request.id}`}
                type="date"
                value={cStart}
                onChange={(e) => {
                  setCStart(e.target.value);
                  if (cEnd < e.target.value) setCEnd(e.target.value);
                }}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`ce-${request.id}`} className="text-xs font-medium text-foreground">
                End
              </label>
              <input
                id={`ce-${request.id}`}
                type="date"
                min={cStart}
                value={cEnd}
                onChange={(e) => setCEnd(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={fieldClass}
            placeholder="Reason (optional)"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() =>
                  decideRequest({ requestId: request.id, decision: 'counter', note, proposedStart: cStart, proposedEnd: cEnd }),
                )
              }
              className={btnPrimary}
            >
              Send counter
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setCounterOpen(false);
                setError(null);
              }}
              className={btnGhost}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Requester responds to a counter on their own request */}
      {caps.canRespondCounter && request.proposed_start_date && request.proposed_end_date && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => acceptCounter({ requestId: request.id }))}
            className={btnPrimary}
          >
            Accept
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => declineCounter({ requestId: request.id }))}
            className={btnDanger}
          >
            Decline
          </button>
        </div>
      )}
    </li>
  );
}
