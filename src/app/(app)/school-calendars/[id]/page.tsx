import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { ReviewTable } from '@/components/school/review-table';
import { uploadStatusBadge, type SchoolDateEditRow, type SchoolUploadStatus } from '@/components/school/school-utils';

export default async function SchoolCalendarReviewPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Reviewing/approving school dates is an admin task — gate the page.
  const { data: me } = await supabase
    .from('family_members')
    .select('family_id, role')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!me) redirect('/calendar');
  if (me.role !== 'admin') redirect('/calendar');
  const familyId = me.family_id as string;

  const { data: upload } = await supabase
    .from('school_calendar_uploads')
    .select('id, school_year, status, file_path')
    .eq('id', params.id)
    .eq('family_id', familyId)
    .maybeSingle();

  if (!upload) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">That school calendar could not be found.</p>
        <Link href="/school-calendars" className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
          Back to school calendars
        </Link>
      </div>
    );
  }

  const { data: dates } = await supabase
    .from('school_calendar_dates')
    .select('id, date, end_date, category, title, notes, status')
    .eq('upload_id', params.id)
    .eq('family_id', familyId)
    .order('date');

  const badge = uploadStatusBadge(upload.status as SchoolUploadStatus);

  const filePath = upload.file_path as string | null;
  let pdfUrl: string | null = null;
  if (filePath) {
    const { data: signed } = await supabase.storage.from('school-calendars').createSignedUrl(filePath, 3600);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="space-y-4">
      <Link
        href="/school-calendars"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        School calendars
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">{upload.school_year}</h1>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', badge.className)}>
          {badge.label}
        </span>
      </div>
      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          View uploaded PDF
        </a>
      )}
      <ReviewTable
        uploadId={upload.id as string}
        hasFile={Boolean(filePath)}
        rows={(dates ?? []) as SchoolDateEditRow[]}
      />
    </div>
  );
}
