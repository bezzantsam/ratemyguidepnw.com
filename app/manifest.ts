import type { MetadataRoute } from 'next';

/** Standalone mobile shell. Reviews and account content are always network-only. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'RateMyGuidePNW',
    short_name: 'RateMyGuide',
    description: 'Independent Pacific Northwest fishing-guide discovery and moderated angler experiences.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b2427',
    theme_color: '#0b2427',
    orientation: 'any',
    icons: [
      { src: '/icon-192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
