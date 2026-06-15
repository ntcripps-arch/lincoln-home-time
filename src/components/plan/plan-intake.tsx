'use client';

import { useRef, useState, useTransition } from 'react';
import { FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { alertClass, primaryButtonClass } from '@/components/auth/field-styles';
import { createPlanDraft } from './actions';

// Downscale to keep each image legible but small enough to send to the vision
// API in one request (~2000px long edge, JPEG). Mirrors the avatar downscale.
async function downscale(file: File, max = 2000): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process image.'))), 'image/jpeg', 0.85),
  );
}

export function PlanIntake({ familyId }: { familyId: string }) {
  const [supabase] = useState(() => createClient());
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (files.length === 0) {
      setError('Choose the parenting-plan photos to import.');
      return;
    }
    startTransition(async () => {
      try {
        // Unique folder per import; downscale + upload each image.
        const group = crypto.randomUUID();
        const paths: string[] = [];
        for (let i = 0; i < files.length; i++) {
          setProgress(`Uploading ${i + 1} of ${files.length}…`);
          const blob = await downscale(files[i]);
          const path = `${familyId}/${group}/${String(i).padStart(2, '0')}.jpg`;
          const { error: upErr } = await supabase.storage
            .from('plan-documents')
            .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
          if (upErr) throw upErr;
          paths.push(path);
        }
        setProgress('Reading the plan with AI… this can take a minute.');
        const res = await createPlanDraft({ imagePaths: paths });
        // Success redirects; only an error object returns.
        if (res && 'error' in res) {
          setError(res.error);
          setProgress(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Import failed.');
        setProgress(null);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
        <h2 className="text-base font-semibold text-foreground">Import a parenting plan</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload clear photos of the plan’s schedule pages (residential schedule + holiday table). The
        reader extracts the rotation and holidays into a draft you review before it goes live.
      </p>
      {error && <p className={alertClass}>{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:min-h-[2.5rem] file:rounded-lg file:border-0 file:bg-primary file:px-4 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
      />
      {files.length > 0 && <p className="text-xs text-muted-foreground">{files.length} image(s) selected.</p>}
      {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Working…' : 'Import & review'}
      </button>
    </form>
  );
}
