import {oregonGuides,guideSlug} from './registry';
import {washingtonGuides} from './washington';
import {washingtonRecordForOregon} from './washington';
import {advertisedWaterwayNames,guideSearchTerms} from './guide-enrichment';
import {attributesFor} from './guide-attributes-server';

export type DirectoryEntry={
  id:string;
  name:string;
  business:string|null;
  states:('Oregon'|'Washington')[];
  /** Source-imported broad registration zones, NOT verified launch locations. */
  areas:string[];
  /** Independently displayed category: operating waters named in public sources. */
  advertisedWaters:string[];
  /** Search terms from named, publicly linked sources; NOT legal identity verification. */
  searchAliases:string[];
  advertisedSpecies?:string[];
  advertisedMethods?:string[];
  advertisedTrips?:string[];
  testFixture?:boolean;
  /** Separate people associated with saltwater trips; never captain identity aliases. */
  href:string;
  source:string;
};

function discovery(id:string){
 const attributes=attributesFor(id);
 return {
  advertisedSpecies:[...new Set(attributes.flatMap(x=>[...(x.kind==='species'?[x.value]:[]),...(x.relationship?.species?[x.relationship.species]:[])]))],
  advertisedMethods:[...new Set(attributes.flatMap(x=>[...(x.kind==='method'?[x.value]:[]),...(x.relationship?.method?[x.relationship.method]:[])]))],
  linkedWaters:attributes.flatMap(x=>x.relationship?.waterway?[x.relationship.waterway]:[]),
  advertisedTrips:attributes.filter(x=>x.kind==='trip_type').map(x=>x.value),
  sourceNames:attributes.filter(x=>x.kind==='person_name'||x.kind==='business_name').map(x=>x.value),
  testFixture:attributes.some(x=>new URL(x.source.url).hostname==='fixture.invalid'),
 };
}
export const directoryEntries:DirectoryEntry[]=[
 ...oregonGuides.map(g=>({
   id:g.registration,name:g.name,business:g.business,
   states:(washingtonRecordForOregon(g.registration)?['Oregon','Washington']:['Oregon']) as ('Oregon'|'Washington')[],
   areas:g.areas,
   advertisedWaters:[...new Set([...advertisedWaterwayNames(g.registration),...discovery(g.registration).linkedWaters])],
   ...discovery(g.registration),searchAliases:[...guideSearchTerms(g.registration),...discovery(g.registration).sourceNames],
   href:'/guides/'+guideSlug(g),source:'Oregon registry',
 })),
 ...washingtonGuides.map(g=>({
   id:g.id,name:g.name,business:g.business,
   states:['Washington'] as ('Oregon'|'Washington')[],
   areas:g.notes?[g.notes]:[],advertisedWaters:[...new Set([...advertisedWaterwayNames(g.id),...discovery(g.id).linkedWaters])],...discovery(g.id),searchAliases:[...guideSearchTerms(g.id),...discovery(g.id).sourceNames],
   href:'/washington/'+g.id,source:g.source,
 }))
];

export function getDirectoryEntry(id:string){return directoryEntries.find(g=>g.id===id)}
