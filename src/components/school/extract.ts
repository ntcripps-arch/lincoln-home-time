'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { SchoolCategory } from '@/lib/types';
import { SCHOOL_CATEGORY_VALUES } from './school-utils';

// Vision extraction reads the calendar PDF directly (month grids + color legend),
// which plain-text parsing can't do. Opus 4.8 has the strongest vision/OCR; this
// is a rare admin action so cost is negligible. NOTE: sampling params (temperature)
// are removed on Opus 4.8 — do not send them.
const EXTRACT_MODEL = 'claude-opus-4-8';
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
  const [y1, y2] = schoolYear.split('-');
  return [
    'You read a school-year calendar PDF and extract its non-instructional days and notable events.',
    'The PDF is month grids; holidays, breaks, no-school days, and early releases are marked with',
    'colors, shading, or symbols explained in a LEGEND / KEY. Use the legend to classify each marked',
    'day. Be exhaustive but precise.',
    '',
    'Rules:',
    `- The school year is ${schoolYear}. Dates usually omit the year — infer it: months Aug–Dec belong`,
    `  to ${y1}, months Jan–Jul to ${y2}. (So a winter break "Dec 21 – Jan 1" is ${y1}-12-21 → ${y2}-01-01.)`,
    '- Merge a consecutive multi-day break into ONE entry: set "date" to the first day and "end_date"',
    '  to the last day. Single days use end_date = null.',
    '- Do NOT emit ordinary weekends (Sat/Sun) as no_school — only days the legend actually marks.',
    '- Ignore decorative or empty cells. Do not invent dates.',
    '',
    'Classify "category" using the legend, mapping to exactly one of the allowed values:',
    '- no school / non-student day / student holiday → no_school',
    '- teacher in-service / professional development / work day → teacher_work_day',
    '- winter / spring / mid-winter / fall break (a multi-day range) → break',
    '- named holidays (Thanksgiving, Labor Day, MLK, Presidents Day, Memorial Day, etc.) → holiday',
    '- early release / half day / early dismissal → early_release',
    '- first day of school → first_day; last day of school → last_day',
    '- anything else worth showing (e.g. conferences, grading days) → event',
    '',
    'Put a short human label in "title" (e.g. "Winter Break", "Thanksgiving", "Teacher Work Day").',
    'Use "notes" only for a useful extra detail (else null). Return data via the required schema only.',
  ].join('\n');
}

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dates'],
  properties: {
    dates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'end_date', 'category', 'title', 'notes'],
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: ['string', 'null'], description: 'YYYY-MM-DD for multi-day ranges, else null' },
          category: { type: 'string', enum: SCHOOL_CATEGORY_VALUES },
          title: { type: 'string' },
          notes: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;

export async function extractDates(input: { uploadId: string }): Promise<ExtractResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'You are signed out.' };

    const { data: upload } = await supabase
      .from('school_calendar_uploads')
      .select('file_path, school_year, family_id')
      .eq('id', input.uploadId)
      .maybeSingle();
    if (!upload) return { error: 'Upload not found.' };
    if (!upload.file_path) return { error: 'This upload has no PDF to extract from.' };

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

    // Pull the PDF from private storage and base64-encode it for the document block.
    const { data: blob, error: dlErr } = await supabase.storage
      .from('school-calendars')
      .download(upload.file_path as string);
    if (dlErr || !blob) return { error: 'Could not read the uploaded PDF. Try re-uploading.' };
    const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        max_tokens: 8000,
        system: systemPrompt(upload.school_year as string),
        output_config: { format: { type: 'json_schema', schema: RESULT_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: 'Extract every marked day and notable event from this school-calendar PDF.' },
            ],
          },
        ],
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
      parsed = JSON.parse(text);
    } catch {
      return { error: 'Could not parse the extraction result. Try again or add dates manually.' };
    }
    const rows = (parsed as { dates?: unknown })?.dates;
    if (!Array.isArray(rows)) return { error: 'Extraction did not return any dates. Try again.' };

    const valid: {
      date: string;
      end_date: string | null;
      category: SchoolCategory;
      title: string;
      notes: string | null;
    }[] = [];
    let dropped = 0;

    for (const r of rows as RawRow[]) {
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
