'use client';

import { useState, useTransition } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { alertClass, fieldClass, primaryButtonClass } from '@/components/auth/field-styles';
import { MANUAL_CATEGORIES, type ManualEventRow } from './calendar-utils';
import { createEvent, updateEvent, type EventResult } from './event-actions';

export function EventForm({
  mode,
  date,
  event,
  onClose,
}: {
  mode: 'create' | 'edit';
  date: string;
  event?: ManualEventRow;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [day, setDay] = useState(event?.date ?? date);
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [startTime, setStartTime] = useState(event?.start_time ?? '');
  const [endTime, setEndTime] = useState(event?.end_time ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [category, setCategory] = useState(event?.category ?? 'other');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!allDay && startTime && endTime && endTime < startTime) {
      setError('End time is before the start time.');
      return;
    }
    const payload = { title, date: day, allDay, startTime, endTime, location, category, notes };
    startTransition(async () => {
      const res: EventResult = event ? await updateEvent({ id: event.id, ...payload }) : await createEvent(payload);
      if ('error' in res) setError(res.error);
      else onClose();
    });
  }

  return (
    <BottomSheet title={mode === 'create' ? 'New event' : 'Edit event'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 pb-2">
        {error && <p className={alertClass}>{error}</p>}

        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} placeholder="Soccer match" />
        </Field>

        <Field label="Date">
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={fieldClass} />
        </Field>

        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4" />
          All day
        </label>

        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time">
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={fieldClass} />
            </Field>
            <Field label="End time">
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={fieldClass} />
            </Field>
          </div>
        )}

        <Field label="Location (optional)">
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={fieldClass} placeholder="City Park, Field 3" />
        </Field>

        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
            {MANUAL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes (optional)">
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} />
        </Field>

        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? 'Saving…' : mode === 'create' ? 'Add event' : 'Save event'}
        </button>
      </form>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
