import type { MetadataRoute } from 'next';
import { canonicalProfileUrl, PUBLIC_ORIGIN } from '@/lib/canonical-share';
import { browseableProfilePaths, publicDirectoryPages } from '@/lib/discoverability';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...publicDirectoryPages.map(path => ({ url: PUBLIC_ORIGIN + path })),
    ...Array.from(browseableProfilePaths, path => ({ url: canonicalProfileUrl(path) })),
  ];
}
