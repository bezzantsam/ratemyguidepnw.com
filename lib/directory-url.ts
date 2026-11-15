import type {DirectoryEntry} from './directory';
import {filterDirectoryEntries} from './directory-query';

export type DirectoryState={query:string;state:'All'|'Oregon'|'Washington';area:string;waterway:string;species:string;method:string;page:number};
export const DEFAULT_DIRECTORY_STATE:DirectoryState={query:'',state:'All',area:'All areas',waterway:'All advertised waters',species:'All species',method:'All methods',page:1};
export const DIRECTORY_PAGE_SIZE=30;
const keys=new Set(['q','state','area','water','species','method','page']);

/** Resolve URL values against the directory, discarding ambiguous or obsolete filters. */
export function parseDirectoryState(search:string,entries:DirectoryEntry[]):DirectoryState {
 if(search.length>2048)return {...DEFAULT_DIRECTORY_STATE};
 const params=new URLSearchParams(search);
 const single=(key:string)=>{const values=params.getAll(key);return values.length===1?values[0]:''};
 const q=single('q');const rawState=single('state');const rawArea=single('area');const rawWater=single('water');const rawSpecies=single('species');const rawMethod=single('method');const rawPage=single('page');
 const state:DirectoryState['state']=rawState==='Oregon'||rawState==='Washington'?rawState:'All';
 const scoped=entries.filter(entry=>state==='All'||entry.states.includes(state));
 const area=rawArea.length<=256&&scoped.some(entry=>entry.areas.includes(rawArea))?rawArea:'All areas';
 const waterway=rawWater.length<=256&&scoped.some(entry=>entry.advertisedWaters.includes(rawWater))?rawWater:'All advertised waters';
 const species=rawSpecies.length<=256&&scoped.some(entry=>(entry.advertisedSpecies??[]).includes(rawSpecies))?rawSpecies:'All species';
 const method=rawMethod.length<=256&&scoped.some(entry=>(entry.advertisedMethods??[]).includes(rawMethod))?rawMethod:'All methods';
 const query=q.length<=120&&!/[\u0000-\u001f\u007f]/.test(q)?q:'';
 const count=filterDirectoryEntries(entries,{query,state,sourceZone:area,advertisedWater:waterway,species,method}).length;
 const max=Math.max(1,Math.ceil(count/DIRECTORY_PAGE_SIZE));
 const requested=/^[1-9]\d{0,5}$/.test(rawPage)?Number(rawPage):1;
 return {query,state,area,waterway,species,method,page:Math.min(requested,max)};
}
export function directoryUrl(value:DirectoryState):string {
 const p=new URLSearchParams();
 if(value.query)p.set('q',value.query);
 if(value.state!=='All')p.set('state',value.state);
 if(value.area!=='All areas')p.set('area',value.area);
 if(value.waterway!=='All advertised waters')p.set('water',value.waterway);
 if(value.species!=='All species')p.set('species',value.species);
 if(value.method!=='All methods')p.set('method',value.method);
 if(value.page>1)p.set('page',String(value.page));
 const query=p.toString();return '/guides'+(query?'?'+query:'');
}
/** Only accept a relative directory URL with known, single-valued parameters. */
export function safeDirectoryReturn(value:string|null):string {
 if(!value||value.length>2048||!value.startsWith('/guides')||/[\u0000-\u001f\u007f\\]/.test(value))return '/guides';
 try {
  const url=new URL(value,'https://directory.invalid');
  if(url.origin!=='https://directory.invalid'||url.pathname!=='/guides'||url.hash)return '/guides';
  for(const key of url.searchParams.keys())if(!keys.has(key)||url.searchParams.getAll(key).length!==1)return '/guides';
  return url.pathname+url.search;
 }catch{return '/guides'}
}
