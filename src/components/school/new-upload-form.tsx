'use client';

import { useRef, useState, useTransition } from 'react';
import { alertClass, fieldClass, primaryButtonClass } from '@/components/auth/field-styles';
import { createUpload } from './actions';
import { currentSchoolYear } from './school-utils';

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export function NewUploadForm() {
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!schoolYear.trim()) {
      setError('School year is required.');
      return;
    }
    if (!file) {
      setError('Choose a PDF to upload.');
      return;
    }
    if (file.type !== 'application/pdf') {
      setError('The calendar must be a PDF.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError('That PDF is too large (max 25 MB).');
      return;
    }
    const data = new FormData();
    data.set('schoolYear', schoolYear);
    data.set('file', file);
    startTransition(async () => {
      // On success the action redirects to the review screen; only errors return.
      const res = await createUpload(data);
      if (res && 'error' in res) setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <p className={alertClass}>{error}</p>}
      <div className="space-y-1.5">
        <label htmlFor="school-year" className="text-sm font-medium text-foreground">
          School year
        </label>
        <input
          id="school-year"
          value={schoolYear}
          onChange={(e) => setSchoolYear(e.target.value)}
          className={fieldClass}
          placeholder="2025-2026"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="calendar-pdf" className="text-sm font-medium text-foreground">
          Calendar PDF
        </label>
        <input
          ref={fileRef}
          id="calendar-pdf"
          type="file"
          accept="application/pdf"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:min-h-[2.5rem] file:rounded-lg file:border-0 file:bg-primary file:px-4 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
        />
        {fileName && <p className="text-xs text-muted-foreground">Selected: {fileName}</p>}
        <p className="text-xs text-muted-foreground">
          Upload the school’s calendar PDF. On the next screen you can auto-extract the dates (the
          reader understands the month grid and color legend) or add rows by hand — nothing reaches the
          calendar until you approve it.
        </p>
      </div>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Uploading…' : 'Upload & review'}
      </button>
    </form>
  );
}
