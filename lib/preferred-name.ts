/** Display-only overlay; source IDs, canonical names and relationships never change. */
export function preferredDisplayName(listed:string,preferred:string|null|undefined):string {
 const name=preferred?.trim();if(!name||name.toLocaleLowerCase()===listed.trim().toLocaleLowerCase())return listed;
 if(/\s/u.test(name))return name;
 const parts=listed.trim().match(/^(\S+)\s+(.+)$/u);
 return parts?`${parts[1]} “${name}” ${parts[2]}`:name;
}
import type {DirectoryEntry} from './directory';
import type {PreferredName} from './launch-client';


/** Replace only overlaid entries so cached search indexes never retain old names. */
export function applyPreferredNames(entries:DirectoryEntry[],names:PreferredName[]):DirectoryEntry[]{
 const byId=new Map(names.map(name=>[`${name.jurisdiction}:${name.sourceId}`,name]));
 return entries.map(entry=>{const jurisdiction=entry.id.startsWith('OG.')?'OR':'WA';const preferred=byId.get(`${jurisdiction}:${entry.id}`);return preferred?{...entry,displayName:preferredDisplayName(entry.name,preferred.name),preferredName:{name:preferred.name,provenance:preferred.provenance},searchAliases:[...entry.searchAliases,preferred.name]}:entry});
}

/** Fetch the complete search index in bounded batches; stop on failure and retain source names. */
export async function loadPreferredNames(entries:DirectoryEntry[],fetchBatch:(jurisdiction:'OR'|'WA',ids:string[])=>Promise<PreferredName[]>):Promise<PreferredName[]>{
 const groups=(['OR','WA'] as const).flatMap(jurisdiction=>{const ids=entries.filter(e=>jurisdiction==='OR'?e.id.startsWith('OG.'):e.id.startsWith('wa-')).map(e=>e.id);return Array.from({length:Math.ceil(ids.length/100)},(_,i)=>({jurisdiction,ids:ids.slice(i*100,(i+1)*100)}))});
 const all:PreferredName[]=[];
 if(groups.length)all.push(...await fetchBatch(groups[0].jurisdiction,groups[0].ids));
 for(let i=1;i<groups.length;i+=3)all.push(...(await Promise.all(groups.slice(i,i+3).map(group=>fetchBatch(group.jurisdiction,group.ids)))).flat());
 return all;
}
