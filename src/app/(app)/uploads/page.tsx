import Link from 'next/link';
import { NewUploadForm } from '@/components/school/new-upload-form';

export default function UploadsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">New school calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a school-calendar PDF to review and approve its dates.
        </p>
      </div>
      <NewUploadForm />
      <Link
        href="/school-calendars"
        className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        View all school calendars
      </Link>
    </div>
  );
}
