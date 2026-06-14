'use client';

import { useState, useTransition } from 'react';
import { alertClass, fieldClass, primaryButtonClass } from '@/components/auth/field-styles';
import { createTrip, deleteTrip, updateTrip, type TripResult } from './actions';

interface TripInitial {
  id: string;
  title: string;
  destination: string | null;
  start_date: string;
  end_date: string;
  traveling_household_id: string | null;
  notes: string | null;
  linked_request_id: string | null;
}

export function TripForm({
  mode,
  households,
  requests,
  trip,
  today,
}: {
  mode: 'create' | 'edit';
  households: { id: string; name: string }[];
  requests: { id: string; title: string }[];
  trip?: TripInitial;
  today: string;
}) {
  const [title, setTitle] = useState(trip?.title ?? '');
  const [destination, setDestination] = useState(trip?.destination ?? '');
  const [startDate, setStartDate] = useState(trip?.start_date ?? today);
  const [endDate, setEndDate] = useState(trip?.end_date ?? today);
  const [householdId, setHouseholdId] = useState(trip?.traveling_household_id ?? households[0]?.id ?? '');
  const [notes, setNotes] = useState(trip?.notes ?? '');
  const [linkedRequestId, setLinkedRequestId] = useState(trip?.linked_request_id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function payload() {
    return {
      title,
      destination,
      startDate,
      endDate,
      travelingHouseholdId: householdId,
      notes,
      linkedRequestId,
    };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (endDate < startDate) {
      setError('The end date can’t be before the start date.');
      return;
    }
    startTransition(async () => {
      const res: TripResult | undefined =
        mode === 'create' ? await createTrip(payload()) : await updateTrip({ id: trip!.id, ...payload() });
      if (res && 'error' in res) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      {error && <p className={alertClass}>{error}</p>}

      <div className="space-y-1.5">
        <label htmlFor="trip-title" className="text-sm font-medium text-foreground">
          Title
        </label>
        <input
          id="trip-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaved(false);
          }}
          className={fieldClass}
          placeholder="Beach week"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="trip-destination" className="text-sm font-medium text-foreground">
          Destination <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="trip-destination"
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setSaved(false);
          }}
          className={fieldClass}
          placeholder="Outer Banks, NC"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="trip-start" className="text-sm font-medium text-foreground">
            Start date
          </label>
          <input
            id="trip-start"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
              setSaved(false);
            }}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="trip-end" className="text-sm font-medium text-foreground">
            End date
          </label>
          <input
            id="trip-end"
            type="date"
            min={startDate}
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setSaved(false);
            }}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="trip-household" className="text-sm font-medium text-foreground">
          Traveling household
        </label>
        <select
          id="trip-household"
          value={householdId}
          onChange={(e) => {
            setHouseholdId(e.target.value);
            setSaved(false);
          }}
          className={fieldClass}
        >
          {households.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </div>

      {requests.length > 0 && (
        <div className="space-y-1.5">
          <label htmlFor="trip-request" className="text-sm font-medium text-foreground">
            Linked request <span className="text-muted-foreground">(optional)</span>
          </label>
          <select
            id="trip-request"
            value={linkedRequestId}
            onChange={(e) => {
              setLinkedRequestId(e.target.value);
              setSaved(false);
            }}
            className={fieldClass}
          >
            <option value="">None</option>
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="trip-notes" className="text-sm font-medium text-foreground">
          Notes <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="trip-notes"
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setSaved(false);
          }}
          className={fieldClass}
        />
      </div>

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Saving…' : saved ? 'Saved ✓' : mode === 'create' ? 'Create trip' : 'Save trip'}
      </button>

      {mode === 'edit' && (
        <div className="border-t border-border pt-3">
          {confirmDelete ? (
            <div className="space-y-2">
              <p className="text-sm text-foreground">Delete this trip and all its segments?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(async () => {
                    const res = await deleteTrip({ id: trip!.id });
                    if (res && 'error' in res) setError(res.error);
                  })}
                  className="flex min-h-[2.75rem] items-center justify-center rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  Delete trip
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex min-h-[2.75rem] items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-sm font-medium text-rose-700 underline-offset-4 hover:underline"
            >
              Delete trip
            </button>
          )}
        </div>
      )}
    </form>
  );
}
