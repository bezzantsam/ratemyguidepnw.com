import raw from './washington-raw.json';
import stableIds from './washington-stable-ids.json';
import {reconciledWashingtonCaptains} from './washington-reconciled';

export type WashingtonGuide={id:string;name:string;business:string|null;source:string;notes:string|null};
type SourceGuide=Omit<WashingtonGuide,'id'>;

// Explicit curated OR/WA links. An imported Washington source row is not proof
// of an active license, nor is a shared business a verified person match.
const crossStateNames=new Set([
 'tony fisher','shane magnuson','casey weigel','marc bush',
 'nicholas ney','daniel benowitz','jeffrey keightley sr.'
]);

function normalize(value:string):string {
 return value.trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
}

/** A source-record reconciliation key, not proof of a captain's identity. */
export function washingtonSourceKey(row:SourceGuide):string {
 return JSON.stringify([normalize(row.name),normalize(row.business||''),normalize(row.source)]);
}

/**
 * Existing public URLs must survive reorder/filter/import operations.
 * New records require a deliberately assigned, reviewable ID in the map:
 * never shift every existing URL by deriving from array position.
 */
export function mapWashingtonGuides(source:SourceGuide[]):WashingtonGuide[] {
 const allocated=stableIds as Record<string,string>;
 const seenIDs=new Set<string>();
 const seenSourceKeys=new Set<string>();
 const results:WashingtonGuide[]=[];
 for (const row of source) {
  if (crossStateNames.has(normalize(row.name)))continue;
  const key=washingtonSourceKey(row);
  if(seenSourceKeys.has(key))throw new Error('Duplicate Washington source identity key: '+key);
  seenSourceKeys.add(key);
  const id=allocated[key];
  if(!id||!/^wa-\d{3,}$/.test(id))
   throw new Error('Washington source record needs a reviewed stable ID assignment: '+key);
  if(seenIDs.has(id))throw new Error('Washington public guide ID assigned twice: '+id);
  seenIDs.add(id);
  results.push({...row,id});
 }
 return results;
}

export const washingtonGuides:WashingtonGuide[]=mapWashingtonGuides(raw);
export const oregonWashingtonMatches=reconciledWashingtonCaptains.filter(x=>!!x.oregonRegistration);
export function washingtonGuide(id:string){return washingtonGuides.find(g=>g.id===id)}
