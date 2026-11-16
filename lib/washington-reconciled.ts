// Curated Washington source deduplication for cross-state and repeated WA listings.
// No ownership, current license, phone or email verification is implied.
export type WashingtonSource={source:string;business:string;website?:string;notes?:string};
export type WashingtonCaptain={id:string;name:string;oregonRegistration?:string;washingtonSources:WashingtonSource[];reviewStatus?:string};
export const reconciledWashingtonCaptains:WashingtonCaptain[]=[
{id:"wa-david-godfrey",name:"David Godfrey",washingtonSources:[{source:"WSGA",business:"Salmon Seattle",website:"http://salmonseattle.com/"},{source:"NACO/WSGA",business:"Wind Knot Salmon LLC / Salmon Seattle",website:"http://www.salmonseattle.com",notes:"Ballard"}]},
{id:"wa-cameron-black",name:"Cameron Black",washingtonSources:[{source:"WSGA",business:"Gone Catchin",website:"http://www.gonecatchin.com/"},{source:"localfishingguides",business:"Gone Catchin Guide Service",notes:"Source lists first name Cameron only"}],reviewStatus:"probable same captain; second source omits surname"},
{id:"or-og-0003043",name:"Tony Fisher",oregonRegistration:"OG.0003043",washingtonSources:[{source:"WSGA",business:"Fishers Catch Outfitters",website:"https://www.fisherscatchoutfitters.com/"},{source:"WSGA/local",business:"Fishers Catch Outfitters",website:"http://www.fisherscatchoutfitters.com/"}]},
{id:"or-og-0004087",name:"Shane Magnuson",oregonRegistration:"OG.0004087",washingtonSources:[{source:"WSGA",business:"Upper Columbia Guide Service"},{source:"NW Fishing/Fishin Magician",business:"Upper Columbia Guide Service",notes:"Leavenworth"}]},
{id:"or-og-0000053",name:"Casey Weigel",oregonRegistration:"OG.0000053",washingtonSources:[{source:"localfishingguides",business:"Waters West Guide Service"}]},
{id:"or-og-0003060",name:"Marc Bush",oregonRegistration:"OG.0003060",washingtonSources:[{source:"WSGA",business:"Twisted Waters Guide Service",website:"https://twistedwaters-gs.com/"}]},
{id:"or-og-0004017",name:"Nicholas Ney",oregonRegistration:"OG.0004017",washingtonSources:[{source:"WSGA",business:"Neys Fishing Adventures"}]},
{id:"or-og-0003982",name:"Daniel Richman-Benowitz",oregonRegistration:"OG.0003982",washingtonSources:[{source:"WSGA",business:"PHD Guide Service",website:"http://watuna.com/"}],reviewStatus:"Washington spelling Daniel Benowitz; business match requires review before using as verified"},
{id:"or-og-0000609",name:"Jeffrey Keightley",oregonRegistration:"OG.0000609",washingtonSources:[{source:"WSGA",business:"Astoria Fishing",website:"http://www.astoriafishing.com/"}],reviewStatus:"Washington uses Sr. suffix; matching name and Astoria business; not identity-verified"}
];
// Important: Business affiliations are NOT unique captain identities.
// All Star Fishing Charters, Riverdog Outfitters, Fish Intimidators,
// All Rivers & Saltwater Charters each have multiple named captains and
// must remain separate people even if business names/websites match.
// These source-key allocations are proposals only. No public URL or identity
// match is created until each held source record has been reviewed.
export const unresolvedWashingtonSourceHolds = [
 {key:'["daniel benowitz","phd guide service","wsga"]',proposedId:'wa-158'},
 {key:'["jeffrey keightley sr.","astoria fishing","wsga"]',proposedId:'wa-159'},
 {key:'["marc bush","twisted waters guide service","wsga"]',proposedId:'wa-160'},
 {key:'["nicholas ney","neys fishing adventures","wsga"]',proposedId:'wa-161'},
 {key:'["tony fisher","fishers catch outfitters","wsga/local"]',proposedId:'wa-162'},
] as const;

export type IdentityLinkDecision = {
 oregonRegistration:string;
 washingtonSourceKey:string;
 status:'approved'|'pending'|'ambiguous'|'rejected';
 evidence:{url:string;locator:string;reviewer:string;reviewedOn:string};
};
// Existing research pointers are not identity decisions. No real link has
// been approved; future decisions must identify an exact source record.
export const identityLinkDecisions:IdentityLinkDecision[]=[];
const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=1024&&!/[\u0000-\u001f\u007f]/.test(value);
function validDecision(value:unknown):value is IdentityLinkDecision {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const x=value as Record<string,unknown>;
 if(x.status!=='approved'||!text(x.oregonRegistration)||!/^OG\.\d+$/.test(x.oregonRegistration)||!text(x.washingtonSourceKey))return false;
 try{const key=JSON.parse(x.washingtonSourceKey);if(!Array.isArray(key)||key.length!==3||!text(key[0])||typeof key[1]!=='string'||!text(key[2])||key.some((part:unknown)=>typeof part!=='string'||part!==part.trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' '))||JSON.stringify(key)!==x.washingtonSourceKey)return false}catch{return false}
 if(!x.evidence||typeof x.evidence!=='object'||Array.isArray(x.evidence))return false;
 const e=x.evidence as Record<string,unknown>;
 if(!text(e.url)||!text(e.locator)||!text(e.reviewer)||!text(e.reviewedOn)||!/^\d{4}-\d{2}-\d{2}$/.test(e.reviewedOn))return false;
 const date=new Date(e.reviewedOn+'T00:00:00Z');
 if(Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==e.reviewedOn||e.reviewedOn>new Date().toISOString().slice(0,10))return false;
 try{const u=new URL(e.url);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password}catch{return false}
}
/** Conflicting decisions sharing either endpoint fail closed, including pending ones. */
export function approvedIdentityLinks(decisions:readonly unknown[]):IdentityLinkDecision[] {
 return decisions.filter((item):item is IdentityLinkDecision=>{
  if(!validDecision(item))return false;
  return decisions.filter(other=>!!other&&typeof other==='object'&&!Array.isArray(other)&&
   (((other as Record<string,unknown>).oregonRegistration===item.oregonRegistration)||((other as Record<string,unknown>).washingtonSourceKey===item.washingtonSourceKey))).length===1;
 });
}
/** Return only the approved decision, never unrelated source associations. */
export function washingtonRecordForOregon(registration:string,decisions:readonly unknown[]=identityLinkDecisions,sourceKeys:ReadonlySet<string>=new Set()){
 const approved=approvedIdentityLinks(decisions).find(x=>x.oregonRegistration===registration&&sourceKeys.has(x.washingtonSourceKey));
 return approved&&reconciledWashingtonCaptains.filter(x=>x.oregonRegistration===registration).length===1?approved:undefined;
}
export const washingtonOnlyCaptains=reconciledWashingtonCaptains.filter(x=>!x.oregonRegistration);
