'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Bed, Car, MapPin, Navigation, Pencil, Plane, Plus, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { cn } from '@/lib/utils';
import type { DayAssignment, ExceptionRow, Household, ISODate, SegmentType, TripSegment } from '@/lib/types';
import {
  exceptionTypeLabel, formatClock, formatFullDate, manualCategoryLabel,
  schoolCategoryLabel, type ManualEventRow, type RequestLayerRow, type SchoolDateRow, type TripWithSegments,
} from './calendar-utils';
import { segmentDisplay } from '@/components/trips/trip-utils';
import { deleteEvent, deleteSeries } from './event-actions';

const directionsUrl = (loc: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc)}`;

interface DaySheetProps {
  date: ISODate;
  day?: DayAssignment;
  household?: Household;
  households: Household[];
  exceptions: ExceptionRow[];
  school: SchoolDateRow[];
  events: ManualEventRow[];
  trips: TripWithSegments[];
  requests: RequestLayerRow[];
  currentUserId: string;
  isAdmin: boolean;
  onAddEvent: (date: ISODate) => void;
  onEditEvent: (event: ManualEventRow) => void;
  onEditSeries: (seriesId: string) => void;
  onClose: () => void;
}

const SEGMENT_ICON: Record<SegmentType, typeof Plane> = {
  flight: Plane,
  lodging: Bed,
  ground: Car,
  other: MapPin,
};

export function DaySheet({
  date, day, household, households, exceptions, school, events, trips, requests,
  currentUserId, isAdmin, onAddEvent, onEditEvent, onEditSeries, onClose,
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
              onEditOne={() => onEditEvent(e)}
              onEditSeries={onEditSeries}
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

        {requests.length > 0 && (
          <Section title="Pending requests">
            {requests.map((r) => (
              <Link
                key={r.id}
                href="/requests"
                className="flex items-center gap-2.5 rounded-lg border border-border bg-background p-3 transition hover:bg-muted"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{r.title}</span>
                <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800 capitalize">
                  {r.status}
                </span>
              </Link>
            ))}
          </Section>
        )}

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

function EventRow({
  event,
  canManage,
  onEditOne,
  onEditSeries,
}: {
  event: ManualEventRow;
  canManage: boolean;
  onEditOne: () => void;
  onEditSeries: (seriesId: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'edit' | 'delete'>(null);
  const isSeries = Boolean(event.series_id);
  const time = event.all_day
    ? 'All day'
    : [formatClock(event.start_time), formatClock(event.end_time)].filter(Boolean).join(' – ');
  const sub = [time, event.location, manualCategoryLabel(event.category)].filter(Boolean).join(' · ');

  function del(scope: 'one' | 'series') {
    setError(null);
    startTransition(async () => {
      const res =
        scope === 'series' && event.series_id
          ? await deleteSeries({ seriesId: event.series_id })
          : await deleteEvent({ id: event.id });
      if ('error' in res) setError(res.error);
    });
  }

  const linkBtn = 'text-xs font-medium hover:underline disabled:opacity-60';

  return (
    <div className="flex gap-2.5">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {event.title}
          {isSeries && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· repeats</span>}
        </p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {event.notes && <p className="text-xs text-muted-foreground">{event.notes}</p>}
        {event.location && (
          <a
            href={directionsUrl(event.location)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Navigation className="h-3 w-3" />
            Get directions
          </a>
        )}
        {error && <p className="text-xs text-rose-700">{error}</p>}

        {canManage &&
          (confirm === 'edit' ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground">Edit:</span>
              <button type="button" onClick={onEditOne} className={cn(linkBtn, 'text-primary')}>This event</button>
              <button type="button" onClick={() => event.series_id && onEditSeries(event.series_id)} className={cn(linkBtn, 'text-primary')}>Whole series</button>
              <button type="button" onClick={() => setConfirm(null)} className={cn(linkBtn, 'text-muted-foreground')}>Cancel</button>
            </div>
          ) : confirm === 'delete' ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground">{isSeries ? 'Delete:' : 'Delete this event?'}</span>
              <button type="button" disabled={pending} onClick={() => del('one')} className={cn(linkBtn, 'text-rose-700')}>{isSeries ? 'This event' : 'Delete'}</button>
              {isSeries && (
                <button type="button" disabled={pending} onClick={() => del('series')} className={cn(linkBtn, 'text-rose-700')}>Whole series</button>
              )}
              <button type="button" onClick={() => setConfirm(null)} className={cn(linkBtn, 'text-muted-foreground')}>Cancel</button>
            </div>
          ) : (
            <div className="mt-1 flex gap-3">
              <button
                type="button"
                onClick={() => (isSeries ? setConfirm('edit') : onEditOne())}
                className={cn(linkBtn, 'flex items-center gap-1 text-primary')}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirm('delete')}
                className={cn(linkBtn, 'flex items-center gap-1 text-rose-700')}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
          ))}
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
  const v = segmentDisplay(seg);
  return (
    <li className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-foreground">{v.title}</p>
          {v.status && (
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', v.status.className)}>
              {v.status.label}
            </span>
          )}
        </div>
        {v.location && <p className="text-xs text-muted-foreground">{v.location}</p>}
        {v.isFlight ? (
          <>
            {v.departs && <p className="text-xs text-muted-foreground">Departs {v.departs}</p>}
            {v.arrives && (
              <p className="text-xs text-muted-foreground">
                Arrives {v.arrives}
                {v.arrivesPt && <span className="text-muted-foreground/70"> · {v.arrivesPt}</span>}
              </p>
            )}
            {v.actual && (
              <p className="text-xs font-medium text-foreground">
                {v.actualLabel} {v.actual}
                {v.actualPt && <span className="font-normal text-muted-foreground"> · {v.actualPt}</span>}
              </p>
            )}
          </>
        ) : (
          v.times && <p className="text-xs text-muted-foreground">{v.times}</p>
        )}
        {v.confirmation && <p className="text-xs text-muted-foreground">Confirmation: {v.confirmation}</p>}
        {v.extra && <p className="text-xs text-muted-foreground">{v.extra}</p>}
        {v.statusUpdated && <p className="text-[11px] text-muted-foreground/70">Updated {v.statusUpdated}</p>}
      </div>
    </li>
  );
}
