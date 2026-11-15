import {oregonGuides,guideSlug} from './registry';
import {washingtonGuides} from './washington';
import {washingtonRecordForOregon} from './washington-reconciled';
import {advertisedWaterwayNames,advertisedSpeciesNames,advertisedTechniqueNames,advertisedTripTypeNames,guideEnrichmentFor,guideSearchTerms} from './guide-enrichment';
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
  advertisedSpecies?:string[];
  advertisedTechniques?:string[];
  advertisedTripTypes?:string[];
  /** Historical registry website, not independently source-linked or verified. */
  hasRegistryWebsite?:boolean;
  /** A source-linked business profile, not current licensing or operator ownership verification. */
  hasPublicSource?:boolean;
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
   advertisedSpecies:advertisedSpeciesNames(g.registration),
   advertisedTechniques:advertisedTechniqueNames(g.registration),
   advertisedTripTypes:advertisedTripTypeNames(g.registration),
   hasRegistryWebsite:Boolean(guideEnrichmentFor(g.registration)?.registryWebsite),
   hasPublicSource: Boolean(guideEnrichmentFor(g.registration)?.sourceLinks?.length || guideEnrichmentFor(g.registration)?.advertisedWaters.length),
   crew:charterCrewSearchMembers(g.registration),
   href:'/guides/'+guideSlug(g),source:'Oregon registry',
 })),
 ...washingtonGuides.map(g=>({
   id:g.id,name:g.name,business:g.business,
   states:['Washington'] as ('Oregon'|'Washington')[],
   areas:g.notes?[g.notes]:[],advertisedWaters:advertisedWaterwayNames(g.id),searchAliases:guideSearchTerms(g.id),
   hasPublicSource: Boolean(guideEnrichmentFor(g.id)?.sourceLinks?.length || guideEnrichmentFor(g.id)?.advertisedWaters.length),
   advertisedSpecies:advertisedSpeciesNames(g.id),
   advertisedTechniques:advertisedTechniqueNames(g.id),
   advertisedTripTypes:advertisedTripTypeNames(g.id),
   hasRegistryWebsite:false,
   crew:charterCrewSearchMembers(g.id),
   href:'/washington/'+g.id,source:g.source,
 }))
];

export function getDirectoryEntry(id:string){return directoryEntries.find(g=>g.id===id)}
