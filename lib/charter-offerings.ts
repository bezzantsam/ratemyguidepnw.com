import { fisheryAtPort, matchesFisherySearch, normalizeGuideSearch } from './directory-query';
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

export function filterCharterOfferings(offerings: CharterOffering[], filters: DirectoryState, guidePorts: string[] = []) {
  if (filters.area !== 'All areas' || filters.method !== 'All methods') return [];
  const query = normalizeGuideSearch(filters.query);
  const portSearch = query ? fisheryAtPort(query, [...guidePorts, ...offerings.map(offer=>offer.city)]) : null;
  return offerings.filter(({operator, city, state, boat, species, trip, waterway}) => {
    if ((filters.state !== 'All' && filters.state !== state) ||
        (filters.waterway !== 'All advertised waters' && filters.waterway !== waterway) ||
        (filters.species !== 'All species' && filters.species !== species)) return false;
    if (!query) return true;
    const labels=trip ? [species, trip] : [species];
    if (portSearch) return city.split(' or ').some(port=>normalizeGuideSearch(port)===portSearch.city)&&
      matchesFisherySearch(portSearch.term,labels)===true;
    const fishery = matchesFisherySearch(query, labels);
    if (fishery !== null) return fishery;
    const terms = normalizeGuideSearch([operator, city, state, boat, species, trip].filter(Boolean).join(' '));
    return query.split(' ').every(term => terms.includes(term));
  });
}
