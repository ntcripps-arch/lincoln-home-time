'use client';

import { useState, useTransition } from 'react';
import { Bed, Car, MapPin, Plane, Plus } from 'lucide-react';
import { fieldClass } from '@/components/auth/field-styles';
import { formatInstant, toLocalInput } from '@/lib/dates';
import type { SegmentType, TripSegment } from '@/lib/types';
import { addSegment, deleteSegment, updateSegment, type TripResult } from './actions';
import { SEGMENT_TYPES, segmentTypeLabel } from './trip-utils';

const SEGMENT_ICON: Record<SegmentType, typeof Plane> = {
  flight: Plane,
  lodging: Bed,
  ground: Car,
  other: MapPin,
};

// Per-type labels/placeholders so the form reads naturally.
const COPY: Record<SegmentType, { title: string; start: string; end: string; location: string }> = {
  flight: { title: 'UA 1234 SEA→SNA', start: 'Departure', end: 'Arrival', location: 'Airports (SEA → SNA)' },
  lodging: { title: 'Marriott Downtown', start: 'Check-in', end: 'Check-out', location: 'Address' },
  ground: { title: 'Rental car', start: 'Pick-up', end: 'Drop-off', location: 'Location' },
  other: { title: 'Activity', start: 'Start', end: 'End', location: 'Location' },
};

const btnBase =
  'flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition disabled:opacity-60';
const btnPrimary = `${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`;
const btnGhost = `${btnBase} border border-border bg-card text-foreground hover:bg-muted`;
const btnDanger = `${btnBase} border border-border bg-card text-rose-700 hover:bg-rose-50`;

const stamp = (ts: string | null) =>
  ts ? `${formatInstant(ts, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PT` : null;

interface FieldState {
  segmentType: SegmentType;
  title: string;
  startLocal: string;
  endLocal: string;
  location: string;
  confirmation: string;
  airline: string;
  flightNumber: string;
  room: string;
}

function emptyState(): FieldState {
  return {
    segmentType: 'flight',
    title: '',
    startLocal: '',
    endLocal: '',
    location: '',
    confirmation: '',
    airline: '',
    flightNumber: '',
    room: '',
  };
}

function fromSegment(seg: TripSegment): FieldState {
  const details = (seg.details ?? {}) as Record<string, unknown>;
  return {
    segmentType: seg.segment_type,
    title: seg.title ?? '',
    startLocal: seg.start_at ? toLocalInput(seg.start_at) : '',
    endLocal: seg.end_at ? toLocalInput(seg.end_at) : '',
    location: seg.location ?? '',
    confirmation: seg.confirmation ?? '',
    airline: typeof details.airline === 'string' ? details.airline : '',
    flightNumber: typeof details.flight_number === 'string' ? details.flight_number : '',
    room: typeof details.room === 'string' ? details.room : '',
  };
}

function detailsFor(s: FieldState): Record<string, string> {
  if (s.segmentType === 'flight') return { airline: s.airline, flight_number: s.flightNumber };
  if (s.segmentType === 'lodging') return { room: s.room };
  return {};
}

export function SegmentList({ tripId, segments }: { tripId: string; segments: TripSegment[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Itinerary</h2>
        <button type="button" onClick={() => setAdding((v) => !v)} className={btnGhost}>
          <Plus className="h-4 w-4" />
          Add segment
        </button>
      </div>

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
  const times = [stamp(seg.start_at), stamp(seg.end_at)].filter(Boolean).join(' → ');
  const details = (seg.details ?? {}) as Record<string, unknown>;
  const extras = [details.airline, details.flight_number, details.room].filter((v): v is string => typeof v === 'string' && v !== '');

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
          <p className="text-sm font-semibold text-foreground">{seg.title ?? segmentTypeLabel(seg.segment_type)}</p>
          {seg.location && <p className="text-xs text-muted-foreground">{seg.location}</p>}
          {times && <p className="text-xs text-muted-foreground">{times}</p>}
          {seg.confirmation && <p className="text-xs text-muted-foreground">Confirmation: {seg.confirmation}</p>}
          {extras.length > 0 && <p className="text-xs text-muted-foreground">{extras.join(' · ')}</p>}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setEditing(true)} className={btnGhost}>
          Edit
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await deleteSegment({ id: seg.id, tripId });
              if ('error' in res) setError(res.error);
            })
          }
          className={btnDanger}
        >
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
  const copy = COPY[s.segmentType];

  function set<K extends keyof FieldState>(key: K, value: FieldState[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    setError(null);
    const base = {
      tripId,
      segmentType: s.segmentType,
      title: s.title,
      startLocal: s.startLocal,
      endLocal: s.endLocal,
      location: s.location,
      confirmation: s.confirmation,
      details: detailsFor(s),
    };
    startTransition(async () => {
      const res: TripResult = segmentId
        ? await updateSegment({ id: segmentId, ...base })
        : await addSegment(base);
      if ('error' in res) setError(res.error);
      else onDone();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Type</label>
        <select value={s.segmentType} onChange={(e) => set('segmentType', e.target.value as SegmentType)} className={fieldClass}>
          {SEGMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Title</label>
        <input value={s.title} onChange={(e) => set('title', e.target.value)} className={fieldClass} placeholder={copy.title} />
      </div>

      {s.segmentType === 'flight' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Airline</label>
            <input value={s.airline} onChange={(e) => set('airline', e.target.value)} className={fieldClass} placeholder="United" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Flight #</label>
            <input value={s.flightNumber} onChange={(e) => set('flightNumber', e.target.value)} className={fieldClass} placeholder="UA 1234" />
          </div>
        </div>
      )}
      {s.segmentType === 'lodging' && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Room</label>
          <input value={s.room} onChange={(e) => set('room', e.target.value)} className={fieldClass} placeholder="King suite" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{copy.start} <span className="text-muted-foreground">(PT)</span></label>
          <input type="datetime-local" value={s.startLocal} onChange={(e) => set('startLocal', e.target.value)} className={fieldClass} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{copy.end} <span className="text-muted-foreground">(PT)</span></label>
          <input type="datetime-local" value={s.endLocal} onChange={(e) => set('endLocal', e.target.value)} className={fieldClass} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Location</label>
        <input value={s.location} onChange={(e) => set('location', e.target.value)} className={fieldClass} placeholder={copy.location} />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Confirmation <span className="text-muted-foreground">(optional)</span></label>
        <input value={s.confirmation} onChange={(e) => set('confirmation', e.target.value)} className={fieldClass} placeholder="ABC123" />
      </div>

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
