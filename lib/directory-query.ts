import type {DirectoryEntry} from './directory';

export type DirectoryFilters={
  state:string;
  sourceZone:string;
  advertisedWater:string;
  query:string;
};

/** This is only a directory search; it is not a credential verification search. */
export function filterDirectoryEntries(entries:DirectoryEntry[], filters:DirectoryFilters):DirectoryEntry[] {
 const needle=filters.query.trim().toLocaleLowerCase();
 return entries.filter(g=>
   (filters.state==='All'||g.states.includes(filters.state as 'Oregon'|'Washington')) &&
   (filters.sourceZone==='All areas'||g.areas.includes(filters.sourceZone)) &&
   (filters.advertisedWater==='All advertised waters'||g.advertisedWaters.includes(filters.advertisedWater)) &&
   [g.name,g.business||'',g.id,...g.areas,...g.searchAliases,...g.advertisedWaters]
    .join(' ').toLocaleLowerCase().includes(needle)
 ).sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base'})||a.id.localeCompare(b.id));
}
