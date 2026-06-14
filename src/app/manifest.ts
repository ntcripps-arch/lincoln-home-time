import type { MetadataRoute } from 'next';

// Web app manifest — served at /manifest.webmanifest and auto-linked by Next.
// Makes the app installable to the home screen as a standalone phone app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lincoln Home Time',
    short_name: 'Home Time',
    description: 'A private shared parenting calendar.',
    start_url: '/calendar',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fdfdfc', // paper
    theme_color: '#fdfdfc',
    // Icons (maskable PNGs) to be added with the brand assets.
  };
}
