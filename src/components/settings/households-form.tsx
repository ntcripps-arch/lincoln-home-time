'use client';

import { useState, useTransition } from 'react';
import { alertClass, fieldClass, primaryButtonClass } from '@/components/auth/field-styles';
import type { Household } from '@/lib/types';
import { updateHousehold } from './actions';

export function HouseholdsForm({ households }: { households: Household[] }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Households</h2>
      <div className="space-y-4">
        {households.map((h) => (
          <HouseholdCard key={h.id} household={h} />
        ))}
      </div>
    </section>
  );
}

function HouseholdCard({ household }: { household: Household }) {
  const [name, setName] = useState(household.name);
  const [pickup, setPickup] = useState(household.pickup_default ?? '');
  const [dropoff, setDropoff] = useState(household.dropoff_default ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateHousehold({
        id: household.id,
        name,
        pickupDefault: pickup || null,
        dropoffDefault: dropoff || null,
      });
      if ('error' in res) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <form onSubmit={onSave} className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: household.color }} />
        <span className="text-xs text-muted-foreground">Color is fixed — it codes the calendar.</span>
      </div>
      {error && <p className={alertClass}>{error}</p>}
      <div className="space-y-1.5">
        <label htmlFor={`hh-name-${household.id}`} className="text-sm font-medium text-foreground">
          Name
        </label>
        <input
          id={`hh-name-${household.id}`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className={fieldClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={`hh-pickup-${household.id}`} className="text-sm font-medium text-foreground">
            Pickup
          </label>
          <input
            id={`hh-pickup-${household.id}`}
            value={pickup}
            onChange={(e) => {
              setPickup(e.target.value);
              setSaved(false);
            }}
            className={fieldClass}
            placeholder="15:30"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`hh-dropoff-${household.id}`} className="text-sm font-medium text-foreground">
            Dropoff
          </label>
          <input
            id={`hh-dropoff-${household.id}`}
            value={dropoff}
            onChange={(e) => {
              setDropoff(e.target.value);
              setSaved(false);
            }}
            className={fieldClass}
            placeholder="09:00"
          />
        </div>
      </div>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save household'}
      </button>
    </form>
  );
}
