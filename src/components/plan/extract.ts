'use server';

import { createClient } from '@/lib/supabase/server';

// Reads parenting-plan document images with Claude vision and returns the
// schedule ALLOCATIONS (who has the child, even/odd year, break-tied vs fixed).
// Concrete dates are computed later in pure code (src/lib/holidays.ts) + the
// approved school calendar — the model is only trusted for semantics, not date
// arithmetic. Opus 4.8 has the strongest vision; sampling params are removed.
const EXTRACT_MODEL = 'claude-opus-4-8';
const ANTHROPIC_VERSION = '2023-06-01';

export type Parent = 'MOM' | 'DAD';

export interface ExtractedRotation {
  present: boolean;
  label: string;
  anchorDate: string; // 'YYYY-MM-DD' — a date when parentA's block begins
  parentA: Parent;
  parentB: Parent;
  pattern: ('A' | 'B')[]; // 14 entries (A = parentA)
}

export interface ExtractedHoliday {
  name: string;
  basis: 'fixed' | 'school_break';
  fixedKind: string; // FixedHolidayKind or ''
  breakKeyword: string; // keyword to match a school break title, or ''
  assignment: 'every_year' | 'even_odd';
  everyYearParent: string; // 'MOM' | 'DAD' | ''
  evenYearParent: string;
  oddYearParent: string;
  pickupTime: string; // 'HH:MM' or ''
  dropoffTime: string;
  notes: string;
}

export interface ExtractedPlan {
  rotation: ExtractedRotation;
  holidays: ExtractedHoliday[];
}

export type PlanExtractResult = { ok: true; plan: ExtractedPlan } | { error: string };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rotation', 'holidays'],
  properties: {
    rotation: {
      type: 'object',
      additionalProperties: false,
      required: ['present', 'label', 'anchorDate', 'parentA', 'parentB', 'pattern'],
      properties: {
        present: { type: 'boolean' },
        label: { type: 'string' },
        anchorDate: { type: 'string', description: 'YYYY-MM-DD, a date parentA’s block begins' },
        parentA: { type: 'string', enum: ['MOM', 'DAD'] },
        parentB: { type: 'string', enum: ['MOM', 'DAD'] },
        pattern: { type: 'array', items: { type: 'string', enum: ['A', 'B'] } },
      },
    },
    holidays: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name', 'basis', 'fixedKind', 'breakKeyword', 'assignment',
          'everyYearParent', 'evenYearParent', 'oddYearParent', 'pickupTime', 'dropoffTime', 'notes',
        ],
        properties: {
          name: { type: 'string' },
          basis: { type: 'string', enum: ['fixed', 'school_break'] },
          fixedKind: {
            type: 'string',
            description:
              'one of mothers_day|fathers_day|independence_day|halloween|easter|new_years_day|christmas_day, else ""',
          },
          breakKeyword: { type: 'string', description: 'e.g. "winter","spring","mid-winter","thanksgiving"; else ""' },
          assignment: { type: 'string', enum: ['every_year', 'even_odd'] },
          everyYearParent: { type: 'string', description: 'MOM|DAD|"" (when assignment=every_year)' },
          evenYearParent: { type: 'string', description: 'MOM|DAD|"" (parent in EVEN years)' },
          oddYearParent: { type: 'string', description: 'MOM|DAD|"" (parent in ODD years)' },
          pickupTime: { type: 'string', description: 'HH:MM 24h or ""' },
          dropoffTime: { type: 'string', description: 'HH:MM 24h or ""' },
          notes: { type: 'string' },
        },
      },
    },
  },
} as const;

function systemPrompt(momName: string, dadName: string): string {
  return [
    'You read photos of a court parenting plan and extract its SCHEDULE ALLOCATIONS as structured data.',
    `Two households: MOM = "${momName}" (also "Mother", "Barrett"), DAD = "${dadName}" (also "Father").`,
    'Always refer to households as MOM or DAD.',
    '',
    'ROTATION (the regular residential schedule):',
    '- Express it as a 14-day pattern of "A"/"B" where "A" = parentA and "B" = parentB.',
    '- Set parentA to whichever parent has the every-other-week block; anchorDate is any real date',
    '  (YYYY-MM-DD) on which parentA’s block begins.',
    '- IMPORTANT: the alternating mid-week WEDNESDAY visit is NO LONGER in effect — exclude it.',
    '  So "Dad every other week Thursday after school → Tuesday before school" with no Wednesday is',
    '  parentA=DAD, anchorDate on a Thursday, pattern ["A","A","A","A","A","B","B","B","B","B","B","B","B","B"].',
    '- If you cannot determine the rotation, set present=false.',
    '',
    'HOLIDAYS (focus here — be thorough and exact):',
    'For each holiday the plan ALLOCATES (skip ones left blank / unfilled), emit one object:',
    '- basis="fixed" for calendar-fixed holidays, and set fixedKind to one of:',
    '  mothers_day, fathers_day, independence_day, halloween, easter, new_years_day, christmas_day.',
    '- basis="school_break" for break-tied holidays (mid-winter, spring, thanksgiving, winter break);',
    '  set breakKeyword to the word that matches the school-calendar break title (e.g. "winter").',
    '- assignment="every_year" → set everyYearParent. assignment="even_odd" → set evenYearParent and',
    '  oddYearParent (which parent has it in EVEN vs ODD calendar years).',
    '- pickupTime/dropoffTime as HH:MM (24h) when the plan gives times, else "".',
    '- Put any important caveat in notes (e.g. Christmas split, "couples with adjacent weekend").',
    'Leave a string field "" when not applicable. Return data ONLY via the schema.',
  ].join('\n');
}

const PARENTS = new Set(['MOM', 'DAD']);

export async function extractPlan(input: {
  imagePaths: string[];
  momName: string;
  dadName: string;
}): Promise<PlanExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: 'Extraction is not configured (missing ANTHROPIC_API_KEY).' };
  if (!input.imagePaths.length) return { error: 'No plan images to read.' };

  const supabase = createClient();
  const images: { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }[] = [];
  for (const path of input.imagePaths) {
    const { data: blob, error } = await supabase.storage.from('plan-documents').download(path);
    if (error || !blob) return { error: 'Could not read an uploaded plan image. Try re-uploading.' };
    const mime = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    images.push({
      type: 'image',
      source: { type: 'base64', media_type: mime, data: Buffer.from(await blob.arrayBuffer()).toString('base64') },
    });
  }

  let data: { content?: { type?: string; text?: string }[] };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        max_tokens: 6000,
        system: systemPrompt(input.momName, input.dadName),
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              ...images,
              { type: 'text', text: 'Extract the rotation and holiday allocations from this parenting plan.' },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { error: `Extraction failed (Claude API ${res.status}).` };
    data = await res.json();
  } catch {
    return { error: 'Could not reach the extraction service. Try again.' };
  }

  const text = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  let parsed: ExtractedPlan;
  try {
    parsed = JSON.parse(text) as ExtractedPlan;
  } catch {
    return { error: 'Could not parse the plan extraction. Try again.' };
  }

  // Light sanity-checks; assembly does the real mapping/validation.
  const r = parsed.rotation;
  if (r?.present) {
    if (!Array.isArray(r.pattern) || r.pattern.length === 0 || !PARENTS.has(r.parentA) || !PARENTS.has(r.parentB)) {
      r.present = false;
    }
  }
  if (!Array.isArray(parsed.holidays)) parsed.holidays = [];
  return { ok: true, plan: parsed };
}
