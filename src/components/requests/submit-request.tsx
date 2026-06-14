'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { alertClass, fieldClass, primaryButtonClass } from '@/components/auth/field-styles';
import { todayISO } from '@/lib/dates';
import type { RequestType } from '@/lib/types';
import { submitRequest } from './actions';
import { REQUEST_TYPES } from './request-utils';

export function SubmitRequest({ householdName }: { householdName: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primaryButtonClass}>
        <Plus className="h-5 w-5" />
        New request
      </button>
      {open && <SubmitSheet householdName={householdName} onClose={() => setOpen(false)} />}
    </>
  );
}

function SubmitSheet({ householdName, onClose }: { householdName: string | null; onClose: () => void }) {
  const today = todayISO();
  const [type, setType] = useState<RequestType>('swap');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (end < start) {
      setError('The end date can’t be before the start date.');
      return;
    }
    startTransition(async () => {
      const res = await submitRequest({ requestType: type, startDate: start, endDate: end, note });
      if ('error' in res) setError(res.error);
      else onClose();
    });
  }

  return (
    <BottomSheet title="New time request" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4 pb-2">
        {householdName && (
          <p className="text-sm text-muted-foreground">
            Requesting as <span className="font-medium text-foreground">{householdName}</span>
          </p>
        )}
        {error && <p className={alertClass}>{error}</p>}

        <div className="space-y-1.5">
          <label htmlFor="rtype" className="text-sm font-medium text-foreground">
            Type
          </label>
          <select
            id="rtype"
            value={type}
            onChange={(e) => setType(e.target.value as RequestType)}
            className={fieldClass}
          >
            {REQUEST_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="rstart" className="text-sm font-medium text-foreground">
              Start date
            </label>
            <input
              id="rstart"
              type="date"
              required
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (end < e.target.value) setEnd(e.target.value);
              }}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rend" className="text-sm font-medium text-foreground">
              End date
            </label>
            <input
              id="rend"
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="rnote" className="text-sm font-medium text-foreground">
            Note <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="rnote"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={fieldClass}
            placeholder="Anything the other home should know"
          />
        </div>

        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </BottomSheet>
  );
}
