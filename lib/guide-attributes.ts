import holdData from './guide-evidence-holds.json';

/** Evidence contract. Approval is required per attribute, never per business. */
export type AttributeKind='species'|'method'|'trip_type'|'business_name'|'person_name';
export type EvidenceScope='operator_advertises'|'industry_lists';
export type AttributeEvidence={url:string;source_type:'operator_site'|'industry_directory'|'third_party_directory';reviewed_on:string;locator:string};
export type EvidenceAttribute={guide_id:string;kind:AttributeKind;value:string;source:AttributeEvidence;evidence_scope:EvidenceScope;editorial_status:'approved'|'pending'|'rejected';publication_approved:boolean;relationship?:{species?:string;method?:string;waterway?:string}};
const holds=new Set(holdData.held_guides.map(x=>x.guide_id));
const kinds=new Set(['species','method','trip_type','business_name','person_name']);
const scopes=new Set(['operator_advertises','industry_lists']);
const types=new Set(['operator_site','industry_directory','third_party_directory']);
const norm=(s:string)=>s.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ');
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=256&&!/[\u0000-\u001f\u007f]/.test(v);
function validSource(source:unknown):source is AttributeEvidence{
 if(!source||typeof source!=='object')return false;
 const s=source as Record<string,unknown>;
 if(!text(s.url)||!text(s.locator)||!text(s.source_type)||!types.has(s.source_type)||!text(s.reviewed_on)||!/^\d{4}-\d{2}-\d{2}$/.test(s.reviewed_on))return false;
 const date=new Date(s.reviewed_on+'T00:00:00Z');
 if(Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==s.reviewed_on||s.reviewed_on>new Date().toISOString().slice(0,10))return false;
 try{const url=new URL(s.url);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password}catch{return false}
}
function validRelationship(value:unknown,kind:AttributeKind,label:string):boolean{
 if(value===undefined)return true;
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const r=value as Record<string,unknown>;const keys=Object.keys(r);
 if(keys.length<2||keys.some(k=>!['species','method','waterway'].includes(k)||!text(r[k])))return false;
 if((kind==='species'||kind==='method')&&norm(String(r[kind]??''))!==norm(label))return false;
 return true;
}
/** Reject contradictory statuses or invalid evidence; retain distinct sourced relationships. */
export function approvedAttributes(input:unknown,known:ReadonlySet<string>):EvidenceAttribute[]{
 if(!Array.isArray(input))return [];
 const groups=new Map<string,Record<string,unknown>[]>();
 for(const item of input){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;
  const x=item as Record<string,unknown>;
  if(!text(x.guide_id)||!text(x.kind)||!text(x.value))continue;
  const k=JSON.stringify([x.guide_id,x.kind,norm(x.value)]);
  groups.set(k,[...(groups.get(k)??[]),x]);
 }
 const validGroups=new Map<string,boolean>();
 for(const [groupKey,group] of groups){
  const valid=group.every(x=>{
   if(!text(x.guide_id)||!known.has(x.guide_id)||holds.has(x.guide_id)||!text(x.kind)||!kinds.has(x.kind)||!text(x.value)||x.editorial_status!=='approved'||x.publication_approved!==true||!text(x.evidence_scope)||!scopes.has(x.evidence_scope)||!validSource(x.source))return false;
   if(holdData.excluded_waterways.some(exclusion=>exclusion.guide_id===x.guide_id&&(norm(x.value as string)===norm(exclusion.value)||(x.relationship&&typeof x.relationship==='object'&&norm(String((x.relationship as Record<string,unknown>).waterway??''))===norm(exclusion.value)))))return false;
   return validRelationship(x.relationship,x.kind as AttributeKind,x.value);
  });
  validGroups.set(groupKey,valid);
 }
 const result:EvidenceAttribute[]=[];
 for(const [groupKey,group] of groups){
  if(!validGroups.get(groupKey))continue;
  const seen=new Set<string>();
  for(const x of group){
   const source=x.source as AttributeEvidence;
   const relationship=x.relationship as EvidenceAttribute['relationship'];
   const conflicts=(['species','method'] as const).some(kind=>{const value=relationship?.[kind];if(!value)return false;const relatedKey=JSON.stringify([x.guide_id,kind,norm(value)]);return groups.has(relatedKey)&&!validGroups.get(relatedKey)});
   if(conflicts)continue;
   const fingerprint=JSON.stringify([source.url,source.source_type,source.reviewed_on,source.locator,x.evidence_scope,relationship?.species??'',relationship?.method??'',relationship?.waterway??'']);
   if(!seen.has(fingerprint)){seen.add(fingerprint);result.push(x as EvidenceAttribute)}
  }
 }
 return result;
}
