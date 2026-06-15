'use client';

import { useState, useTransition } from 'react';
import { Bed, Car, MapPin, Plane, Plus, RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldClass } from '@/components/auth/field-styles';
import { FAMILY_TZ, TIME_ZONES, toLocalInput, toZonedInput } from '@/lib/dates';
import type { SegmentType, TripSegment } from '@/lib/types';
import { addSegment, deleteSegment, updateSegment, type TripResult } from './actions';
import { lookupFlight, refreshFlightStatus } from './flight-lookup';
import { SEGMENT_TYPES, segmentDisplay, segmentTypeLabel } from './trip-utils';
import { useFlightTracking } from './use-flight-tracking';

const SEGMENT_ICON: Record<SegmentType, typeof Plane> = {
  flight: Plane,
  lodging: Bed,
  ground: Car,
  other: MapPin,
};

const NON_FLIGHT_COPY: Record<string, { title: string; start: string; end: string; location: string }> = {
  lodging: { title: 'Marriott Downtown', start: 'Check-in', end: 'Check-out', location: 'Address' },
  ground: { title: 'Rental car', start: 'Pick-up', end: 'Drop-off', location: 'Location' },
  other: { title: 'Activity', start: 'Start', end: 'End', location: 'Location' },
};

const btnBase =
  'flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition disabled:opacity-60';
const btnPrimary = `${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`;
const btnGhost = `${btnBase} border border-border bg-card text-foreground hover:bg-muted`;
const btnDanger = `${btnBase} border border-border bg-card text-rose-700 hover:bg-rose-50`;

interface FieldState {
  segmentType: SegmentType;
  confirmation: string;
  // non-flight
  title: string;
  startLocal: string;
  endLocal: string;
  location: string;
  room: string;
  // flight
  airline: string;
  flightNumber: string;
  flightIata: string;
  flightDate: string;
  depCity: string;
  depIata: string;
  depTz: string;
  depLocal: string;
  arrCity: string;
  arrIata: string;
  arrTz: string;
  arrLocal: string;
  status: string;
  depActual: string;
  depEstimated: string;
  arrActual: string;
  arrEstimated: string;
  depGate: string;
  arrGate: string;
  arrBaggage: string;
}

function emptyState(): FieldState {
  return {
    segmentType: 'flight', confirmation: '',
    title: '', startLocal: '', endLocal: '', location: '', room: '',
    airline: '', flightNumber: '', flightIata: '', flightDate: '',
    depCity: '', depIata: '', depTz: FAMILY_TZ, depLocal: '',
    arrCity: '', arrIata: '', arrTz: FAMILY_TZ, arrLocal: '',
    status: '', depActual: '', depEstimated: '', arrActual: '', arrEstimated: '', depGate: '', arrGate: '', arrBaggage: '',
  };
}

function fromSegment(seg: TripSegment): FieldState {
  const d = (seg.details ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const e = emptyState();
  if (seg.segment_type === 'flight') {
    const depTz = s('dep_tz') || FAMILY_TZ;
    const arrTz = s('arr_tz') || FAMILY_TZ;
    return {
      ...e,
      segmentType: 'flight',
      confirmation: seg.confirmation ?? '',
      airline: s('airline'), flightNumber: s('flight_number'), flightIata: s('flight_iata'), flightDate: s('flight_date'),
      depCity: s('dep_city'), depIata: s('dep_iata'), depTz, depLocal: seg.start_at ? toZonedInput(seg.start_at, depTz) : '',
      arrCity: s('arr_city'), arrIata: s('arr_iata'), arrTz, arrLocal: seg.end_at ? toZonedInput(seg.end_at, arrTz) : '',
      status: s('status'), depActual: s('dep_actual'), depEstimated: s('dep_estimated'),
      arrActual: s('arr_actual'), arrEstimated: s('arr_estimated'),
      depGate: s('dep_gate'), arrGate: s('arr_gate'), arrBaggage: s('arr_baggage'),
    };
  }
  return {
    ...e,
    segmentType: seg.segment_type,
    confirmation: seg.confirmation ?? '',
    title: seg.title ?? '',
    startLocal: seg.start_at ? toLocalInput(seg.start_at) : '',
    endLocal: seg.end_at ? toLocalInput(seg.end_at) : '',
    location: seg.location ?? '',
    room: s('room'),
  };
}

function isTrackableFlight(seg: TripSegment): boolean {
  const d = (seg.details ?? {}) as Record<string, unknown>;
  return seg.segment_type === 'flight' && typeof d.flight_iata === 'string' && d.flight_iata !== '';
}

export function SegmentList({ tripId, segments }: { tripId: string; segments: TripSegment[] }) {
  const [adding, setAdding] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const trackable = segments.filter(isTrackableFlight);

  function refreshAll() {
    setRefreshMsg(null);
    startRefresh(async () => {
      let ok = 0;
      let failed = 0;
      // Sequential: the free Aviationstack plan is rate-limited, so don't burst.
      for (const seg of trackable) {
        const res = await refreshFlightStatus({ id: seg.id, tripId });
        if ('error' in res) failed += 1;
        else ok += 1;
      }
      setRefreshMsg(
        `Refreshed ${ok} flight${ok === 1 ? '' : 's'}${failed ? ` · ${failed} couldn’t update` : ''}.`,
      );
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Itinerary</h2>
        <div className="flex gap-2">
          {trackable.length > 1 && (
            <button type="button" disabled={refreshing} onClick={refreshAll} className={btnGhost}>
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              {refreshing ? 'Refreshing…' : 'Refresh flights'}
            </button>
          )}
          <button type="button" onClick={() => setAdding((v) => !v)} className={btnGhost}>
            <Plus className="h-4 w-4" />
            Add segment
          </button>
        </div>
      </div>
      {refreshMsg && <p className="text-xs text-muted-foreground">{refreshMsg}</p>}

      {adding && <SegmentForm tripId={tripId} initial={emptyState()} onDone={() => setAdding(false)} />}

      {segments.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No flights or lodging yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {segments.map((seg) => (
            <SegmentCard key={seg.id} tripId={tripId} seg={seg} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SegmentCard({ tripId, seg }: { tripId: string; seg: TripSegment }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const Icon = SEGMENT_ICON[seg.segment_type] ?? MapPin;
  const v = segmentDisplay(seg);
  const details = (seg.details ?? {}) as Record<string, unknown>;
  const trackable = v.isFlight && typeof details.flight_iata === 'string' && details.flight_iata !== '';
  const live = useFlightTracking(seg, tripId);

  function run(fn: () => Promise<TripResult | { ok: true } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ('error' in res) setError(res.error);
    });
  }

  if (editing) {
    return (
      <li>
        <SegmentForm tripId={tripId} segmentId={seg.id} initial={fromSegment(seg)} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{v.title}</p>
            {v.status && (
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', v.status.className)}>
                {v.status.label}
              </span>
            )}
          </div>
          {v.location && <p className="text-xs text-muted-foreground">{v.location}</p>}

          {v.isFlight ? (
            <div className="mt-1 space-y-0.5 text-xs">
              {v.departs && <p className="text-muted-foreground">Departs {v.departs}</p>}
              {v.arrives && (
                <p className="text-muted-foreground">
                  Arrives {v.arrives}
                  {v.arrivesPt && <span className="text-muted-foreground/70"> · {v.arrivesPt}</span>}
                </p>
              )}
              {v.actual && (
                <p className="font-medium text-foreground">
                  {v.actualLabel} {v.actual}
                  {v.actualPt && <span className="font-normal text-muted-foreground"> · {v.actualPt}</span>}
                </p>
              )}
            </div>
          ) : (
            v.times && <p className="text-xs text-muted-foreground">{v.times}</p>
          )}

          {v.confirmation && <p className="mt-1 text-xs text-muted-foreground">Confirmation: {v.confirmation}</p>}
          {v.extra && <p className="text-xs text-muted-foreground">{v.extra}</p>}
          {v.statusUpdated && <p className="text-[11px] text-muted-foreground/70">Status updated {v.statusUpdated}</p>}
          {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
        </div>
      </div>

      {trackable && live && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
          Auto-updating
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {trackable && (
          <button type="button" disabled={pending} onClick={() => run(() => refreshFlightStatus({ id: seg.id, tripId }))} className={btnGhost}>
            <RefreshCw className="h-4 w-4" />
            {live ? 'Refresh now' : 'Refresh status'}
          </button>
        )}
        <button type="button" onClick={() => setEditing(true)} className={btnGhost}>
          Edit
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => deleteSegment({ id: seg.id, tripId }))} className={btnDanger}>
          Delete
        </button>
      </div>
    </li>
  );
}

function SegmentForm({
  tripId,
  segmentId,
  initial,
  onDone,
}: {
  tripId: string;
  segmentId?: string;
  initial: FieldState;
  onDone: () => void;
}) {
  const [s, setS] = useState<FieldState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);

  function set<K extends keyof FieldState>(key: K, value: FieldState[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  async function doLookup() {
    setLookupMsg(null);
    setError(null);
    setLooking(true);
    const res = await lookupFlight({
      airline: s.airline,
      flightNumber: s.flightNumber,
      flightDate: s.flightDate,
    });
    setLooking(false);
    if ('error' in res) {
      setLookupMsg(res.error);
      return;
    }
    const f = res.flight;
    setS((prev) => ({
      ...prev,
      airline: f.airline || prev.airline,
      flightNumber: f.flightNumber || prev.flightNumber,
      flightIata: f.flightIata || prev.flightIata,
      flightDate: f.flightDate || prev.flightDate,
      depCity: f.depCity || prev.depCity, depIata: f.depIata, depTz: f.depTz || prev.depTz,
      arrCity: f.arrCity || prev.arrCity, arrIata: f.arrIata, arrTz: f.arrTz || prev.arrTz,
      depLocal: f.depScheduled ? toZonedInput(f.depScheduled, f.depTz || prev.depTz) : prev.depLocal,
      arrLocal: f.arrScheduled ? toZonedInput(f.arrScheduled, f.arrTz || prev.arrTz) : prev.arrLocal,
      status: f.status, depActual: f.depActual ?? '', depEstimated: f.depEstimated ?? '',
      arrActual: f.arrActual ?? '', arrEstimated: f.arrEstimated ?? '',
      depGate: f.depGate, arrGate: f.arrGate, arrBaggage: f.arrBaggage,
    }));
    setLookupMsg(`Found ${[f.airline, f.flightNumber].filter(Boolean).join(' ')}${f.status ? ` · ${f.status}` : ''}.`);
  }

  function submit() {
    setError(null);
    if (s.segmentType === 'flight') {
      if (!s.airline.trim() && !s.flightNumber.trim() && !s.flightIata.trim()) {
        setError('Add an airline or flight number (or look one up).');
        return;
      }
    }
    startTransition(async () => {
      const res: TripResult = segmentId
        ? await updateSegment({ id: segmentId, tripId, ...s })
        : await addSegment({ tripId, ...s });
      if ('error' in res) setError(res.error);
      else onDone();
    });
  }

  const isFlight = s.segmentType === 'flight';
  const copy = NON_FLIGHT_COPY[s.segmentType] ?? NON_FLIGHT_COPY.other;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
      {error && <p className="text-sm text-rose-700">{error}</p>}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-foreground">Type</span>
        <select value={s.segmentType} onChange={(e) => set('segmentType', e.target.value as SegmentType)} className={fieldClass}>
          {SEGMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {isFlight ? (
        <>
          <div className="space-y-2 rounded-lg border border-dashed border-border bg-card p-3">
            <p className="text-sm font-medium text-foreground">Look up the flight</p>
            <Field label="Flight date">
              <input type="date" value={s.flightDate} onChange={(e) => set('flightDate', e.target.value)} className={fieldClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Airline">
                <input value={s.airline} onChange={(e) => set('airline', e.target.value)} className={fieldClass} placeholder="AS (or Alaska)" />
              </Field>
              <Field label="Flight number">
                <input value={s.flightNumber} onChange={(e) => set('flightNumber', e.target.value)} className={fieldClass} placeholder="1366" />
              </Field>
            </div>
            <button
              type="button"
              onClick={doLookup}
              disabled={looking || !s.airline.trim() || !s.flightNumber.trim()}
              className={btnGhost}
            >
              <Search className="h-4 w-4" />
              {looking ? 'Looking up…' : 'Look up flight'}
            </button>
            {lookupMsg && <p className="text-xs text-muted-foreground">{lookupMsg}</p>}
            <p className="text-[11px] text-muted-foreground">
              Set the flight date so we fetch the right day. Auto-fills airports, times, and time zones. Works best on or near the
              travel day; otherwise fill in the details below.
            </p>
          </div>

          <Field label="Departure city / airport">
            <input value={s.depCity} onChange={(e) => set('depCity', e.target.value)} className={fieldClass} placeholder="Seattle (SEA)" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Departs">
              <input type="datetime-local" value={s.depLocal} onChange={(e) => set('depLocal', e.target.value)} className={fieldClass} />
            </Field>
            <Field label="Departure time zone">
              <ZoneSelect value={s.depTz} onChange={(z) => set('depTz', z)} />
            </Field>
          </div>

          <Field label="Arrival city / airport">
            <input value={s.arrCity} onChange={(e) => set('arrCity', e.target.value)} className={fieldClass} placeholder="London Heathrow (LHR)" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Arrives">
              <input type="datetime-local" value={s.arrLocal} onChange={(e) => set('arrLocal', e.target.value)} className={fieldClass} />
            </Field>
            <Field label="Arrival time zone">
              <ZoneSelect value={s.arrTz} onChange={(z) => set('arrTz', z)} />
            </Field>
          </div>
        </>
      ) : (
        <>
          <Field label="Title">
            <input value={s.title} onChange={(e) => set('title', e.target.value)} className={fieldClass} placeholder={copy.title} />
          </Field>
          {s.segmentType === 'lodging' && (
            <Field label="Room">
              <input value={s.room} onChange={(e) => set('room', e.target.value)} className={fieldClass} placeholder="King suite" />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${copy.start} (PT)`}>
              <input type="datetime-local" value={s.startLocal} onChange={(e) => set('startLocal', e.target.value)} className={fieldClass} />
            </Field>
            <Field label={`${copy.end} (PT)`}>
              <input type="datetime-local" value={s.endLocal} onChange={(e) => set('endLocal', e.target.value)} className={fieldClass} />
            </Field>
          </div>
          <Field label="Location">
            <input value={s.location} onChange={(e) => set('location', e.target.value)} className={fieldClass} placeholder={copy.location} />
          </Field>
        </>
      )}

      <Field label="Confirmation (optional)">
        <input value={s.confirmation} onChange={(e) => set('confirmation', e.target.value)} className={fieldClass} placeholder="ABC123" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={submit} className={btnPrimary}>
          {pending ? 'Saving…' : segmentId ? 'Save segment' : 'Add segment'}
        </button>
        <button type="button" disabled={pending} onClick={onDone} className={btnGhost}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function ZoneSelect({ value, onChange }: { value: string; onChange: (z: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
      {TIME_ZONES.map((z) => (
        <option key={z.value} value={z.value}>
          {z.label}
        </option>
      ))}
    </select>
  );
}
