import approved from './approved-charter-offerings.json';
import { approvedSource } from './guide-attributes';
import type { CharterOffering } from './charter-offerings';

export function approvedCharterOfferings(input: unknown): CharterOffering[] {
  if (!Array.isArray(input)) return [];
  const offerings = new Map<string, CharterOffering>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || 'guide_id' in item || !approvedSource(item, ['operator_site', 'port_authority'])) continue;
    const { operator, city, state, value, kind, scope, boat, source, relationship, business_id, port_aliases, departure_source, operator_source } = item;
    const portAuthority = source.source_type === 'port_authority';
    if ((kind !== 'species' && kind !== 'trip_type' && kind !== 'method') ||
        (portAuthority && (scope !== 'operator_team' || kind === 'trip_type' ||
          !approvedSource({...item, source:operator_source}, ['operator_site']))) ||
        (state !== 'OR' && state !== 'WA') ||
        typeof operator !== 'string' || !operator.trim() ||
        typeof city !== 'string' || !city.trim() ||
        typeof value !== 'string' || !value.trim()) continue;
    if (scope === 'named_boat_offering_on_request') {
      if (typeof boat !== 'string' || !boat.trim()) continue;
    } else if (scope === 'operator_team') {
      if (boat!==undefined||typeof business_id!=='string'||!/^[-a-z0-9]+$/.test(business_id)||
          !approvedSource({...item,source:departure_source},
            portAuthority ? ['port_authority', 'state_tourism'] : undefined)) continue;
    } else if (scope !== 'charter_operator_only' || boat !== undefined) continue;
    if (port_aliases!==undefined&&(!Array.isArray(port_aliases)||!port_aliases.every(alias=>typeof alias==='string'&&alias.trim()))) continue;
    let details: Pick<CharterOffering, 'species' | 'method' | 'trip' | 'waterway'> = kind==='method'?{method:value}:{species:value};
    if (kind === 'trip_type') {
      if (!relationship || typeof relationship !== 'object' ||
          !('species' in relationship) || typeof relationship.species !== 'string' || !relationship.species.trim() ||
          !('waterway' in relationship) || typeof relationship.waterway !== 'string' || !relationship.waterway.trim()) continue;
      details = {species: relationship.species, trip: value, waterway: relationship.waterway};
    }
    const offering: CharterOffering = {
      operator, city, state: state === 'OR' ? 'Oregon' : 'Washington',
      ...details, sourceUrl: source.url,
      ...(portAuthority ? { sourceLabel: 'Port authority listing' as const } : {}),
      ...(typeof boat === 'string' ? { boat } : {}),
      ...(scope==='operator_team'&&typeof business_id==='string'?{businessId:business_id}:{}),
      ...(Array.isArray(port_aliases)?{portAliases:port_aliases}:{}),
    };
    offerings.set(JSON.stringify([offering.businessId??operator, city, state, kind, value, boat, source.url]), offering);
  }
  return [...offerings.values()];
}

export const charterOfferings = approvedCharterOfferings(approved);
