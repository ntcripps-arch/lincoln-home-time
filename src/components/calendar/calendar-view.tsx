'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { addDays, applyExceptions, eachDay, generateBaseline } from '@/lib/rules-engine';
import type { ExceptionRow, Household, ISODate, ScheduleRule } from '@/lib/types';
import { cn } from '@/lib/utils';
import { DaySheet } from './day-sheet';
import { EventForm } from './event-form';
import {
  buildRangeMap, formatClock, formatFullDate, formatMonthLabel, initial, isSameMonth, LAYER_META, LAYER_ORDER,
  monthGrid, tintStyle, WEEKDAYS, weekdayShort, type LayerKey, type ManualEventRow,
  type RequestLayerRow, type SchoolDateRow, type SeriesRow, type TripWithSegments,
} from './calendar-utils';

interface CalendarViewProps {
  households: Household[];
  rules: ScheduleRule[];
  exceptions: ExceptionRow[];
  schoolDates: SchoolDateRow[];
  events: ManualEventRow[];
  series: SeriesRow[];
  trips: TripWithSegments[];
  requests: RequestLayerRow[];
  hasActivePlan: boolean;
  currentUserId: string;
  isAdmin: boolean;
  today: ISODate;
  initialYear: number;
  initialMonth: number;
}

export function CalendarView({
  households, rules, exceptions, schoolDates, events, series, trips, requests, hasActivePlan, currentUserId, isAdmin, today, initialYear, initialMonth,
}: CalendarViewProps) {
  const [view, setView] = useState<'month' | 'agenda'>('month');
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    parenting: true, school: true, events: true, trips: true, requests: true,
  });
  const [selectedDate, setSelectedDate] = useState<ISODate | null>(null);
  const [eventForm, setEventForm] = useState<
    { mode: 'create' | 'edit' | 'edit-series'; date: ISODate; event?: ManualEventRow; series?: SeriesRow } | null
  >(null);

  function addEvent(date: ISODate) {
    setSelectedDate(null);
    setEventForm({ mode: 'create', date });
  }
  function editEvent(event: ManualEventRow) {
    setSelectedDate(null);
    setEventForm({ mode: 'edit', date: event.date, event });
  }
  function editSeries(seriesId: string) {
    const sr = series.find((x) => x.id === seriesId);
    if (!sr) return;
    setSelectedDate(null);
    setEventForm({ mode: 'edit-series', date: sr.start_date, series: sr });
  }

  const householdById = useMemo(() => new Map(households.map((h) => [h.id, h])), [households]);
  const grid = useMemo(() => monthGrid(year, month), [year, month]);

  // The schedule is always computed via the rules engine for the visible range —
  // never re-derived here.
  const days = useMemo(
    () =>
      applyExceptions(
        generateBaseline({ rules, households, rangeStart: grid.gridStart, rangeEnd: grid.gridEnd }),
        exceptions,
      ),
    [rules, households, exceptions, grid],
  );
  const dayByDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  // "Who has the child now, and when's the next handoff?" — computed over a fixed
  // 30-day horizon from today, independent of the month being viewed.
  const status = useMemo(() => {
    if (!hasActivePlan) return null;
    const horizon = applyExceptions(
      generateBaseline({ rules, households, rangeStart: today, rangeEnd: addDays(today, 30) }),
      exceptions,
    );
    const todayDay = horizon[0];
    const currentId = todayDay?.householdId ?? null;
    const change = horizon.find((d) => d.householdId && d.householdId !== currentId) ?? null;
    return {
      current: currentId ? householdById.get(currentId) ?? null : null,
      change,
      changeHousehold: change?.householdId ? householdById.get(change.householdId) ?? null : null,
    };
  }, [hasActivePlan, rules, households, exceptions, today, householdById]);

  // Surface gaps in the viewed month where the plan assigns no one.
  const hasGap = hasActivePlan && days.some((d) => isSameMonth(d.date, year, month) && d.source === 'unassigned');

  const schoolByDate = useMemo(
    () => buildRangeMap(schoolDates.map((s) => ({ start: s.date, end: s.end_date ?? s.date, item: s })), grid.gridStart, grid.gridEnd),
    [schoolDates, grid],
  );
  const eventsByDate = useMemo(
    () => buildRangeMap(events.map((e) => ({ start: e.date, end: e.date, item: e })), grid.gridStart, grid.gridEnd),
    [events, grid],
  );
  const tripsByDate = useMemo(
    () => buildRangeMap(trips.map((t) => ({ start: t.start_date, end: t.end_date, item: t })), grid.gridStart, grid.gridEnd),
    [trips, grid],
  );
  const exceptionsByDate = useMemo(
    () => buildRangeMap(exceptions.map((x) => ({ start: x.start_date, end: x.end_date, item: x })), grid.gridStart, grid.gridEnd),
    [exceptions, grid],
  );
  const requestsByDate = useMemo(
    () => buildRangeMap(requests.map((r) => ({ start: r.start_date, end: r.end_date, item: r })), grid.gridStart, grid.gridEnd),
    [requests, grid],
  );

  function changeMonth(delta: number) {
    const idx = year * 12 + (month - 1) + delta;
    setYear(Math.floor(idx / 12));
    setMonth((idx % 12) + 1);
  }

  // Swipe left/right to change month (with button fallback).
  const touch = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) changeMonth(dx < 0 ? 1 : -1);
  }

  const selected = selectedDate
    ? {
        day: dayByDate.get(selectedDate),
        household: (() => {
          const id = dayByDate.get(selectedDate)?.householdId;
          return id ? householdById.get(id) : undefined;
        })(),
      }
    : null;

  return (
    <div className="space-y-4">
      {/* Now / next changeover summary — the question this app exists to answer. */}
      {status?.current && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm">
          <span className="h-9 w-9 shrink-0 rounded-full" style={{ backgroundColor: status.current.color }} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              With {status.current.name} now
            </p>
            {status.change && status.changeHousehold ? (
              <p className="text-xs text-muted-foreground">
                Next changeover: {formatFullDate(status.change.date)} → {status.changeHousehold.name}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No changeover in the next 30 days.</p>
            )}
          </div>
        </div>
      )}

      {hasGap && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          Some days this month have no one assigned — check the parenting plan for gaps.
        </p>
      )}

      {/* View toggle + add event */}
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
          {(['month', 'agenda'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn(
                'min-h-[2.5rem] rounded-md px-4 text-sm font-medium capitalize transition',
                view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => addEvent(today)}
          className="flex min-h-[2.5rem] items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Event
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {households.map((h) => (
          <span key={h.id} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: h.color }} />
            <span className="font-medium text-foreground">{h.name}</span>
          </span>
        ))}
      </div>

      {/* Layer toggles */}
      <div className="flex flex-wrap gap-2">
        {LAYER_ORDER.map((key) => {
          const active = layers[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setLayers((s) => ({ ...s, [key]: !s[key] }))}
              aria-pressed={active}
              className={cn(
                'flex min-h-[2.5rem] items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition',
                active ? 'border-transparent bg-accent text-accent-foreground' : 'border-border bg-card text-muted-foreground',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', LAYER_META[key].dot, !active && 'opacity-30')} />
              {LAYER_META[key].label}
            </button>
          );
        })}
      </div>

      {!hasActivePlan && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          No active parenting plan yet — the schedule layer is empty.
        </p>
      )}

      {/* Sticky month nav + weekday header (sits below the shell brand bar). */}
      <div
        className="sticky z-20 -mx-4 border-b border-border bg-background/95 px-4 pb-2 pt-2 backdrop-blur"
        style={{ top: 'calc(var(--sat) + 3.5rem)' }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            aria-label="Previous month"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-base font-semibold text-foreground">{formatMonthLabel(year, month)}</h2>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="Next month"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        {view === 'month' && (
          <div className="mt-2 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[11px] font-medium text-muted-foreground">
                {w}
              </div>
            ))}
          </div>
        )}
      </div>

      {view === 'month' ? (
        <div className="grid grid-cols-7 gap-1" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {grid.days.map((date) => {
            const da = dayByDate.get(date);
            const hh = da?.householdId ? householdById.get(da.householdId) : undefined;
            const isToday = date === today;
            const inMonth = isSameMonth(date, year, month);
            const isException = da?.source === 'exception';
            const tint = layers.parenting && hh ? tintStyle(hh.color) : undefined;
            const exOutline =
              layers.parenting && isException && hh
                ? { outline: `1.5px dashed ${hh.color}`, outlineOffset: '-3px' }
                : undefined;
            const schoolCount = layers.school ? schoolByDate.get(date)?.length ?? 0 : 0;
            const eventCount = layers.events ? eventsByDate.get(date)?.length ?? 0 : 0;
            const tripCount = layers.trips ? tripsByDate.get(date)?.length ?? 0 : 0;
            const requestCount = layers.requests ? requestsByDate.get(date)?.length ?? 0 : 0;
            const hasSchool = schoolCount > 0;
            const hasEvents = eventCount > 0;
            const hasTrips = tripCount > 0;
            const hasRequests = requestCount > 0;
            const ariaLabel = [
              formatFullDate(date),
              layers.parenting && hh ? `with ${hh.name}${isException ? ' (swap)' : ''}` : null,
              eventCount ? `${eventCount} event${eventCount > 1 ? 's' : ''}` : null,
              schoolCount ? 'school' : null,
              tripCount ? `${tripCount} trip${tripCount > 1 ? 's' : ''}` : null,
              requestCount ? `${requestCount} pending request${requestCount > 1 ? 's' : ''}` : null,
            ]
              .filter(Boolean)
              .join(', ');

            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                aria-label={ariaLabel}
                style={{ ...tint, ...exOutline }}
                className={cn(
                  'relative flex min-h-[3.5rem] flex-col rounded-lg border border-black/5 p-1 text-left transition sm:min-h-[4.5rem]',
                  !inMonth && 'opacity-50',
                  isToday && 'ring-2 ring-primary',
                )}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={cn(
                      'text-[11px] font-medium',
                      isToday ? 'text-primary' : inMonth ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {Number(date.slice(8, 10))}
                  </span>
                  {layers.parenting && hh && (
                    <span className="text-[10px] font-bold leading-none" style={{ color: hh.color }}>
                      {initial(hh.name)}
                    </span>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-0.5 pt-0.5">
                  {isException && layers.parenting && hh && (
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hh.color }} />
                  )}
                  {hasSchool && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                  {hasEvents && <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />}
                  {hasTrips && <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />}
                  {hasRequests && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {eachDay(grid.monthStart, grid.monthEnd).map((date) => {
            const da = dayByDate.get(date);
            const hh = da?.householdId ? householdById.get(da.householdId) : undefined;
            const isToday = date === today;
            const isException = da?.source === 'exception';
            const sch = layers.school ? schoolByDate.get(date) ?? [] : [];
            const evs = layers.events ? eventsByDate.get(date) ?? [] : [];
            const trs = layers.trips ? tripsByDate.get(date) ?? [] : [];
            const reqs = layers.requests ? requestsByDate.get(date) ?? [] : [];
            return (
              <li key={date}>
                <button
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  className={cn('flex min-h-[3.5rem] w-full items-center gap-3 px-3 py-2 text-left', isToday && 'bg-accent/40')}
                >
                  <div className={cn('flex w-10 shrink-0 flex-col items-center', isToday && 'text-primary')}>
                    <span className="text-[10px] uppercase text-muted-foreground">{weekdayShort(date)}</span>
                    <span className="text-lg font-semibold leading-none">{Number(date.slice(8, 10))}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    {layers.parenting && hh ? (
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: hh.color }} />
                        <span className="truncate text-sm font-medium text-foreground">{hh.name}</span>
                        {isException && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">swap</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                    {layers.parenting && (da?.pickupTime || da?.dropoffTime) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {da?.pickupTime && `Pickup ${formatClock(da.pickupTime)}`}
                        {da?.pickupTime && da?.dropoffTime && ' · '}
                        {da?.dropoffTime && `Dropoff ${formatClock(da.dropoffTime)}`}
                      </p>
                    )}
                    {sch.length + evs.length + trs.length + reqs.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {sch.map((s) => (
                          <Chip key={s.id} className={LAYER_META.school.chip}>{s.title}</Chip>
                        ))}
                        {evs.map((e) => (
                          <Chip key={e.id} className={LAYER_META.events.chip}>{e.title}</Chip>
                        ))}
                        {trs.map((t) => (
                          <Chip key={t.id} className={LAYER_META.trips.chip}>{t.title}</Chip>
                        ))}
                        {reqs.map((r) => (
                          <Chip key={r.id} className={LAYER_META.requests.chip}>{r.title}</Chip>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedDate && (
        <DaySheet
          date={selectedDate}
          day={selected?.day}
          household={selected?.household}
          households={households}
          exceptions={exceptionsByDate.get(selectedDate) ?? []}
          school={schoolByDate.get(selectedDate) ?? []}
          events={eventsByDate.get(selectedDate) ?? []}
          trips={tripsByDate.get(selectedDate) ?? []}
          requests={requestsByDate.get(selectedDate) ?? []}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onAddEvent={addEvent}
          onEditEvent={editEvent}
          onEditSeries={editSeries}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {eventForm && (
        <EventForm
          mode={eventForm.mode}
          date={eventForm.date}
          event={eventForm.event}
          series={eventForm.series}
          onClose={() => setEventForm(null)}
        />
      )}
    </div>
  );
}

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn('max-w-[10rem] truncate rounded px-1.5 py-0.5 text-[10px] font-medium', className)}>
      {children}
    </span>
  );
}
