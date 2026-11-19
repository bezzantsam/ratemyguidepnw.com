import type { MetadataRoute } from 'next';
import { PUBLIC_ORIGIN } from '@/lib/canonical-share';

export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV !== 'production') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/claim/', '/intel/', '/preview', '/write-review'],
    },
    sitemap: `${PUBLIC_ORIGIN}/sitemap.xml`,
  };
}
