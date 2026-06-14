'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { SchoolCategory } from '@/lib/types';
import { SCHOOL_CATEGORY_VALUES } from './school-utils';

// claude-sonnet-4-6 supports temperature (sampling params are only removed on
// Fable 5 / Opus 4.7+), so temperature: 0 is valid here.
const EXTRACT_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = '2023-06-01';

export type ExtractResult = { ok: true; kept: number; dropped: number } | { error: string };

interface RawRow {
  date?: unknown;
  end_date?: unknown;
  category?: unknown;
  title?: unknown;
  notes?: unknown;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function systemPrompt(schoolYear: string): string {
  return [
    'You extract school-calendar dates from pasted text into structured JSON.',
    'Return ONLY a JSON array — no prose, no explanation, no markdown code fences.',
    'Each array item must be an object with exactly these keys:',
    '  "date": "YYYY-MM-DD",',
    '  "end_date": "YYYY-MM-DD" or null (use for multi-day breaks; null for single days),',
    '  "category": one of holiday | no_school | early_release | break | teacher_work_day | first_day | last_day | event,',
    '  "title": short string,',
    '  "notes": string or null.',
    '',
    `The school year is ${schoolYear}. The source text usually omits years — infer them per date endpoint:`,
    `months Aug–Dec belong to the first year (${schoolYear.split('-')[0]}), months Jan–Jul to the second year (${schoolYear.split('-')[1]}).`,
    'So "Winter Break Dec 22 – Jan 2" becomes date 2025-12-22, end_date 2026-01-02 (for 2025-2026).',
    '',
    'Category guidance:',
    '- "No School" / non-student day → no_school',
    '- teacher in-service / professional development → teacher_work_day',
    '- Winter Break / Spring Break / Mid-Winter Break → break (with end_date spanning the range)',
    '- named holidays (Thanksgiving, MLK, Presidents Day, Labor Day, Memorial Day) → holiday',
    '- Early Release / Half Day → early_release',
    '- first day of school → first_day; last day of school → last_day',
    '- anything else → event',
    'Never emit a category outside the allowed list.',
  ].join('\n');
}

function stripFences(text: string): string {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : t).trim();
}

export async function extractDates(input: { uploadId: string }): Promise<ExtractResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'You are signed out.' };

    const { data: upload } = await supabase
      .from('school_calendar_uploads')
      .select('source_text, school_year, family_id')
      .eq('id', input.uploadId)
      .maybeSingle();
    if (!upload) return { error: 'Upload not found.' };
    if (!upload.source_text?.trim()) return { error: 'This upload has no pasted text to extract from.' };

    // Admin of this upload's family only.
    const { data: membership } = await supabase
      .from('family_members')
      .select('role')
      .eq('family_id', upload.family_id)
      .eq('profile_id', user.id)
      .maybeSingle();
    if (membership?.role !== 'admin') return { error: 'Only a family admin can run extraction.' };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { error: 'Extraction is not configured (missing ANTHROPIC_API_KEY).' };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        max_tokens: 4000,
        temperature: 0,
        system: systemPrompt(upload.school_year as string),
        messages: [{ role: 'user', content: upload.source_text as string }],
      }),
    });
    if (!res.ok) return { error: `Extraction failed (Claude API ${res.status}).` };

    const data = await res.json();
    const text: string = (data.content ?? [])
      .filter((b: { type?: string }) => b.type === 'text')
      .map((b: { text?: string }) => b.text ?? '')
      .join('');

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(text));
    } catch {
      return { error: 'Could not parse the extraction result. Try again or add dates manually.' };
    }
    if (!Array.isArray(parsed)) return { error: 'Extraction did not return a list. Try again.' };

    const valid: {
      date: string;
      end_date: string | null;
      category: SchoolCategory;
      title: string;
      notes: string | null;
    }[] = [];
    let dropped = 0;

    for (const r of parsed as RawRow[]) {
      const date = typeof r.date === 'string' ? r.date : '';
      const endRaw = r.end_date == null ? null : typeof r.end_date === 'string' ? r.end_date : '';
      const category = r.category as SchoolCategory;
      const title = typeof r.title === 'string' ? r.title.trim() : '';
      const okDate = ISO_DATE.test(date);
      const okEnd = endRaw === null || (ISO_DATE.test(endRaw) && endRaw >= date);
      const okCat = SCHOOL_CATEGORY_VALUES.includes(category);
      if (okDate && okEnd && okCat && title) {
        valid.push({
          date,
          end_date: endRaw,
          category,
          title,
          notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim() : null,
        });
      } else {
        dropped += 1;
      }
    }

    // Disposable pre-approval set: replace existing proposed rows only; never
    // touch approved/rejected.
    const { error: delErr } = await supabase
      .from('school_calendar_dates')
      .delete()
      .eq('upload_id', input.uploadId)
      .eq('status', 'proposed');
    if (delErr) return { error: delErr.message };

    if (valid.length > 0) {
      const { error: insErr } = await supabase.from('school_calendar_dates').insert(
        valid.map((v) => ({
          upload_id: input.uploadId,
          family_id: upload.family_id,
          date: v.date,
          end_date: v.end_date,
          category: v.category,
          title: v.title,
          notes: v.notes,
          status: 'proposed',
        })),
      );
      if (insErr) return { error: insErr.message };
    }

    revalidatePath(`/school-calendars/${input.uploadId}`);
    return { ok: true, kept: valid.length, dropped };
  } catch {
    return { error: 'Extraction failed. Manual entry still works.' };
  }
}
