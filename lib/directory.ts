import {oregonGuides,guideSlug} from './registry';
import {washingtonGuides} from './washington';
import {washingtonRecordForOregon} from './washington';
import {advertisedWaterwayNames,guideSearchTerms} from './guide-enrichment';
import {attributesFor} from './guide-attributes-server';
import type {EvidenceAttribute} from './guide-attributes';
import type {CaptainTrip} from './public-captain-trips';
import {guideTagsFor} from './directory-guide-tags';

export type DirectoryEntry={
  id:string;
  name:string;
  business:string|null;
  states:('Oregon'|'Washington')[];
  /** Source-imported broad registration zones, NOT verified launch locations. */
  areas:string[];
  /** Independently displayed category: operating waters named in public sources. */
  advertisedWaters:string[];
  /** Search terms from attributed sources, including editorial input; NOT legal identity verification. */
  searchAliases:string[];
  businessSearchKeywords?:{value:string;variants?:string[]}[];
  fishingTags?:string[];
  advertisedSpecies?:string[];
  advertisedMethods?:string[];
  advertisedTrips?:string[];
  businessAdvertisedOfferings?:string[];
  locatedOfferings?:(NonNullable<EvidenceAttribute['location']>&Pick<EvidenceAttribute,'value'|'kind'|'relationship'>)[];
  fisheryOfferings?:(Pick<EvidenceAttribute,'value'|'kind'|'relationship'>&Partial<NonNullable<EvidenceAttribute['location']>>)[];
  captainTrips?:CaptainTrip[];
  testFixture?:boolean;
  /** Separate people associated with saltwater trips; never captain identity aliases. */
  href:string;
  source:string;
};

function discovery(id:string){
 const attributes=attributesFor(id).filter(item=>item.evidence_scope!=='participant_reports');
 const businessAdvertisedOfferings=[...new Set(attributes.filter(x=>x.offering_scope==='operator_business').map(x=>x.value))];
 const fisheryOfferings=attributes.filter(x=>x.kind==='species'||x.kind==='method'||x.kind==='trip_type').map(x=>({
  ...x.location,state:x.location?.state??x.fishery_jurisdiction,value:x.value,kind:x.kind,relationship:x.relationship,
 }));
 const locatedOfferings=attributes.flatMap(x=>x.location?[{...x.location,value:x.value,kind:x.kind,relationship:x.relationship}]:[]);
 return {
  advertisedSpecies:[...new Set(attributes.flatMap(x=>[...(x.kind==='species'?[x.value]:[]),...(x.relationship?.species?[x.relationship.species]:[])]))],
  advertisedMethods:[...new Set(attributes.flatMap(x=>[...(x.kind==='method'?[x.value]:[]),...(x.relationship?.method?[x.relationship.method]:[])]))],
  linkedWaters:attributes.flatMap(x=>x.relationship?.waterway?[x.relationship.waterway]:[]),
  advertisedTrips:attributes.filter(x=>x.kind==='trip_type').map(x=>x.value),
  ...(businessAdvertisedOfferings.length ? {businessAdvertisedOfferings} : {}),
  ...(locatedOfferings.length ? {locatedOfferings} : {}),
  ...(fisheryOfferings.length ? {fisheryOfferings} : {}),
  sourceNames:attributes.filter(x=>x.kind==='person_name'||x.kind==='business_name').map(x=>x.value),
  testFixture:attributes.some(x=>new URL(x.source.url).hostname==='fixture.invalid'),
 };
}
export const directoryEntries:DirectoryEntry[]=[
 ...oregonGuides.map(g=>{
  const tags=guideTagsFor({id:g.registration,name:g.name,business:g.business});
  const aliases=tags.filter(tag=>tag.kind==='search_alias').map(tag=>tag.value);
  const businessKeywords=tags.filter(tag=>tag.kind==='business_search_keyword').map(tag=>({
   value:tag.value,...(tag.search_variants?{variants:tag.search_variants}:{}),
  }));
  const fishingTags=tags.filter(tag=>tag.kind==='species'||tag.kind==='method').map(tag=>tag.value);
  const sourced=discovery(g.registration);
  return ({
   id:g.registration,name:g.preferredName??g.name,business:g.business,
   states:(washingtonRecordForOregon(g.registration)?['Oregon','Washington']:['Oregon']) as ('Oregon'|'Washington')[],
   areas:g.areas,
   advertisedWaters:[...new Set([...advertisedWaterwayNames(g.registration),...sourced.linkedWaters])],
   ...sourced,
   advertisedSpecies:[...new Set([...sourced.advertisedSpecies,...tags.filter(x=>x.kind==='species').map(x=>x.value)])],
   advertisedMethods:[...new Set([...sourced.advertisedMethods,...tags.filter(x=>x.kind==='method').map(x=>x.value)])],
   ...(fishingTags.length?{fishingTags}:{}),
   searchAliases:[...(g.preferredName?[g.name]:[]),...guideSearchTerms(g.registration),...sourced.sourceNames,...aliases],
   ...(businessKeywords.length?{businessSearchKeywords:businessKeywords}:{}),
   href:'/guides/'+guideSlug(g),source:'Oregon registry',
 })}),
 ...washingtonGuides.map(g=>({
   id:g.id,name:g.name,business:g.business,
   states:['Washington'] as ('Oregon'|'Washington')[],
   areas:g.notes?[g.notes]:[],advertisedWaters:[...new Set([...advertisedWaterwayNames(g.id),...discovery(g.id).linkedWaters])],...discovery(g.id),searchAliases:[...guideSearchTerms(g.id),...discovery(g.id).sourceNames],
   href:'/washington/'+g.id,source:g.source,
 }))
];

export function getDirectoryEntry(id:string){return directoryEntries.find(g=>g.id===id)}
