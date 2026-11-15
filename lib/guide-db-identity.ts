/**
 * Reconcile a displayed imported-directory guide with the Supabase guide row.
 *
 * Slugs alone are not evidence of identity: historical Washington imports
 * assigned source-position IDs that diverged from the current stable-ID map.
 * If name AND business don't match, neither reviews nor account ownership
 * may bind to this directory page. This is conservative presentation logic,
 * NOT a replacement for database RLS or authenticated moderation.
 */
export type GuideIdentityFields = Readonly<{
  name: string;
  business: string | null;
}>;
export type DatabaseGuideIdentity = Readonly<{
  full_name: string | null;
  outfit_name: string | null;
}>;

function normalized(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ');
}

/**
 * A name-only match is insufficient where two captains work for different
 * outfitters, and a matching slug cannot override a conflicting identity.
 */
export function matchesPublicGuideIdentity(
  expected: GuideIdentityFields,
  actual: DatabaseGuideIdentity | null | undefined,
): boolean {
  if (!actual || !normalized(expected.name) || !normalized(actual.full_name)) return false;
  return normalized(expected.name) === normalized(actual.full_name) &&
    normalized(expected.business) === normalized(actual.outfit_name);
}
