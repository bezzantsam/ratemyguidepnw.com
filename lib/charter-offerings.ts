import { directorySpeciesLabels, fisheryAtPort, matchesFisherySearch, normalizeGuideSearch } from './directory-query';
import type { DirectoryState } from './directory-url';

export type CharterOffering = {
  operator: string;
  city: string;
  state: 'Oregon' | 'Washington';
  species?: string;
  method?: string;
  trip?: string;
  waterway?: string;
  sourceUrl: string;
  sourceLabel?: 'Port authority listing';
  boat?: string;
  businessId?: string;
  portAliases?: string[];
};

export function charterPorts(offer: CharterOffering): string[] {
  return [...offer.city.split(' or '), ...(offer.portAliases??[])];
}

export function filterCharterOfferings(offerings: CharterOffering[], filters: DirectoryState, guidePorts: string[] = []) {
  if (filters.area !== 'All areas') return [];
  const query = normalizeGuideSearch(filters.query);
  const portSearch = query ? fisheryAtPort(query, [...guidePorts, ...offerings.flatMap(charterPorts)], filters.method, filters.species) : null;
  return offerings.filter(offer => {
    const {operator, city, state, boat, species, method, trip, waterway}=offer;
    if ((filters.state !== 'All' && filters.state !== state) ||
        (filters.waterway !== 'All advertised waters' && filters.waterway !== waterway) ||
        (filters.species !== 'All species' && !directorySpeciesLabels(species?[species]:[]).includes(filters.species)) ||
        (filters.method !== 'All methods' && filters.method !== method)) return false;
    if (!query) return true;
    const labels=[species, method, trip].filter((label):label is string=>Boolean(label));
    if (portSearch) return charterPorts(offer).some(port=>normalizeGuideSearch(port)===portSearch.city)&&
      matchesFisherySearch(portSearch.term,labels)===true;
    const fishery = matchesFisherySearch(query, labels);
    if (fishery !== null) return fishery;
    const terms = normalizeGuideSearch([operator, city, state, boat, ...labels].filter(Boolean).join(' '));
    return query.split(' ').every(term => terms.includes(term));
  });
}
