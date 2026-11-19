import type { Metadata } from 'next';
import { PUBLIC_ORIGIN } from './canonical-share';
import { directoryEntries } from './directory';

export const publicDirectoryPages = ['/', '/about', '/guides', '/guides/verification', '/washington'] as const;
export const browseableProfilePaths = new Set(
  directoryEntries.filter(guide => !guide.testFixture).map(guide => guide.href),
);

const isProduction = process.env.VERCEL_ENV === 'production';
export const publicRobots = { index: isProduction, follow: isProduction };

export function directoryPageMetadata(path: (typeof publicDirectoryPages)[number]): Metadata {
  return {
    alternates: { canonical: PUBLIC_ORIGIN + path },
    robots: publicRobots,
  };
}
