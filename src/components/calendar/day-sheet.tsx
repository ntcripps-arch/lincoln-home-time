'use client';

import { useState, useTransition } from 'react';
import { Bed, Car, MapPin, Pencil, Plane, Plus, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import type { DayAssignment, ExceptionRow, Household, ISODate, SegmentType, TripSegment } from '@/lib/types';
import {
  exceptionTypeLabel, formatClock, formatFullDate, formatStamp, manualCategoryLabel,
  schoolCategoryLabel, type ManualEventRow, type SchoolDateRow, type TripWithSegments,
} from './calendar-utils';
import { deleteEvent } from './event-actions';

interface DaySheetProps {
  date: ISODate;
  day?: DayAssignment;
  household?: Household;
  households: Household[];
  exceptions: ExceptionRow[];
  school: SchoolDateRow[];
  events: ManualEventRow[];
  trips: TripWithSegments[];
  currentUserId: string;
  isAdmin: boolean;
  onAddEvent: (date: ISODate) => void;
  onEditEvent: (event: ManualEventRow) => void;
  onClose: () => void;
}

const SEGMENT_ICON: Record<SegmentType, typeof Plane> = {
  flight: Plane,
  lodging: Bed,
  ground: Car,
  other: MapPin,
};

export function DaySheet({
  date, day, household, households, exceptions, school, events, trips,
  currentUserId, isAdmin, onAddEvent, onEditEvent, onClose,
}: DaySheetProps) {
  const householdName = (id: string | null | undefined) =>
    households.find((h) => h.id === id)?.name ?? 'Unassigned';

  return (
    <BottomSheet title={formatFullDate(date)} onClose={onClose}>
      <div className="space-y-5 pb-2">
        {/* Parenting */}
        <section className="space-y-2">
          {household ? (
            <div className="flex items-center gap-2.5">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: household.color }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">With {household.name}</p>
                {(day?.pickupTime || day?.dropoffTime) && (
                  <p className="text-xs text-muted-foreground">
                    {day?.pickupTime && `Pickup ${formatClock(day.pickupTime)}`}
                    {day?.pickupTime && day?.dropoffTime && ' · '}
                    {day?.dropoffTime && `Dropoff ${formatClock(day.dropoffTime)}`}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No parenting assignment.</p>
          )}

          {exceptions.map((ex) => (
            <div key={ex.id} className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {exceptionTypeLabel(ex.exception_type)}
                {ex.household_id ? ` → ${householdName(ex.household_id)}` : ''}
              </p>
              {ex.note && <p className="mt-0.5 text-sm text-foreground">{ex.note}</p>}
            </div>
          ))}
        </section>

        {/* Events — always shown so you can add one for this day */}
        <Section title="Events">
          {events.map((e) => (
            <EventRow
              key={e.id}
              event={e}
              canManage={isAdmin || e.created_by === currentUserId}
              onEdit={() => onEditEvent(e)}
            />
          ))}
          <button
            type="button"
            onClick={() => onAddEvent(date)}
            className="flex min-h-[2.5rem] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground transition hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Add event
          </button>
        </Section>

        {school.length > 0 && (
          <Section title="School">
            {school.map((s) => (
              <Row key={s.id} dot="bg-amber-500" title={s.title} sub={schoolCategoryLabel(s.category)} note={s.notes} />
            ))}
          </Section>
        )}

        {trips.length > 0 && (
          <Section title="Trips">
            {trips.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                  <p className="text-sm font-semibold text-foreground">{t.title}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[t.destination, t.traveling_household_id && `Traveling: ${householdName(t.traveling_household_id)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {t.trip_segments.length > 0 && (
                  <ul className="mt-2 space-y-2 border-t border-border pt-2">
                    {[...t.trip_segments]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((seg) => (
                        <SegmentRow key={seg.id} seg={seg} />
                      ))}
                  </ul>
                )}
              </div>
            ))}
          </Section>
        )}
      </div>
    </BottomSheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EventRow({ event, canManage, onEdit }: { event: ManualEventRow; canManage: boolean; onEdit: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const time = event.all_day
    ? 'All day'
    : [formatClock(event.start_time), formatClock(event.end_time)].filter(Boolean).join(' – ');
  const sub = [time, event.location, manualCategoryLabel(event.category)].filter(Boolean).join(' · ');

  return (
    <div className="flex gap-2.5">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{event.title}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {event.notes && <p className="text-xs text-muted-foreground">{event.notes}</p>}
        {error && <p className="text-xs text-rose-700">{error}</p>}
        {canManage && (
          <div className="mt-1 flex gap-3">
            <button type="button" onClick={onEdit} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteEvent({ id: event.id });
                  if ('error' in res) setError(res.error);
                })
              }
              className="flex items-center gap-1 text-xs font-medium text-rose-700 hover:underline disabled:opacity-60"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ dot, title, sub, note }: { dot: string; title: string; sub: string | null; note: string | null }) {
  return (
    <div className="flex gap-2.5">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

function SegmentRow({ seg }: { seg: TripSegment }) {
  const Icon = SEGMENT_ICON[seg.segment_type] ?? MapPin;
  const times = [formatStamp(seg.start_at), formatStamp(seg.end_at)].filter(Boolean).join(' → ');
  return (
    <li className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-foreground">{seg.title ?? seg.segment_type}</p>
        {seg.location && <p className="text-xs text-muted-foreground">{seg.location}</p>}
        {times && <p className="text-xs text-muted-foreground">{times}</p>}
        {seg.confirmation && <p className="text-xs text-muted-foreground">Confirmation: {seg.confirmation}</p>}
      </div>
    </li>
  );
}
