import type { MetadataRoute } from 'next';
import { canonicalProfileUrl, PUBLIC_ORIGIN } from '@/lib/canonical-share';
import { directoryEntries } from '@/lib/directory';

const publicPages = ['/', '/about', '/guides', '/guides/verification', '/washington'];

export default function sitemap(): MetadataRoute.Sitemap {
  const urls = new Set(publicPages.map(path => PUBLIC_ORIGIN + path));

  for (const guide of directoryEntries) {
    if (!guide.testFixture) urls.add(canonicalProfileUrl(guide.href));
  }

  return Array.from(urls, url => ({ url }));
}
