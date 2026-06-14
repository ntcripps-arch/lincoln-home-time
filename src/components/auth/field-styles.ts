// Shared Tailwind class strings for the auth screens. Inputs use text-base (16px)
// so iOS Safari doesn't zoom on focus; primary buttons are full-width and ≥48px.
export const fieldClass =
  'w-full rounded-lg border border-input bg-card px-3.5 py-3 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50';

export const primaryButtonClass =
  'flex min-h-[3rem] w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60';

export const linkButtonClass =
  'text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60';

export const alertClass =
  'rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700';

export const infoClass =
  'rounded-lg border border-border bg-accent px-3.5 py-3 text-sm text-accent-foreground';
