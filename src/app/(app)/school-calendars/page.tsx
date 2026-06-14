import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { primaryButtonClass } from '@/components/auth/field-styles';
import { uploadStatusBadge, type SchoolUploadRow } from '@/components/school/school-utils';

export default async function SchoolCalendarsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!me) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">You are not part of a family yet.</p>
      </div>
    );
  }
  const familyId = me.family_id as string;

  const [uploadsRes, datesRes] = await Promise.all([
    supabase
      .from('school_calendar_uploads')
      .select('id, school_year, status, uploaded_at, approved_at')
      .eq('family_id', familyId)
      .order('uploaded_at', { ascending: false }),
    supabase.from('school_calendar_dates').select('upload_id, status').eq('family_id', familyId),
  ]);

  const uploads = (uploadsRes.data ?? []) as SchoolUploadRow[];
  const dates = (datesRes.data ?? []) as { upload_id: string; status: string }[];
  const counts = new Map<string, { total: number; approved: number; proposed: number }>();
  for (const d of dates) {
    const c = counts.get(d.upload_id) ?? { total: 0, approved: 0, proposed: 0 };
    c.total += 1;
    if (d.status === 'approved') c.approved += 1;
    if (d.status === 'proposed') c.proposed += 1;
    counts.set(d.upload_id, c);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">School calendars</h1>
      <Link href="/uploads" className={primaryButtonClass}>
        <Plus className="h-5 w-5" />
        New upload
      </Link>

      {uploads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          No school calendars yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {uploads.map((u) => {
            const c = counts.get(u.id) ?? { total: 0, approved: 0, proposed: 0 };
            const badge = uploadStatusBadge(u.status);
            return (
              <li key={u.id}>
                <Link
                  href={`/school-calendars/${u.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{u.school_year}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.total} date{c.total === 1 ? '' : 's'} · {c.approved} approved
                      {c.proposed ? ` · ${c.proposed} proposed` : ''}
                    </p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', badge.className)}>
                    {badge.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
