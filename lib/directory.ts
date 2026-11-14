import {oregonGuides,guideSlug} from './registry';
import {washingtonGuides} from './washington';
import {washingtonRecordForOregon} from './washington-reconciled';
import {advertisedWaterwayNames,guideSearchTerms} from './guide-enrichment';
import {charterCrewSearchMembers, type CharterCrewMember} from './charter-crew';

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
  /** Separate people associated with saltwater trips; never captain identity aliases. */
  crew?:CharterCrewMember[];
  href:string;
  source:string;
};

export const directoryEntries:DirectoryEntry[]=[
 ...oregonGuides.map(g=>({
   id:g.registration,name:g.name,business:g.business,
   states:(washingtonRecordForOregon(g.registration)?['Oregon','Washington']:['Oregon']) as ('Oregon'|'Washington')[],
   areas:g.areas,
   advertisedWaters:advertisedWaterwayNames(g.registration),
   searchAliases:guideSearchTerms(g.registration),
   crew:charterCrewSearchMembers(g.registration),
   href:'/guides/'+guideSlug(g),source:'Oregon registry',
 })),
 ...washingtonGuides.map(g=>({
   id:g.id,name:g.name,business:g.business,
   states:['Washington'] as ('Oregon'|'Washington')[],
   areas:g.notes?[g.notes]:[],advertisedWaters:[],searchAliases:[],
   crew:charterCrewSearchMembers(g.id),
   href:'/washington/'+g.id,source:g.source,
 }))
];

export function getDirectoryEntry(id:string){return directoryEntries.find(g=>g.id===id)}
