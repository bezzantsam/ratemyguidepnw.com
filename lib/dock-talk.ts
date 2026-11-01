import 'server-only';
import { createClient } from '@supabase/supabase-js';

export type DockReview = {
  id: string;
  guideSlug: string;
  guideName: string;
  waterway: string;
  score: number;
  body: string;
  publishedAt: string;
};

type ReviewRow = {
  id: string; quality: number; body: string; published_at: string;
  guides: { slug: string; full_name: string } | null;
  waterways: { name: string } | null;
};

export async function getPublishedDockReviews(limit = 20): Promise<DockReview[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }
  });
  const { data, error } = await client
    .from('reviews')
    .select('id, quality, body, published_at, guides!inner(slug,full_name), waterways(name)')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) {
    console.error('Dock Talk review query failed:', error.message);
    return [];
  }
  return ((data || []) as unknown as ReviewRow[])
    .filter(row => row.guides !== null)
    .map(row => ({
      id: row.id, guideSlug: row.guides!.slug, guideName: row.guides!.full_name,
      waterway: row.waterways?.name ?? 'Pacific Northwest',
      score: row.quality, body: row.body, publishedAt: row.published_at
    }));
}
