'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { alertClass, fieldClass, primaryButtonClass } from '@/components/auth/field-styles';
import { updateAvatar, updateProfile } from './actions';
import { Avatar } from './avatar';

// Downscale to ~512px before upload (honors EXIF orientation). Keeps avatars
// small; standard web image types only.
async function downscale(file: File, max = 512): Promise<Blob> {
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
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process image.'))), type, 0.9),
  );
}

export function ProfileForm({
  userId,
  displayName: initialName,
  phone: initialPhone,
  avatarUrl,
}: {
  userId: string;
  displayName: string;
  phone: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [displayName, setDisplayName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Free the object URL when it's replaced or the component unmounts.
  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateProfile({ displayName, phone });
      if ('error' in res) setError(res.error);
      else setSaved(true);
    });
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const blob = await downscale(file);
      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: blob.type });
      if (upErr) throw upErr;
      setLocalPreview(URL.createObjectURL(blob));
      const res = await updateAvatar({ path });
      if ('error' in res) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">My profile</h2>
      {error && <p className={alertClass}>{error}</p>}

      <div className="flex items-center gap-4">
        <Avatar src={localPreview ?? avatarUrl} name={displayName} size={64} />
        <div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex min-h-[2.75rem] items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Change photo'}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, or WebP.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPickAvatar}
          />
        </div>
      </div>

      <form onSubmit={onSave} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="display-name" className="text-sm font-medium text-foreground">
            Display name
          </label>
          <input
            id="display-name"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSaved(false);
            }}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-foreground">
            Phone <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setSaved(false);
            }}
            className={fieldClass}
            placeholder="(555) 555-5555"
          />
        </div>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save profile'}
        </button>
      </form>
    </section>
  );
}
