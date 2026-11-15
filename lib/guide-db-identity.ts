/** Match an imported public directory identity to a live guide row. */
export type GuideIdentityFields = Readonly<{ name: string; business: string | null }>;
export type DatabaseGuideIdentity = Readonly<{ full_name: string | null; outfit_name: string | null }>;

function normalized(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

/** Require both person and outfitter to match; slug equality alone is insufficient. */
export function matchesPublicGuideIdentity(
  expected: GuideIdentityFields,
  actual: DatabaseGuideIdentity | null | undefined,
): boolean {
  if (!actual || !normalized(expected.name) || !normalized(actual.full_name)) return false;
  return normalized(expected.name) === normalized(actual.full_name) &&
    normalized(expected.business) === normalized(actual.outfit_name);
}
