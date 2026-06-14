// Presentational only (no hooks) — usable from both server and client components.
// Renders a signed image URL, or an initials fallback when there's no avatar.
export function Avatar({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const dimension = { width: size, height: size };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL; next/image would need remote config
      <img
        src={src}
        alt={name}
        style={dimension}
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
