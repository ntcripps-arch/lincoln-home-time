import { BottomNav } from './bottom-nav';

// Authenticated app chrome: a slim brand top bar, a scrollable content area, and
// the bottom tab bar. Phone-first; on desktop the whole thing centers into a
// max-width column. Fixed chrome is padded clear of the notch / home indicator
// via the safe-area utilities (see globals.css).
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 pt-safe backdrop-blur">
        <div className="flex h-14 items-center px-4">
          <span className="text-base font-semibold tracking-tight text-foreground">
            Lincoln Home Time
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 pb-nav pt-4">{children}</main>

      <BottomNav />
    </div>
  );
}
