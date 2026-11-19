import { matchesFisherySearch, normalizeGuideSearch } from './directory-query';
import type { DirectoryState } from './directory-url';

export type CharterOffering = {
  operator: string;
  city: string;
  state: 'Oregon' | 'Washington';
  species: string;
  trip?: string;
  waterway?: string;
  sourceUrl: string;
  boat?: string;
};

export function filterCharterOfferings(offerings: CharterOffering[], filters: DirectoryState) {
  if (filters.area !== 'All areas' || filters.method !== 'All methods') return [];
  const query = normalizeGuideSearch(filters.query);
  return offerings.filter(({operator, city, state, boat, species, trip, waterway}) => {
    if ((filters.state !== 'All' && filters.state !== state) ||
        (filters.waterway !== 'All advertised waters' && filters.waterway !== waterway) ||
        (filters.species !== 'All species' && filters.species !== species)) return false;
    if (!query) return true;
    const fishery = matchesFisherySearch(query, trip ? [species, trip] : [species]);
    if (fishery !== null) return fishery;
    const terms = normalizeGuideSearch([operator, city, state, boat, species, trip].filter(Boolean).join(' '));
    return query.split(' ').every(term => terms.includes(term));
  });
}
