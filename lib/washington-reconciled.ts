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
export function washingtonRecordForOregon(registration:string){return reconciledWashingtonCaptains.find(x=>x.oregonRegistration===registration)}
export const washingtonOnlyCaptains=reconciledWashingtonCaptains.filter(x=>!x.oregonRegistration);
