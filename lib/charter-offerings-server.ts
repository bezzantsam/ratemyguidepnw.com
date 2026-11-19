import approved from './approved-charter-offerings.json';
import { approvedSource } from './guide-attributes';
import type { CharterOffering } from './charter-offerings';

export function approvedCharterOfferings(input: unknown): CharterOffering[] {
  if (!Array.isArray(input)) return [];
  const offerings = new Map<string, CharterOffering>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || 'guide_id' in item || !approvedSource(item)) continue;
    const { operator, city, state, value, kind, scope, boat, source, relationship } = item;
    if ((kind !== 'species' && kind !== 'trip_type') || source.source_type !== 'operator_site' ||
        (state !== 'OR' && state !== 'WA') ||
        typeof operator !== 'string' || !operator.trim() ||
        typeof city !== 'string' || !city.trim() ||
        typeof value !== 'string' || !value.trim()) continue;
    if (scope === 'named_boat_offering_on_request') {
      if (typeof boat !== 'string' || !boat.trim()) continue;
    } else if (scope !== 'charter_operator_only' || boat !== undefined) continue;
    let details: Pick<CharterOffering, 'species' | 'trip' | 'waterway'> = {species: value};
    if (kind === 'trip_type') {
      if (!relationship || typeof relationship !== 'object' ||
          !('species' in relationship) || typeof relationship.species !== 'string' || !relationship.species.trim() ||
          !('waterway' in relationship) || typeof relationship.waterway !== 'string' || !relationship.waterway.trim()) continue;
      details = {species: relationship.species, trip: value, waterway: relationship.waterway};
    }
    const offering: CharterOffering = {
      operator, city, state: state === 'OR' ? 'Oregon' : 'Washington',
      ...details, sourceUrl: source.url,
      ...(typeof boat === 'string' ? { boat } : {}),
    };
    offerings.set(JSON.stringify([operator, city, state, value, boat, source.url]), offering);
  }
  return [...offerings.values()];
}

export const charterOfferings = approvedCharterOfferings(approved);
