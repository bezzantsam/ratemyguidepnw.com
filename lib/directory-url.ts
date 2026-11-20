import type {DirectoryEntry} from './directory';
import type {CharterOffering} from './charter-offerings';
import {canonicalFisheryLabel,captainTripFacets,directoryMethodLabel,knownDirectoryMethod,directoryEntryInState,directoryFisheryFacets,directorySpeciesLabels,filterDirectoryEntries} from './directory-query';

export type DirectoryState={query:string;state:'All'|'Oregon'|'Washington';area:string;waterway:string;species:string;method:string;gear?:string;month?:number;page:number};
export const DEFAULT_DIRECTORY_STATE:DirectoryState={query:'',state:'All',area:'All areas',waterway:'All advertised waters',species:'All species',method:'All methods',page:1};
export const DIRECTORY_PAGE_SIZE=30;
const keys=new Set(['q','state','area','water','species','method','gear','month','page']);

/** Resolve URL values against the directory, discarding ambiguous or obsolete filters. */
export function parseDirectoryState(search:string,entries:DirectoryEntry[],charters:CharterOffering[]=[],identityOnly=false):DirectoryState {
 if(search.length>2048)return {...DEFAULT_DIRECTORY_STATE};
 const params=new URLSearchParams(search);
 const single=(key:string)=>{const values=params.getAll(key);return values.length===1?values[0]:''};
 const q=single('q');const rawState=single('state');const rawArea=single('area');const rawWater=single('water');const rawSpecies=canonicalFisheryLabel(single('species'));const rawMethod=directoryMethodLabel(single('method'));const rawPage=single('page');
 const state:DirectoryState['state']=rawState==='Oregon'||rawState==='Washington'?rawState:'All';
 const scoped=entries.filter(entry=>directoryEntryInState(entry,state,!identityOnly));
 const directoryFacets=scoped.map(entry=>directoryFisheryFacets(entry,state));
 const captainFacets=identityOnly?[]:entries.map(entry=>captainTripFacets(entry,state));
 const facets=[...directoryFacets,...captainFacets];
 const area=rawArea.length<=256&&scoped.some(entry=>entry.areas.includes(rawArea))?rawArea:'All areas';
 const scopedCharters=charters.filter(offer=>state==='All'||offer.state===state);
 const waterway=rawWater.length<=256&&(facets.some(entry=>entry.waters.includes(rawWater))||scopedCharters.some(offer=>offer.waterway===rawWater||offer.waters?.includes(rawWater)))?rawWater:'All advertised waters';
 const charterSpecies=scopedCharters.some(offer=>offer.species&&directorySpeciesLabels([offer.species]).includes(rawSpecies));
 const species=rawSpecies.length>0&&rawSpecies.length<=256&&(charterSpecies||
  directoryFacets.some(entry=>directorySpeciesLabels(entry.species).includes(rawSpecies))||
  captainFacets.some(entry=>entry.species.includes(rawSpecies)))?rawSpecies:'All species';
 const method=rawMethod.length>0&&rawMethod.length<=256&&(knownDirectoryMethod(rawMethod)||facets.some(entry=>entry.methods.some(label=>directoryMethodLabel(label)===rawMethod))||scopedCharters.some(offer=>offer.method&&directoryMethodLabel(offer.method)===rawMethod))?rawMethod:'All methods';
 const gearOption=knownDirectoryMethod(single('gear'));
 const gear=!identityOnly&&gearOption?.kind==='gear'?gearOption.id:undefined;
 const rawMonth=single('month');
 const month=!identityOnly&&/^(?:[1-9]|1[0-2])$/.test(rawMonth)?Number(rawMonth):undefined;
 const query=q.length<=120&&!/[\u0000-\u001f\u007f]/.test(q)?q:'';
 const count=filterDirectoryEntries(entries,{query,state,sourceZone:area,advertisedWater:waterway,species,method,gear,month,identityOnly},charters.flatMap(offer=>[offer.city,...(offer.portAliases??[]),...(offer.waters??[])])).length;
 const max=Math.max(1,Math.ceil(count/DIRECTORY_PAGE_SIZE));
 const requested=/^[1-9]\d{0,5}$/.test(rawPage)?Number(rawPage):1;
 return {query,state,area,waterway,species,method,...(gear?{gear}:{}),...(month?{month}:{}),page:Math.min(requested,max)};
}
export function directoryUrl(value:DirectoryState, path:'/'|'/guides'|'/write-review'='/guides'):string {
 const p=new URLSearchParams();
 if(value.query)p.set('q',value.query);
 if(value.state!=='All')p.set('state',value.state);
 if(value.area!=='All areas')p.set('area',value.area);
 if(value.waterway!=='All advertised waters')p.set('water',value.waterway);
 if(value.species!=='All species')p.set('species',value.species);
 if(value.method!=='All methods')p.set('method',value.method);
 if(value.gear)p.set('gear',value.gear);
 if(value.month)p.set('month',String(value.month));
 if(value.page>1)p.set('page',String(value.page));
 const query=p.toString();return path+(query?'?'+query:'');
}
/** Only accept a known search page with single-valued search parameters. */
export function safeDirectoryReturn(value:string|null):string {
 if(!value||value.length>2048||/[\u0000-\u001f\u007f\\#]/.test(value))return '/guides';
 const path=value.split('?',1)[0];
 if(path!=='/guides'&&path!=='/write-review'&&path!=='/')return '/guides';
 try {
  const url=new URL(value,'https://directory.invalid');
  if(url.origin!=='https://directory.invalid'||url.pathname!==path)return '/guides';
  for(const key of url.searchParams.keys())if(!keys.has(key)||url.searchParams.getAll(key).length!==1)return '/guides';
  return url.pathname+url.search;
 }catch{return '/guides'}
}
