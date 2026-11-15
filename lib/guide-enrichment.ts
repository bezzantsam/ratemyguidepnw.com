import data from './guide-enrichment.json';

export type GuideEvidenceType = 'operator_site' | 'third_party_directory';
export type AdvertisedWaterway = {
  name: string;
  sourceUrl: string;
  sourceType: GuideEvidenceType;
  observedOn?: string;
};
export type GuideSourceLink = {
  label: string;
  url: string;
  sourceType: GuideEvidenceType;
  observedOn: string;
};
export type GuideEnrichment = {
  sourceLinks?: GuideSourceLink[];
  searchAliases: string[];
  advertisedWaters: AdvertisedWaterway[];
};

/**
 * Editorially reviewed public-source **claims**, NOT current license/USCG checks,
 * verified boat operations, registration amendments or a legal identity merge.
 * Unknown entries are not automatically enriched from broad registry zones.
 */
const source = data as Record<string, GuideEnrichment>;

export function guideEnrichmentFor(registration: string): GuideEnrichment | null {
  return Object.prototype.hasOwnProperty.call(source, registration)
    ? source[registration]
    : null;
}

export function advertisedWaterwayNames(registration: string): string[] {
  return guideEnrichmentFor(registration)?.advertisedWaters.map(w => w.name) ?? [];
}

export function guideSearchTerms(registration: string): string[] {
  return guideEnrichmentFor(registration)?.searchAliases ?? [];
}
