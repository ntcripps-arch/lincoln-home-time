'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { familyContext } from '@/lib/supabase/auth';
import { todayISO } from '@/lib/dates';
import {
  FIXED_HOLIDAY_LABELS,
  fixedHolidayOccurrences,
  yearMatchesParity,
  type FixedHolidayKind,
} from '@/lib/holidays';
import type { ISODate } from '@/lib/types';
import { extractPlan, type ExtractedHoliday, type Parent } from './extract';

export type PlanResult = { ok: true; versionId: string } | { error: string };
export type SimpleResult = { ok: true } | { error: string };

type Occurrence = { start: ISODate; end: ISODate };
const FIXED_KINDS = new Set(Object.keys(FIXED_HOLIDAY_LABELS));

// 6 calendar years covers ~5 upcoming school years (holidays in Jan–Jul of the
// final year belong to that school year). Easy to regenerate later.
function horizonYears(): number[] {
  const y = Number(todayISO().slice(0, 4));
  return Array.from({ length: 6 }, (_, i) => y + i);
}

type AdminCtx = { ok: false; error: string } | { ok: true; user: User; familyId: string };

async function adminContext(supabase: SupabaseClient): Promise<AdminCtx> {
  const ctx = await familyContext(supabase);
  if (!ctx.ok) return ctx;
  if (ctx.role !== 'admin') return { ok: false, error: 'Only a family admin can manage the parenting plan.' };
  return { ok: true, user: ctx.user, familyId: ctx.familyId };
}

interface Household {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

// Map MOM/DAD labels to household ids by name; fall back to sort order.
function householdMap(households: Household[]) {
  const byName = (re: RegExp) => households.find((h) => re.test(h.name.toLowerCase()))?.id;
  const sorted = [...households].sort((a, b) => a.sort_order - b.sort_order);
  const momId = byName(/mom|mother/) ?? sorted[0]?.id ?? null;
  const dadId = byName(/dad|father/) ?? sorted[1]?.id ?? sorted[0]?.id ?? null;
  return { momId, dadId };
}

interface RuleInsert {
  plan_version_id: string;
  family_id: string;
  rule_type: string;
  household_id: string | null;
  config: Record<string, unknown>;
  priority: number;
  label: string;
}

function holidayRules(
  h: ExtractedHoliday,
  ctx: {
    versionId: string;
    familyId: string;
    momId: string | null;
    dadId: string | null;
    years: number[];
    breaks: { title: string; date: string; end_date: string | null }[];
  },
): RuleInsert[] {
  const idOf = (p: string): string | null => (p === 'MOM' ? ctx.momId : p === 'DAD' ? ctx.dadId : null);

  const occFor = (parity: 'even' | 'odd' | 'every'): Occurrence[] => {
    if (h.basis === 'fixed' && FIXED_KINDS.has(h.fixedKind)) {
      return fixedHolidayOccurrences(h.fixedKind as FixedHolidayKind, ctx.years, parity);
    }
    if (h.basis === 'school_break' && h.breakKeyword) {
      const kw = h.breakKeyword.toLowerCase();
      return ctx.breaks
        .filter((b) => b.title.toLowerCase().includes(kw))
        .filter((b) => yearMatchesParity(Number(b.date.slice(0, 4)), parity))
        .map((b) => ({ start: b.date, end: (b.end_date ?? b.date) as ISODate }));
    }
    return [];
  };

  const mk = (householdId: string | null, occurrences: Occurrence[], suffix: string): RuleInsert | null => {
    if (!householdId || occurrences.length === 0) return null;
    const config: Record<string, unknown> = { kind: 'holiday', name: h.name, householdId, occurrences };
    if (h.pickupTime) config.pickupTime = h.pickupTime;
    if (h.dropoffTime) config.dropoffTime = h.dropoffTime;
    return {
      plan_version_id: ctx.versionId,
      family_id: ctx.familyId,
      rule_type: 'holiday',
      household_id: householdId,
      config,
      priority: 100,
      label: `${h.name}${suffix}`,
    };
  };

  if (h.assignment === 'every_year') {
    const rule = mk(idOf(h.everyYearParent), occFor('every'), '');
    return rule ? [rule] : [];
  }
  // even/odd → two rules
  return [
    mk(idOf(h.evenYearParent), occFor('even'), ' (even years)'),
    mk(idOf(h.oddYearParent), occFor('odd'), ' (odd years)'),
  ].filter((r): r is RuleInsert => r !== null);
}

export async function createPlanDraft(input: { imagePaths: string[] }): Promise<PlanResult> {
  const supabase = createClient();
  const ctx = await adminContext(supabase);
  if (!ctx.ok) return { error: ctx.error };
  const { familyId } = ctx;
  if (!input.imagePaths.length) return { error: 'Upload at least one plan image.' };
  // Defense-in-depth: every path must live under this family's folder.
  if (input.imagePaths.some((p) => !p.startsWith(`${familyId}/`))) return { error: 'Invalid upload path.' };

  const { data: hh } = await supabase
    .from('households')
    .select('id, name, color, sort_order')
    .eq('family_id', familyId)
    .order('sort_order');
  const households = (hh ?? []) as Household[];
  if (households.length < 2) return { error: 'Set up both households before importing a plan.' };
  const { momId, dadId } = householdMap(households);
  const momName = households.find((h) => h.id === momId)?.name ?? 'Mom';
  const dadName = households.find((h) => h.id === dadId)?.name ?? 'Dad';

  const extracted = await extractPlan({ imagePaths: input.imagePaths, momName, dadName });
  if ('error' in extracted) return { error: extracted.error };
  const plan = extracted.plan;

  // Approved school breaks resolve break-tied holiday dates.
  const { data: breakRows } = await supabase
    .from('school_calendar_dates')
    .select('title, date, end_date')
    .eq('family_id', familyId)
    .eq('status', 'approved')
    .eq('category', 'break');
  const breaks = (breakRows ?? []) as { title: string; date: string; end_date: string | null }[];

  // Next version number.
  const { data: top } = await supabase
    .from('parenting_plan_versions')
    .select('version')
    .eq('family_id', familyId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((top?.version as number) ?? 0) + 1;

  const { data: version, error: vErr } = await supabase
    .from('parenting_plan_versions')
    .insert({
      family_id: familyId,
      version: nextVersion,
      status: 'draft',
      locked: false,
      source_file_path: input.imagePaths[0].split('/').slice(0, 2).join('/'),
      notes: 'Imported from plan document (draft — review before activating).',
      created_by: ctx.user.id,
    })
    .select('id')
    .single();
  if (vErr) return { error: vErr.message };
  const versionId = version.id as string;

  const rules: RuleInsert[] = [];

  // Base rotation.
  if (plan.rotation.present) {
    const parentId = (p: Parent) => (p === 'MOM' ? momId : dadId);
    rules.push({
      plan_version_id: versionId,
      family_id: familyId,
      rule_type: 'custom_cycle',
      household_id: null,
      config: {
        kind: 'custom_cycle',
        anchorDate: plan.rotation.anchorDate,
        parentA: parentId(plan.rotation.parentA),
        parentB: parentId(plan.rotation.parentB),
        pattern: plan.rotation.pattern,
      },
      priority: 0,
      label: plan.rotation.label || 'Residential rotation',
    });
  }

  // Holidays.
  const years = horizonYears();
  for (const h of plan.holidays) {
    rules.push(...holidayRules(h, { versionId, familyId, momId, dadId, years, breaks }));
  }

  if (rules.length > 0) {
    const { error: rErr } = await supabase.from('parenting_schedule_rules').insert(rules);
    if (rErr) {
      await supabase.from('parenting_plan_versions').delete().eq('id', versionId);
      return { error: rErr.message };
    }
  }

  revalidatePath('/parenting-plan');
  redirect(`/parenting-plan?draft=${versionId}`);
}

export async function reassignRuleHousehold(input: { ruleId: string; householdId: string }): Promise<SimpleResult> {
  const supabase = createClient();
  const ctx = await adminContext(supabase);
  if (!ctx.ok) return { error: ctx.error };

  const { data: rule } = await supabase
    .from('parenting_schedule_rules')
    .select('config')
    .eq('id', input.ruleId)
    .maybeSingle();
  if (!rule) return { error: 'Rule not found.' };
  const config = { ...(rule.config as Record<string, unknown>), householdId: input.householdId };

  const { data, error } = await supabase
    .from('parenting_schedule_rules')
    .update({ household_id: input.householdId, config })
    .eq('id', input.ruleId)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Could not update (plan may be locked).' };
  revalidatePath('/parenting-plan');
  return { ok: true };
}

export async function deletePlanRule(input: { ruleId: string }): Promise<SimpleResult> {
  const supabase = createClient();
  const ctx = await adminContext(supabase);
  if (!ctx.ok) return { error: ctx.error };
  const { data, error } = await supabase
    .from('parenting_schedule_rules')
    .delete()
    .eq('id', input.ruleId)
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Could not delete (plan may be locked).' };
  revalidatePath('/parenting-plan');
  return { ok: true };
}

export async function activatePlan(input: { versionId: string }): Promise<SimpleResult> {
  const supabase = createClient();
  const ctx = await adminContext(supabase);
  if (!ctx.ok) return { error: ctx.error };
  const { error } = await supabase.rpc('activate_plan_version', { p_version_id: input.versionId });
  if (error) return { error: error.message };
  revalidatePath('/parenting-plan');
  revalidatePath('/calendar');
  return { ok: true };
}

export async function discardDraft(input: { versionId: string }): Promise<SimpleResult> {
  const supabase = createClient();
  const ctx = await adminContext(supabase);
  if (!ctx.ok) return { error: ctx.error };
  const { data, error } = await supabase
    .from('parenting_plan_versions')
    .delete()
    .eq('id', input.versionId)
    .eq('status', 'draft')
    .select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Could not discard (only drafts can be discarded).' };
  revalidatePath('/parenting-plan');
  return { ok: true };
}
