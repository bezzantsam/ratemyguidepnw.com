import { matchesFisherySearch, normalizeGuideSearch } from './directory-query';
import type { DirectoryState } from './directory-url';

export type CharterOffering = {
  operator: string;
  city: string;
  state: 'Oregon' | 'Washington';
  species: string;
  sourceUrl: string;
  boat?: string;
};

export function filterCharterOfferings(offerings: CharterOffering[], filters: DirectoryState) {
  if (filters.area !== 'All areas' || filters.waterway !== 'All advertised waters' || filters.method !== 'All methods') return [];
  const query = normalizeGuideSearch(filters.query);
  return offerings.filter(({operator, city, state, boat, species}) => {
    if ((filters.state !== 'All' && filters.state !== state) ||
        (filters.species !== 'All species' && filters.species !== species)) return false;
    if (!query) return true;
    const fishery = matchesFisherySearch(query, [species]);
    if (fishery !== null) return fishery;
    const terms = normalizeGuideSearch([operator, city, state, boat, species].filter(Boolean).join(' '));
    return query.split(' ').every(term => terms.includes(term));
  });
}
