'use client';

import { useState, useTransition } from 'react';
import { alertClass, fieldClass, primaryButtonClass } from '@/components/auth/field-styles';
import { createUpload } from './actions';
import { currentSchoolYear } from './school-utils';

export function NewUploadForm() {
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [sourceText, setSourceText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!schoolYear.trim()) {
      setError('School year is required.');
      return;
    }
    startTransition(async () => {
      const res = await createUpload({ schoolYear, sourceText });
      // On success the action redirects to the review screen; only errors return.
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
        <label htmlFor="source-text" className="text-sm font-medium text-foreground">
          Calendar text
        </label>
        <textarea
          id="source-text"
          rows={10}
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          className={fieldClass}
          placeholder="Paste the school calendar here…"
        />
        <p className="text-xs text-muted-foreground">
          Paste the dates from the school calendar. On the next screen you can auto-extract them or add
          rows by hand — nothing reaches the calendar until you approve it.
        </p>
      </div>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Creating…' : 'Create & review'}
      </button>
    </form>
  );
}
