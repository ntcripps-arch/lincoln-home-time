'use client';

import { useState, useTransition } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { alertClass, fieldClass, primaryButtonClass } from '@/components/auth/field-styles';
import { cn } from '@/lib/utils';
import { weekday } from '@/lib/rules-engine';
import { LocationInput } from './location-input';
import {
  MANUAL_CATEGORIES, WEEKDAY_INITIALS, defaultRepeatUntil, occurrenceDates,
  type ManualEventRow, type SeriesRow,
} from './calendar-utils';
import {
  createEvent, createRecurringEvent, updateEvent, updateSeries, type EventResult,
} from './event-actions';

type Mode = 'create' | 'edit' | 'edit-series';

export function EventForm({
  mode,
  date,
  event,
  series,
  onClose,
}: {
  mode: Mode;
  date: string;
  event?: ManualEventRow;
  series?: SeriesRow;
  onClose: () => void;
}) {
  const init = series ?? event;
  const [title, setTitle] = useState(init?.title ?? '');
  const [category, setCategory] = useState(init?.category ?? 'other');
  const [location, setLocation] = useState(init?.location ?? '');
  const [notes, setNotes] = useState(init?.notes ?? '');
  const [allDay, setAllDay] = useState(init?.all_day ?? false);
  const [startTime, setStartTime] = useState(init?.start_time ?? '');
  const [endTime, setEndTime] = useState(init?.end_time ?? '');
  const [day, setDay] = useState(series?.start_date ?? event?.date ?? date);
  const [repeats, setRepeats] = useState(mode === 'edit-series');
  const [repeatUntil, setRepeatUntil] = useState(series?.end_date ?? date);
  const [weekdays, setWeekdays] = useState<number[]>(series?.weekdays ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isRecurrence = mode === 'edit-series' || (mode === 'create' && repeats);

  function toggleRepeats(on: boolean) {
    setRepeats(on);
    if (on) {
      if (weekdays.length === 0) setWeekdays([weekday(day)]);
      // Never leave "repeat until" on the start date — that yields a single
      // occurrence and the event silently doesn't repeat.
      if (repeatUntil <= day) setRepeatUntil(defaultRepeatUntil(day));
    }
  }
  function toggleWeekday(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }
  // Keep the end date valid as the start date moves (recurrence only).
  function changeStartDate(v: string) {
    setDay(v);
    if (isRecurrence && repeatUntil <= v) setRepeatUntil(defaultRepeatUntil(v));
  }

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
    if (isRecurrence) {
      if (weekdays.length === 0) {
        setError('Pick at least one day of the week.');
        return;
      }
      if (repeatUntil < day) {
        setError('The repeat-until date is before the start date.');
        return;
      }
      if (occurrenceDates(weekdays, day, repeatUntil).length < 2) {
        setError('This date range only covers one occurrence — extend "Repeat until" so the event actually repeats.');
        return;
      }
    }

    const recur = { title, category, location, notes, allDay, startTime, endTime, weekdays, startDate: day, endDate: repeatUntil };
    const single = { title, date: day, allDay, startTime, endTime, location, category, notes };

    startTransition(async () => {
      let res: EventResult;
      if (mode === 'edit-series' && series) res = await updateSeries({ seriesId: series.id, ...recur });
      else if (mode === 'edit' && event) res = await updateEvent({ id: event.id, ...single });
      else if (repeats) res = await createRecurringEvent(recur);
      else res = await createEvent(single);
      if ('error' in res) setError(res.error);
      else onClose();
    });
  }

  const sheetTitle = mode === 'edit-series' ? 'Edit recurring event' : mode === 'edit' ? 'Edit event' : 'New event';
  const submitLabel = pending
    ? 'Saving…'
    : mode === 'edit-series'
      ? 'Save series'
      : mode === 'edit'
        ? 'Save event'
        : repeats
          ? 'Add recurring event'
          : 'Add event';

  return (
    <BottomSheet title={sheetTitle} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 pb-2">
        {error && <p className={alertClass}>{error}</p>}

        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} placeholder="Baseball practice" />
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

        {!isRecurrence && (
          <Field label="Date">
            <input type="date" value={day} onChange={(e) => changeStartDate(e.target.value)} className={fieldClass} />
          </Field>
        )}

        {mode === 'create' && (
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={repeats} onChange={(e) => toggleRepeats(e.target.checked)} className="h-4 w-4" />
            Repeats weekly
          </label>
        )}

        {isRecurrence && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
            <div className="space-y-1">
              <span className="text-sm font-medium text-foreground">Repeats on</span>
              <div className="flex gap-1">
                {WEEKDAY_INITIALS.map((label, d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleWeekday(d)}
                    aria-pressed={weekdays.includes(d)}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition',
                      weekdays.includes(d) ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date">
                <input type="date" value={day} onChange={(e) => changeStartDate(e.target.value)} className={fieldClass} />
              </Field>
              <Field label="Repeat until">
                <input type="date" min={day} value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} className={fieldClass} />
              </Field>
            </div>
          </div>
        )}

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
          <LocationInput value={location} onChange={setLocation} placeholder="City Park, Field 3" />
        </Field>

        <Field label="Notes (optional)">
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} />
        </Field>

        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {submitLabel}
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
