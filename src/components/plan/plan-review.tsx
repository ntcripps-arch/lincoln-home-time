'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { activatePlan, deletePlanRule, discardDraft, reassignRuleHousehold } from './actions';
import {
  formatOccurrence, holidayOccurrences, holidayTimes, isHolidayRule, isRotationRule,
  rotationSummary, ruleHouseholdId, type PlanRuleRow,
} from './plan-utils';

interface Household {
  id: string;
  name: string;
  color: string;
}

const btn =
  'flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition disabled:opacity-60';

export function PlanReview({
  versionId,
  version,
  rules,
  households,
}: {
  versionId: string;
  version: number;
  rules: PlanRuleRow[];
  households: Household[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'activate' | 'discard'>(null);
  const [pending, startTransition] = useTransition();

  const hh = (id: string | null) => households.find((h) => h.id === id);
  const rotations = rules.filter(isRotationRule);
  const holidays = rules.filter(isHolidayRule).sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));

  function run(fn: () => Promise<{ ok: true } | { error: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if ('error' in res) setError(res.error);
      else (after ?? (() => router.refresh()))();
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Draft plan v{version} — review</h2>
        <p className="text-sm text-muted-foreground">
          Imported from the plan document. Check the rotation and holidays, fix any household
          assignments, then activate. Activating locks this version and replaces the current plan.
        </p>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {/* Rotation */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Residential rotation</h3>
        {rotations.length === 0 && <p className="text-sm text-muted-foreground">No rotation was extracted.</p>}
        {rotations.map((r) => {
          const { aDays, bDays, length } = rotationSummary(r.config);
          const a = hh(r.config.parentA as string);
          const b = hh(r.config.parentB as string);
          return (
            <div key={r.id} className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium text-foreground">{r.label}</p>
              {length > 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {length}-day cycle · {a?.name ?? 'A'} {aDays}d · {b?.name ?? 'B'} {bDays}d
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Holidays */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Holidays ({holidays.length})
        </h3>
        {holidays.length === 0 && <p className="text-sm text-muted-foreground">No holiday rules were extracted.</p>}
        {holidays.map((r) => {
          const occ = holidayOccurrences(r.config);
          const times = holidayTimes(r.config);
          const householdId = ruleHouseholdId(r);
          return (
            <div key={r.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{r.label}</p>
                  {times && <p className="text-xs text-muted-foreground">{times}</p>}
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deletePlanRule({ ruleId: r.id }))}
                  aria-label="Delete rule"
                  className="shrink-0 text-rose-700 hover:text-rose-900 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs text-muted-foreground" htmlFor={`hh-${r.id}`}>
                  Household
                </label>
                <select
                  id={`hh-${r.id}`}
                  disabled={pending}
                  value={householdId ?? ''}
                  onChange={(e) => run(() => reassignRuleHousehold({ ruleId: r.id, householdId: e.target.value }))}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
              {occ.length === 0 ? (
                <p className="mt-2 text-xs text-amber-700">
                  No dates yet — upload &amp; approve the matching school calendar, then re-import, or add this
                  holiday manually.
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {occ.length} date{occ.length > 1 ? 's' : ''}: {occ.slice(0, 4).map(formatOccurrence).join(' · ')}
                  {occ.length > 4 ? ' …' : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      {confirm === 'activate' ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <p className="text-sm font-medium text-foreground">
            Activate this plan? It locks v{version} and replaces the current active plan on the calendar.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => activatePlan({ versionId }), () => router.refresh())}
              className={cn(btn, 'bg-primary text-primary-foreground hover:bg-primary/90')}
            >
              {pending ? 'Activating…' : 'Activate plan'}
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirm(null)} className={cn(btn, 'border border-border bg-card text-foreground hover:bg-muted')}>
              Cancel
            </button>
          </div>
        </div>
      ) : confirm === 'discard' ? (
        <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm font-medium text-rose-900">Discard this draft and its extracted rules?</p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => discardDraft({ versionId }))} className={cn(btn, 'border border-border bg-card text-rose-700 hover:bg-rose-50')}>
              {pending ? 'Discarding…' : 'Discard draft'}
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirm(null)} className={cn(btn, 'border border-border bg-card text-foreground hover:bg-muted')}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => setConfirm('activate')} className={cn(btn, 'bg-primary text-primary-foreground hover:bg-primary/90')}>
            Activate plan
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirm('discard')} className={cn(btn, 'border border-border bg-card text-rose-700 hover:bg-rose-50')}>
            Discard draft
          </button>
        </div>
      )}
    </section>
  );
}
