import {oregonGuides,guideSlug} from './registry';
import {washingtonGuides} from './washington';
import {washingtonRecordForOregon} from './washington-reconciled';
export type DirectoryEntry={id:string;name:string;business:string|null;states:('Oregon'|'Washington')[];areas:string[];href:string;source:string};
export const directoryEntries:DirectoryEntry[]=[
 ...oregonGuides.map(g=>({id:g.registration,name:g.name,business:g.business,states:(washingtonRecordForOregon(g.registration)?['Oregon','Washington']:['Oregon']) as ('Oregon'|'Washington')[],areas:g.areas,href:'/guides/'+guideSlug(g),source:'Oregon registry'})),
 ...washingtonGuides.map(g=>({id:g.id,name:g.name,business:g.business,states:['Washington'] as ('Oregon'|'Washington')[],areas:g.notes?[g.notes]:[],href:'/washington/'+g.id,source:g.source}))
];
export function getDirectoryEntry(id:string){return directoryEntries.find(g=>g.id===id)}
