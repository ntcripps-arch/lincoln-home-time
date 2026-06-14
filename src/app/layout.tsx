import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

// Plus Jakarta Sans — calm, friendly, not "court app". Exposed as --font-sans
// so Tailwind's `font-sans` (see tailwind.config.ts) resolves to it everywhere.
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Lincoln Home Time',
  description: 'A private shared parenting calendar.',
  // Installs to the home screen as a standalone app (manifest served by
  // src/app/manifest.ts; Next auto-links it). iOS PWA meta:
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Lincoln Home Time' },
};

// Mobile-first viewport. `viewportFit: 'cover'` lets the app draw into the
// notch / home-indicator zones — we pad fixed chrome back out with the
// safe-area utilities. Pinch-zoom is intentionally NOT disabled (accessibility).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fdfdfc', // warm paper, matches --background
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
