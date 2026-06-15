import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatInstant } from '@/lib/dates';
import { PlanIntake } from '@/components/plan/plan-intake';
import { PlanReview } from '@/components/plan/plan-review';
import {
  isHolidayRule, isRotationRule, type PlanRuleRow, type PlanVersionRow,
} from '@/components/plan/plan-utils';

const VERSION_BADGE: Record<PlanVersionRow['status'], string> = {
  active: 'bg-emerald-100 text-emerald-800',
  draft: 'bg-amber-100 text-amber-800',
  archived: 'bg-muted text-muted-foreground',
};

interface Household {
  id: string;
  name: string;
  color: string;
}

export default async function ParentingPlanPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase
    .from('family_members')
    .select('family_id, role')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!me) redirect('/calendar');
  if (me.role !== 'admin') redirect('/calendar'); // plan management is admin-only
  const familyId = me.family_id as string;

  const { data: hh } = await supabase
    .from('households')
    .select('id, name, color')
    .eq('family_id', familyId)
    .order('sort_order');
  const households = (hh ?? []) as Household[];

  const { data: vrows } = await supabase
    .from('parenting_plan_versions')
    .select('id, version, status, locked, created_at, notes')
    .eq('family_id', familyId)
    .order('version', { ascending: false });
  const versions = (vrows ?? []) as PlanVersionRow[];
  const draft = versions.find((v) => v.status === 'draft') ?? null;
  const active = versions.find((v) => v.status === 'active') ?? null;

  async function rulesFor(versionId: string): Promise<PlanRuleRow[]> {
    const { data } = await supabase
      .from('parenting_schedule_rules')
      .select('id, rule_type, household_id, config, priority, label')
      .eq('plan_version_id', versionId);
    return (data ?? []) as PlanRuleRow[];
  }
  const draftRules = draft ? await rulesFor(draft.id) : [];
  const activeRules = active ? await rulesFor(active.id) : [];
  const activeRotation = activeRules.filter(isRotationRule)[0];
  const activeHolidayCount = activeRules.filter(isHolidayRule).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Parenting plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import the plan from its document, review the schedule, and activate it. Activating locks the
          version — the calendar always reads the active plan.
        </p>
      </div>

      {draft && (
        <PlanReview versionId={draft.id} version={draft.version} rules={draftRules} households={households} />
      )}

      {active ? (
        <section className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">Active plan — v{active.version}</h2>
            <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
              Active{active.locked ? ' · locked' : ''}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {activeRotation?.label ?? 'No base rotation'} · {activeHolidayCount} holiday rule
            {activeHolidayCount === 1 ? '' : 's'}.
          </p>
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          No active plan yet.
        </p>
      )}

      {versions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">Version history</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {versions.map((v) => (
              <li key={v.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 text-sm font-semibold text-foreground">v{v.version}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${VERSION_BADGE[v.status]}`}>
                      {v.status}
                    </span>
                    {v.locked && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        locked
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatInstant(v.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  {v.notes && <p className="mt-0.5 text-xs text-muted-foreground">{v.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Plans are versioned: importing a new plan creates the next version, and activating it supersedes
            (archives) the current one. Past versions are kept for reference.
          </p>
        </section>
      )}

      {!draft && <PlanIntake familyId={familyId} />}
    </div>
  );
}
