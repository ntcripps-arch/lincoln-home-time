# DESIGN.md — visual system

Calm, friendly, mobile-first. Not a legal/court app. Household green/blue are the
focal colors on the calendar; the rest of the UI is quiet neutral so they pop.

## Font — Plus Jakarta Sans (via next/font)

`src/app/layout.tsx`:
```tsx
import { Plus_Jakarta_Sans } from 'next/font/google';
const sans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
// <html lang="en" className={sans.variable}>  ...  <body className="font-sans ...">
```
`tailwind.config.ts` → `theme.extend.fontFamily.sans = ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif']`

## Color tokens — replace the `:root` block in `src/app/globals.css`

```css
:root {
  --background: 40 33% 99%;      /* warm paper */
  --foreground: 222 24% 20%;     /* slate ink */
  --card: 0 0% 100%;
  --card-foreground: 222 24% 20%;
  --muted: 220 20% 96%;
  --muted-foreground: 220 12% 46%;
  --border: 220 18% 90%;
  --input: 220 18% 90%;
  --primary: 193 60% 34%;        /* deep teal — buttons/links (hue-clear of the blue household) */
  --primary-foreground: 0 0% 100%;
  --accent: 195 40% 95%;
  --accent-foreground: 222 24% 20%;
  --ring: 193 60% 42%;
  --radius: 0.875rem;            /* soft, friendly */

  /* household colors (legend/defaults; the real values come from households.color in the DB) */
  --household-dad: 142 33% 46%;  /* Clearman green  #4f9d6a */
  --household-mom: 217 58% 55%;  /* Barrett blue    #4a7fd0 */
}
```

## Calendar styling rules (the centerpiece)

- **Day tint:** fill each day with the assigned household's `color` from the DB at
  ~15% over white, e.g. `background: color-mix(in srgb, var(--hh) 15%, white)`
  where `--hh` is set inline from `households.color`. Don't hard-code green/blue —
  read the household color so it generalizes.
- **Today:** a 2px primary ring around the cell, not a fill.
- **Exceptions / swaps** (`source === 'exception'`): dashed 1.5px outline in the
  assigned household color + a small dot — clearly different from baseline days.
- **Pickup/dropoff:** small muted time label in the cell corner when present.
- **Layers** (school dates, manual events, trips): tiny chips/dots along the
  bottom of the cell; never recolor the day (the day color always = parenting time).
- **Legend:** a compact household legend (green = Dad/Clearman, blue = Mom/Barrett)
  above the grid.

## Components & feel

- Rounded cards (`--radius`), soft shadows (`shadow-sm`), generous padding,
  comfortable line-height. Large tap targets (min 44px) — phone is the primary device.
- Buttons: solid primary for the main action, ghost/outline for secondary.
- Avatars: small rounded with initials fallback; show the requester's avatar on
  request cards and the traveling parent on trips.
- Keep chrome minimal: a simple top bar + bottom tab bar on mobile
  (Calendar · Requests · Trips · Settings), mirroring the app it's replacing.
- Use lucide-react icons sparingly for clarity, not decoration.

## Accessibility

Green-vs-blue is distinguishable for the most common color-vision deficiency, but
never rely on color alone: always pair the day color with a text/initial label for
the household, and use the dashed outline (not just hue) to mark exceptions.

## Mobile-first

The app is phone-primary and installs to the home screen. The shell below is the
foundation every signed-in page renders inside — build pages to fit it, not around it.

### Foundation (already wired)

- **Viewport** (`src/app/layout.tsx`, Next `viewport` export): `width=device-width`,
  `initialScale: 1`, `viewportFit: 'cover'` (draw into the notch/home-indicator
  zones — we pad chrome back out with safe-area utils), `themeColor: '#fdfdfc'`
  (paper). **Pinch-zoom is never disabled** (no `maximumScale`/`userScalable`).
- **Installable PWA**: `appleWebApp` meta (`apple-mobile-web-app-capable` +
  `status-bar-style: default` + title) and a web manifest (`src/app/manifest.ts` →
  `/manifest.webmanifest`, auto-linked): name "Lincoln Home Time", `standalone`
  display, paper theme/background. (Maskable icon PNGs still to be added.)
- **Safe areas**: insets are exposed as CSS vars at `:root` (`--sat/--sar/--sab/--sal`,
  defaulting to `env(safe-area-inset-*)`) and consumed by utilities in `globals.css`:
  `.pt-safe .pr-safe .pb-safe .pl-safe`, plus `.pb-nav` (content padding =
  inset + nav height). Modeling them as vars lets us override for previews/tests.
  Apply these to any fixed top bar / bottom nav.
- **App shell** (`src/app/(app)/layout.tsx` → `components/app-shell/`): a slim sticky
  brand top bar (`.pt-safe`), a scrollable `<main>` (`.pb-nav` so content clears the
  nav), and a fixed, thumb-reachable **bottom tab bar** —
  **Calendar · Requests · Trips · Settings** (Requests → `/requests`). The bar is
  full-bleed so its background fills the home-indicator zone, with the tab row
  centered + `max-w-screen-sm` and padded clear via `.pb-safe`. `/login` and
  `/auth/*` live OUTSIDE the `(app)` group, so they render without the shell. On
  desktop the shell widens into a centered `max-w-screen-sm` column.

### Standing rules for every page (Step 2 on)

- **No horizontal scroll.** Constrain widths; never let a row exceed the viewport.
- **Tap targets ≥ 44px.** Nav/buttons/list rows must be comfortably thumb-sized.
- **Form inputs use ≥ 16px font** — smaller text makes iOS Safari zoom on focus.
- **Primary actions are large, full-width buttons** (solid primary); secondary
  actions are ghost/outline.
- **Touch, not hover.** No hover-only affordances — anything reachable by hover
  must be reachable by tap. Hover may *enhance* on desktop but never gate function.
- **Day detail is a bottom sheet**, not a centered modal (thumb-reachable, dismiss
  by swipe-down/tap-out).
- **Month navigation is swipeable** left/right, with prev/next buttons as a
  fallback (and the only path on desktop).
