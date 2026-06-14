'use client';

import { useState, useTransition } from 'react';
import { Check, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { alertClass, fieldClass, infoClass } from '@/components/auth/field-styles';
import { todayISO } from '@/lib/dates';
import type { SchoolCategory } from '@/lib/types';
import {
  addDate, approveDates, deleteDate, rejectDates, updateDate, type SchoolResult,
} from './actions';
import { extractDates } from './extract';
import {
  dateStatusBadge, formatDateRange, SCHOOL_CATEGORIES, schoolCategoryLabel, type SchoolDateEditRow,
} from './school-utils';

const btnBase =
  'flex min-h-[2.75rem] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition disabled:opacity-60';
const btnPrimary = `${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`;
const btnGhost = `${btnBase} border border-border bg-card text-foreground hover:bg-muted`;
const btnDanger = `${btnBase} border border-border bg-card text-rose-700 hover:bg-rose-50`;

interface FieldState {
  date: string;
  endDate: string;
  category: SchoolCategory;
  title: string;
  notes: string;
}

export function ReviewTable({
  uploadId,
  hasSourceText,
  rows,
}: {
  uploadId: string;
  hasSourceText: boolean;
  rows: SchoolDateEditRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const proposedIds = rows.filter((r) => r.status === 'proposed').map((r) => r.id);

  function run(fn: () => Promise<SchoolResult>) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fn();
      if ('error' in res) setError(res.error);
    });
  }

  function onExtract() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await extractDates({ uploadId });
      if ('error' in res) setError(res.error);
      else
        setInfo(
          `Extracted ${res.kept} date${res.kept === 1 ? '' : 's'}${
            res.dropped ? `, dropped ${res.dropped} invalid` : ''
          }. Review and approve below.`,
        );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {hasSourceText && (
          <button type="button" disabled={pending} onClick={onExtract} className={btnPrimary}>
            <Sparkles className="h-4 w-4" />
            {pending ? 'Working…' : 'Auto-extract from text'}
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => setAdding((v) => !v)} className={btnGhost}>
          <Plus className="h-4 w-4" />
          Add date
        </button>
        {proposedIds.length > 0 && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => approveDates({ uploadId, ids: proposedIds }))}
              className={btnPrimary}
            >
              <Check className="h-4 w-4" />
              Approve all ({proposedIds.length})
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => rejectDates({ uploadId, ids: proposedIds }))}
              className={btnDanger}
            >
              Reject all
            </button>
          </>
        )}
      </div>

      {error && <p className={alertClass}>{error}</p>}
      {info && <p className={infoClass}>{info}</p>}

      {adding && <AddForm uploadId={uploadId} onDone={() => setAdding(false)} />}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No dates yet. Auto-extract from the pasted text, or add them by hand.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <DateCard key={r.id} uploadId={uploadId} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DateFields({ state, set }: { state: FieldState; set: (s: FieldState) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs font-medium text-foreground">
          Date
          <input
            type="date"
            value={state.date}
            onChange={(e) =>
              set({
                ...state,
                date: e.target.value,
                endDate: state.endDate && state.endDate < e.target.value ? '' : state.endDate,
              })
            }
            className={fieldClass}
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-foreground">
          End date (optional)
          <input
            type="date"
            min={state.date}
            value={state.endDate}
            onChange={(e) => set({ ...state, endDate: e.target.value })}
            className={fieldClass}
          />
        </label>
      </div>
      <label className="block space-y-1 text-xs font-medium text-foreground">
        Category
        <select
          value={state.category}
          onChange={(e) => set({ ...state, category: e.target.value as SchoolCategory })}
          className={fieldClass}
        >
          {SCHOOL_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-xs font-medium text-foreground">
        Title
        <input
          value={state.title}
          onChange={(e) => set({ ...state, title: e.target.value })}
          className={fieldClass}
          placeholder="e.g. Winter Break"
        />
      </label>
      <label className="block space-y-1 text-xs font-medium text-foreground">
        Notes (optional)
        <input value={state.notes} onChange={(e) => set({ ...state, notes: e.target.value })} className={fieldClass} />
      </label>
    </div>
  );
}

function AddForm({ uploadId, onDone }: { uploadId: string; onDone: () => void }) {
  const [state, setState] = useState<FieldState>({
    date: todayISO(),
    endDate: '',
    category: 'no_school',
    title: '',
    notes: '',
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!state.title.trim()) {
      setError('Title is required.');
      return;
    }
    startTransition(async () => {
      const res = await addDate({
        uploadId,
        date: state.date,
        endDate: state.endDate || null,
        category: state.category,
        title: state.title,
        notes: state.notes || null,
      });
      if ('error' in res) setError(res.error);
      else onDone();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
      <p className="text-sm font-medium text-foreground">Add a date</p>
      {error && <p className={alertClass}>{error}</p>}
      <DateFields state={state} set={setState} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={submit} className={btnPrimary}>
          {pending ? 'Adding…' : 'Add'}
        </button>
        <button type="button" disabled={pending} onClick={onDone} className={btnGhost}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DateCard({ uploadId, row }: { uploadId: string; row: SchoolDateEditRow }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<FieldState>({
    date: row.date,
    endDate: row.end_date ?? '',
    category: row.category,
    title: row.title,
    notes: row.notes ?? '',
  });
  const badge = dateStatusBadge(row.status);

  function run(fn: () => Promise<SchoolResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ('error' in res) setError(res.error);
      else after?.();
    });
  }

  if (editing) {
    return (
      <li className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        {error && <p className={alertClass}>{error}</p>}
        <DateFields state={state} set={setState} />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  updateDate({
                    id: row.id,
                    uploadId,
                    date: state.date,
                    endDate: state.endDate || null,
                    category: state.category,
                    title: state.title,
                    notes: state.notes || null,
                  }),
                () => setEditing(false),
              )
            }
            className={btnPrimary}
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className={btnGhost}
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{row.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateRange(row.date, row.end_date)} · {schoolCategoryLabel(row.category)}
          </p>
          {row.notes && <p className="mt-1 text-xs text-muted-foreground">{row.notes}</p>}
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', badge.className)}>
          {badge.label}
        </span>
      </div>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {row.status !== 'approved' && (
          <button type="button" disabled={pending} onClick={() => run(() => approveDates({ uploadId, ids: [row.id] }))} className={btnPrimary}>
            <Check className="h-4 w-4" />
            Approve
          </button>
        )}
        {row.status !== 'rejected' && (
          <button type="button" disabled={pending} onClick={() => run(() => rejectDates({ uploadId, ids: [row.id] }))} className={btnDanger}>
            Reject
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => setEditing(true)} className={btnGhost}>
          <Pencil className="h-4 w-4" />
          Edit
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => deleteDate({ id: row.id, uploadId }))} className={btnDanger}>
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </li>
  );
}
