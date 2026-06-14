'use client';

import { useState } from 'react';

// Renders a signed image URL, or an initials fallback when there's no avatar or
// the signed URL fails to load (e.g. expired). Client component so it can react
// to the image's error event; still renderable from server components.
export function Avatar({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  // Track the URL that failed so a new src (e.g. after re-upload) re-attempts.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const dimension = { width: size, height: size };

  if (src && src !== failedSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL; next/image would need remote config
      <img
        src={src}
        alt={name}
        style={dimension}
        onError={() => setFailedSrc(src)}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={dimension}
      className="flex shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
    >
      {initial}
    </div>
  );
}
