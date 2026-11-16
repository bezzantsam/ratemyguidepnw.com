import raw from './washington-raw.json';
import stableIds from './washington-stable-ids.json';
import {approvedIdentityLinks,identityLinkDecisions,reconciledWashingtonCaptains,unresolvedWashingtonSourceHolds,type IdentityLinkDecision,type WashingtonCaptain} from './washington-reconciled';

export type WashingtonGuide={id:string;name:string;business:string|null;source:string;notes:string|null};
type SourceGuide=Omit<WashingtonGuide,'id'>;

function normalize(value:string):string {
 return value.trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
}
/** A source-record key, not proof of a captain's identity. */
export function washingtonSourceKey(row:SourceGuide):string {
 return JSON.stringify([normalize(row.name),normalize(row.business||''),normalize(row.source)]);
}

/** Resolve only decisions whose exact source and Oregon research pointer exist. */
export function resolveWashingtonLinks(source:SourceGuide[],decisions:readonly unknown[],research:WashingtonCaptain[]) {
 const keys=source.map(washingtonSourceKey);
 return approvedIdentityLinks(decisions).flatMap(link=>{
  const matches=research.filter(x=>x.oregonRegistration===link.oregonRegistration);
  const row=source.find(x=>washingtonSourceKey(x)===link.washingtonSourceKey);
  if(keys.filter(key=>key===link.washingtonSourceKey).length!==1||!row||matches.length!==1)return [];
  return [{...link,name:matches[0].name,source:row}];
 });
}

/** IDs identify source records, not people. Holds are exact keys, never names. */
export function mapWashingtonGuides(source:SourceGuide[],links:readonly IdentityLinkDecision[]=[]):WashingtonGuide[] {
 const allocated=stableIds as Record<string,string>;
 const holds=new Set<string>((unresolvedWashingtonSourceHolds??[]).map(x=>x.key));
 const linked=new Set(approvedIdentityLinks(links).map(x=>x.washingtonSourceKey));
 const seenIDs=new Set<string>(),seenSourceKeys=new Set<string>();
 const results:WashingtonGuide[]=[];
 for(const row of source){
  const key=washingtonSourceKey(row);
  if(seenSourceKeys.has(key))throw new Error('Duplicate Washington source identity key: '+key);
  seenSourceKeys.add(key);
  const id=allocated[key];
  if(!id){if(holds.has(key))continue;throw new Error('Washington source record needs a reviewed stable ID assignment: '+key)}
  if(!/^wa-\d{3,}$/.test(id))throw new Error('Washington source record needs a reviewed stable ID assignment: '+key);
  if(seenIDs.has(id))throw new Error('Washington public guide ID assigned twice: '+id);
  seenIDs.add(id);
  if(!linked.has(key))results.push({...row,id});
 }
 return results;
}

export const oregonWashingtonMatches=resolveWashingtonLinks(raw,identityLinkDecisions??[],reconciledWashingtonCaptains);
// All allocated source URLs continue to resolve even if a reviewed link later
// removes one source row from search results.
export const washingtonAllGuides:WashingtonGuide[]=mapWashingtonGuides(raw);
export const washingtonGuides:WashingtonGuide[]=mapWashingtonGuides(raw,oregonWashingtonMatches);
export function washingtonGuide(id:string){return washingtonAllGuides.find(g=>g.id===id)}
export function washingtonRecordForOregon(registration:string){return oregonWashingtonMatches.find(x=>x.oregonRegistration===registration)}
