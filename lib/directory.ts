import {oregonGuides,guideSlug} from './registry';
import {washingtonGuides} from './washington';
import {washingtonRecordForOregon} from './washington';
import {advertisedWaterwayNames,guideSearchTerms} from './guide-enrichment';
import {attributesFor} from './guide-attributes-server';
import {editorialGuideCorrections} from './editorial-guide-corrections';

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
  /** User-provided editorial search names, displayed separately from imported source names. */
  editorialSearchAliases?:{value:string;attributedTo:string}[];
  advertisedSpecies?:string[];
  advertisedMethods?:string[];
  advertisedTrips?:string[];
  businessAdvertisedOfferings?:string[];
  locatedOfferings?:{city:string;state:'OR'|'WA';value:string}[];
  testFixture?:boolean;
  /** Separate people associated with saltwater trips; never captain identity aliases. */
  href:string;
  source:string;
};

function discovery(id:string){
 const attributes=attributesFor(id);
 const businessAdvertisedOfferings=[...new Set(attributes.filter(x=>x.offering_scope==='operator_business').map(x=>x.value))];
 const locatedOfferings=attributes.flatMap(x=>x.location?[{...x.location,value:x.value}]:[]);
 return {
  advertisedSpecies:[...new Set(attributes.flatMap(x=>[...(x.kind==='species'?[x.value]:[]),...(x.relationship?.species?[x.relationship.species]:[])]))],
  advertisedMethods:[...new Set(attributes.flatMap(x=>[...(x.kind==='method'?[x.value]:[]),...(x.relationship?.method?[x.relationship.method]:[])]))],
  linkedWaters:attributes.flatMap(x=>x.relationship?.waterway?[x.relationship.waterway]:[]),
  advertisedTrips:attributes.filter(x=>x.kind==='trip_type').map(x=>x.value),
  ...(businessAdvertisedOfferings.length ? {businessAdvertisedOfferings} : {}),
  ...(locatedOfferings.length ? {locatedOfferings} : {}),
  sourceNames:attributes.filter(x=>x.kind==='person_name'||x.kind==='business_name').map(x=>x.value),
  testFixture:attributes.some(x=>new URL(x.source.url).hostname==='fixture.invalid'),
 };
}
export const directoryEntries:DirectoryEntry[]=[
 ...oregonGuides.map(g=>{
  const editorial=editorialGuideCorrections({id:g.registration,name:g.name,business:g.business});
  const editorialAliases=editorial.filter(x=>x.kind==='search_alias').map(x=>({value:x.value,attributedTo:x.provenance.attributed_to}));
  const sourced=discovery(g.registration);
  return ({
   id:g.registration,name:g.name,business:g.business,
   states:(washingtonRecordForOregon(g.registration)?['Oregon','Washington']:['Oregon']) as ('Oregon'|'Washington')[],
   areas:g.areas,
   advertisedWaters:[...new Set([...advertisedWaterwayNames(g.registration),...sourced.linkedWaters])],
   ...sourced,
   advertisedSpecies:[...new Set([...sourced.advertisedSpecies,...editorial.filter(x=>x.kind==='species').map(x=>x.value)])],
   searchAliases:[...guideSearchTerms(g.registration),...sourced.sourceNames,...editorialAliases.map(x=>x.value)],
   ...(editorialAliases.length?{editorialSearchAliases:editorialAliases}:{}),
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
