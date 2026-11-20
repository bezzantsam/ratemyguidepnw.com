import {fishingOptions, isLegacyFishingGear, type FishingOption} from './captain-fishing/catalog.mjs';
import type {DirectoryEntry} from './directory';
import type {CaptainTrip} from './public-captain-trips';

export type DirectoryFilters={state:string;sourceZone:string;advertisedWater:string;query:string;species?:string;method?:string;gear?:string;month?:number;identityOnly?:boolean};

/** Search expansions only. These do NOT add identity aliases or credential evidence. */
const nicknameFamilies=[
 ['william','bill','billy'],['robert','rob','bob','bobby'],['charles','charlie','chuck'],
 ['daniel','dan','danny'],['james','jim','jimmy'],['richard','rich','rick','dick'],
 ['edward','ed','eddie'],['michael','mike','mikey'],['christopher','chris'],
 ['joseph','joe','joey'],['david','dave'],['thomas','tom','tommy'],
 ['nicholas','nick','nicky'],['anthony','tony'],['andrew','andy'],
 ['alexander','alex'],['benjamin','ben','benny'],['samuel','sam','sammy'],['walter','walt'],
];
export function normalizeGuideSearch(value:string):string {
 return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/['’]/g,'').replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
const nicknameLookup=new Map(nicknameFamilies.flatMap(group=>group.map(name=>[name,group] as const)));
const fisheryAliases = [
 ['Salmon'], ['Chinook Salmon','chinook','king salmon','spring chinook','springer'],
 ['Coho Salmon','coho','silver salmon'], ['Sockeye Salmon','sockeye','red salmon'],
 ['Pink Salmon','pink salmon fishing','humpy','humpback salmon'], ['Chum Salmon','dog salmon'],
 ['Ocean salmon','marine salmon','ocean salmon fishing'], ['Buoy 10 salmon'],
 ['Steelhead','steelhead trout','sea-run rainbow trout'],
 ['Trout'], ['Rainbow trout','rainbow trout fishing'], ['Redband trout','redband'],
 ['Cutthroat trout','coastal cutthroat trout'], ['Sea-run cutthroat','sea-run cutthroat trout'],
 ['Brown trout'], ['Brook trout','brookie'], ['Lake trout','mackinaw','mackinaw trout'], ['Bull trout'],
 ['Kokanee','kokanee salmon','landlocked sockeye'], ['Whitefish'], ['Mountain whitefish'], ['Lake whitefish'],
 ['Burbot','freshwater ling'], ['American shad','shad','shad fishing','American shad fishing'],
 ['Sturgeon'], ['White sturgeon'], ['Green sturgeon'], ['Walleye'], ['Panfish','pan fish'],
 ['Perch'], ['Yellow perch'], ['Crappie'], ['Bluegill'], ['Catfish'], ['Channel catfish'],
 ['Carp','carp fishing'], ['Northern pike','pike'],
 ['Bass','freshwater bass'], ['Smallmouth bass','smallmouth','small mouth bass','smallmouths','smallies'],
 ['Largemouth bass','largemouth','large mouth bass','largemouths'], ['Spotted bass'],
 ['Striped bass','stripers','striper'], ['Hybrid striped bass','wiper','wipers'],
 ['Tiger muskie','tiger muskies','tiger musky','tiger muskellunge','muskie','musky','muskellunge'],
 ['Tuna'], ['Albacore tuna','albacore'], ['Halibut','Pacific halibut'],
 ['Sablefish (black cod)','sablefish','black cod','blackcod','black cod sablefish'],
 ['Bottom fishing','bottomfish','bottom fish','bottomfishing','groundfish fishing','ground fishing','groundfish'],
 ['Rockfish','rock fish'], ['Black rockfish'], ['Canary rockfish'], ['Copper rockfish'],
 ['Yellowtail rockfish'], ['Quillback rockfish'], ['Vermilion rockfish'], ['China rockfish'],
 ['Blue rockfish'], ['Deacon rockfish'], ['Widow rockfish'], ['Bocaccio','bocaccio rockfish'],
 ['Lingcod','ling cod'], ['Cabezon'], ['Greenling'], ['Kelp greenling'], ['Pacific cod'],
 ['Flatfish'], ['Flounder','flounder fishing'], ['Starry flounder'], ['Sole'],
 ['Surfperch','surf perch'], ['Redtail surfperch','red-tailed surfperch','redtail surf perch'],
 ['Squid','squid fishing','squid jigging','squidding'],
 ['Crabbing','crab','crab fishing','crab catching','Dungeness crabbing'], ['Dungeness crab'],
 ['Shrimping','shrimp fishing','prawning','shrimp'], ['Spot shrimp','spot prawn','spot prawns'],
 ['Clamming','clam digging'], ['Razor clamming','razor clam digging'], ['Bay clamming','bay clam digging'],
 ['Geoduck'], ['Oyster gathering'], ['Mussel gathering'],
];
const canonicalLabels = new Map(fisheryAliases.flatMap(group=>
 group.map(alias=>[normalizeGuideSearch(alias),group[0]] as const)));
const broadSpecies = new Map([
 ['Tuna',['Albacore tuna']],
 ['Bass',['Smallmouth bass','Largemouth bass','Spotted bass']],
 ['Trout',['Rainbow trout','Redband trout','Cutthroat trout','Sea-run cutthroat','Brown trout','Brook trout','Lake trout','Bull trout']],
 ['Sturgeon',['White sturgeon','Green sturgeon']],
 ['Panfish',['Perch','Yellow perch','Crappie','Bluegill']], ['Perch',['Yellow perch']],
 ['Catfish',['Channel catfish']], ['Whitefish',['Mountain whitefish','Lake whitefish']],
 ['Rockfish',['Black rockfish','Canary rockfish','Copper rockfish','Yellowtail rockfish','Quillback rockfish',
  'Vermilion rockfish','China rockfish','Blue rockfish','Deacon rockfish','Widow rockfish','Bocaccio']],
 ['Greenling',['Kelp greenling']], ['Flatfish',['Flounder','Starry flounder','Sole']], ['Flounder',['Starry flounder']],
 ['Surfperch',['Redtail surfperch']], ['Crabbing',['Dungeness crab']],
 ['Shrimping',['Spot shrimp']], ['Clamming',['Razor clamming','Bay clamming']],
]);
const commonSpeciesGroups = [
 {label:'Salmon and trout',choices:['Salmon','Chinook Salmon','Steelhead','Trout','Kokanee']},
 {label:'Rivers and lakes',choices:['Bass','Striped bass','Tiger muskie','American shad','Sturgeon','Walleye','Panfish']},
 {label:'Coast and Puget Sound',choices:['Tuna','Halibut','Rockfish','Lingcod','Sablefish (black cod)','Flatfish','Surfperch','Crabbing','Shrimping','Squid']},
];

/** Show regional choices backed by current results. Keep older, more specific URL selections usable. */
export function directorySpeciesMenu(available:string[],selected:string) {
 const groups=commonSpeciesGroups.map(({label,choices})=>({label,choices:choices.filter(choice=>available.includes(choice))}));
 const displayed=groups.flatMap(group=>group.choices);
 return {
  groups:groups.filter(group=>group.choices.length),
  selectedOnly:available.includes(selected)&&!displayed.includes(selected),
 };
}
export function canonicalFisheryLabel(value:string):string {
 const normalized=normalizeGuideSearch(value);
 return canonicalLabels.get(normalized) ?? value;
}
// A catalog choice describes a filter; only sourced directory facts can satisfy it.
const catalogMethods = new Map<string, FishingOption>();
for (const option of fishingOptions) {
 for (const alias of option.aliases) catalogMethods.set(normalizeGuideSearch(alias), option);
}
for (const option of fishingOptions) {
 // An exact label takes precedence over an alias, e.g. gear “Crab rings”.
 for (const key of [option.id, option.label]) catalogMethods.set(normalizeGuideSearch(key), option);
}
export function knownDirectoryMethod(value:string):FishingOption|undefined {
 return catalogMethods.get(normalizeGuideSearch(value))??catalogMethods.get(normalizeGuideSearch(canonicalFisheryLabel(value)));
}
export function directoryMethodLabel(value:string):string {
 return knownDirectoryMethod(value)?.label ?? canonicalFisheryLabel(value);
}
const catalogMethodLabels = fishingOptions.filter(option=>option.kind==='method').map(option=>option.label);
const gearLabels = fishingOptions.filter(option=>option.kind==='gear'&&!isLegacyFishingGear(option.id)).map(option=>option.label);
export function directoryMethodGroups(sourcedLabels:string[]) {
 const otherMethods = sourcedLabels.filter(label=>!knownDirectoryMethod(label)).map(directoryMethodLabel);
 return {methods:[...new Set([...catalogMethodLabels,...otherMethods])].sort(), gear:gearLabels};
}
function isKnownFishery(value:string):boolean {
 return Boolean(knownDirectoryMethod(value))||canonicalLabels.has(normalizeGuideSearch(value))||broadSpecies.has(canonicalFisheryLabel(value));
}
export function matchesFisherySearch(query:string,offerings:string[],methods:string[]=offerings):boolean|null {
 const choice=knownDirectoryMethod(query);
 const label=canonicalFisheryLabel(query);
 if(choice){
  if(methods.some(value=>directoryMethodLabel(value)===choice.label))return true;
  // Free text can name a fishery as well as a method, such as squidding.
  if(choice.kind==='gear'||label===choice.label||!canonicalLabels.has(normalizeGuideSearch(query)))return false;
 }
 if(!isKnownFishery(query))return null;
 const accepted=[label,...(broadSpecies.get(label)??[])];
 return offerings.some(value=>accepted.includes(canonicalFisheryLabel(value)));
}

const fisheryPlaceAliases=new Map([['mayfield lake',['lake mayfield']]]);
export function fisheryAtPort(query:string,cities:string[],method?:string,species?:string) {
 const search=normalizeGuideSearch(query);
 const selected=[method,species].find(value=>value&&isKnownFishery(value));
 for(const city of new Set(cities.flatMap(city=>city.split(' or ')).map(normalizeGuideSearch))){
  for(const place of [city,...(fisheryPlaceAliases.get(city)??[])]){
   const term=search.startsWith(place+' ')?search.slice(place.length+1):search.endsWith(' '+place)?search.slice(0,-place.length-1):'';
   if(place===search&&selected)return {city,term:selected};
   if(term==='buoy 10')return {city,term:'buoy 10 salmon'};
   if(isKnownFishery(term))return {city,term};
  }
 }
 return null;
}

type ScopedOffering=NonNullable<DirectoryEntry['fisheryOfferings']>[number];
function offeringPlaces(item:ScopedOffering):string[] {
 return [item.city,...(item.aliases??[]),item.relationship?.waterway].filter((value):value is string=>Boolean(value));
}
function sourcedOfferings(entry:DirectoryEntry):ScopedOffering[] {
 return entry.fisheryOfferings??entry.locatedOfferings??[];
}
function inJurisdiction(item:ScopedOffering,state:string):boolean {
 return state==='All'||!item.state||state===(item.state==='OR'?'Oregon':'Washington');
}
export function locatedGuidePorts(entries:DirectoryEntry[]):string[] {
 return entries.flatMap(entry=>sourcedOfferings(entry).flatMap(offeringPlaces));
}
export function directorySpeciesLabels(species:string[]=[]):string[] {
 const labels=species.map(canonicalFisheryLabel);
 return [...new Set([...labels,...[...broadSpecies].filter(([,specific])=>specific.some(label=>labels.includes(label))).map(([broad])=>broad)])];
}
function offeringFacets(item:ScopedOffering) {
 return {
  species:item.kind==='species'?item.value:item.relationship?.species,
  method:item.kind==='method'?item.value:item.relationship?.method,
  trip:item.kind==='trip_type'?item.value:undefined,
  waterway:item.relationship?.waterway,
 };
}
export function directoryFisheryFacets(entry:DirectoryEntry,state:string) {
 const all={species:entry.advertisedSpecies??[],methods:entry.advertisedMethods??[],trips:entry.advertisedTrips??[],waters:entry.advertisedWaters};
 if(state==='All'||!entry.fisheryOfferings)return all;
 const sourced=entry.fisheryOfferings;
 const native=entry.states.includes(state as 'Oregon'|'Washington');
 const local=sourced.filter(item=>item.state?inJurisdiction(item,state):native).map(offeringFacets);
 const scoped=sourced.filter(item=>item.state).map(offeringFacets);
 const select=(key:keyof ReturnType<typeof offeringFacets>,values:string[])=>values.filter(label=>
  local.some(item=>item[key]===label)||(native&&!scoped.some(item=>item[key]===label)));
 return {species:select('species',all.species),methods:select('method',all.methods),trips:select('trip',all.trips),waters:select('waterway',all.waters)};
}
export function directoryEntryInState(entry:DirectoryEntry,state:string,includeFishery=false):boolean {
 return state==='All'||entry.states.includes(state as 'Oregon'|'Washington')||
  (includeFishery&&sourcedOfferings(entry).some(item=>item.state&&inJurisdiction(item,state)));
}
/** Bounded optimal-string-alignment distance: insertion, deletion, substitution, adjacent swap. */
function closeSpelling(a:string,b:string,max:number):boolean {
 if(Math.abs(a.length-b.length)>max)return false;
 let older:number[]=[],previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const row=[i];
  for(let j=1;j<=b.length;j++){
   row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
   if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],older[j-2]+1);
  }
  if(Math.min(...row)>max)return false;
  older=previous;previous=row;
 }
 return previous[b.length]<=max;
}
type SearchIndex={identity:string[];context:string[];tokens:string[];contextTokens:string[];firstName:string;id:string};
const cache=new WeakMap<DirectoryEntry,SearchIndex>();
function indexFor(entry:DirectoryEntry):SearchIndex {
 let index=cache.get(entry);if(index)return index;
 const identity=[entry.name,entry.business??'',...entry.searchAliases].map(normalizeGuideSearch).filter(Boolean);
 const context=[...entry.areas,...entry.advertisedWaters,...(entry.advertisedSpecies??[]),...(entry.advertisedMethods??[]),...(entry.advertisedTrips??[])].map(normalizeGuideSearch).filter(Boolean);
 index={identity,context,tokens:[...new Set(identity.flatMap(value=>value.split(' ')))],contextTokens:[...new Set(context.flatMap(value=>value.split(' ')))],firstName:normalizeGuideSearch(entry.name).split(' ')[0],id:entry.id.toLowerCase()};
 cache.set(entry,index);return index;
}
function matchesBusinessKeyword(entry:DirectoryEntry,query:string):boolean {
 if(!entry.business||!entry.businessSearchKeywords?.length)return false;
 const business=normalizeGuideSearch(entry.business);
 return entry.businessSearchKeywords.some(({value,variants})=>[value,...(variants??[])].some(alias=>{
  const keyword=normalizeGuideSearch(alias);
  if(query===keyword)return true;
  const businessTerm=query.startsWith(keyword+' ')?query.slice(keyword.length+1):
   query.endsWith(' '+keyword)?query.slice(0,-keyword.length-1):'';
  return Boolean(businessTerm&&business.startsWith(businessTerm));
 }));
}
/** Lower scores mean closer matches. Null means at least one query term is unsupported. */
export function guideSearchScore(entry:DirectoryEntry,query:string,identityOnly=false):number|null {
 const raw=query.trim().toLowerCase();if(!raw)return 0;
 const index=indexFor(entry);
 // Registration/WA IDs must never be silently corrected to another identity.
 if(/^(og[.\s-]?\d|wa[.\s-]?\d)/i.test(raw))return index.id===raw?0:index.id.startsWith(raw)?1:null;
 const needle=normalizeGuideSearch(raw);if(!needle)return null;
 const fishery=matchesFisherySearch(needle,[...(entry.advertisedSpecies??[]),...(entry.advertisedMethods??[]),...(entry.advertisedTrips??[])],entry.advertisedMethods??[]);
 if (!identityOnly&&fishery!==null)return fishery ? 30 : null;
 if(index.identity.includes(needle)||matchesBusinessKeyword(entry,needle))return 0;
 if(index.identity.some(value=>value.startsWith(needle)))return 1;
 if(index.identity.some(value=>value.includes(needle)))return 2;
 const terms=[...new Set(needle.split(' '))];
 // Bound work on pasted text. Every supported term still has to match.
 if(terms.length>12||terms.some(term=>term.length>80))return null;
 let worst=0,total=0;
 for(const term of terms){
  let cost:number|null=null;
  if(index.tokens.includes(term))cost=0;
  else if(index.tokens.some(token=>token.startsWith(term)))cost=1;
  else if(nicknameLookup.get(term)?.includes(index.firstName))cost=2;
  else if(!identityOnly&&index.contextTokens.includes(term))cost=3;
  else if(!identityOnly&&index.contextTokens.some(token=>token.startsWith(term)))cost=4;
  else if(term.length>=4){
   const distance=term.length>=7?2:1;
   if(index.tokens.some(token=>token.length>=4&&closeSpelling(term,token,distance)))cost=5;
   else if(!identityOnly&&index.contextTokens.some(token=>token.length>=4&&closeSpelling(term,token,distance)))cost=6;
  }
  if(cost===null)return null;
  worst=Math.max(worst,cost);total+=cost;
 }
 return 10+worst*10+total/terms.length;
}

function matchesCaptainTripFishery(query:string,species:string[],methods:string[]):boolean|null {
 if(query==='dungeness crabbing')return species.includes('Dungeness crab');
 return matchesFisherySearch(query,species,methods);
}

export function captainTripFacets(entry:DirectoryEntry,state:string) {
 const local=(entry.captainTrips??[]).filter(trip=>state==='All'||state===(trip.jurisdiction==='OR'?'Oregon':'Washington'));
 return {
  waters:local.flatMap(trip=>[trip.waterway,trip.launchArea]).filter(Boolean),
  species:local.flatMap(trip=>trip.species),
  methods:local.flatMap(trip=>trip.methodIds.map(directoryMethodLabel)),
 };
}

/** Every selected trip attribute and fishery search term must match this offering. */
export function matchingCaptainTrips(entry:DirectoryEntry,filters:DirectoryFilters):CaptainTrip[] {
 if(filters.identityOnly||!entry.captainTrips?.length)return [];
 if(filters.sourceZone!=='All areas'&&!entry.areas.includes(filters.sourceZone))return [];
 const query=normalizeGuideSearch(filters.query);
 const fisheryQuery=query.replace(/\bmixed (?:bottomfish|groundfish)\b/g,'bottom fishing');
 const queryIdentity=query?guideSearchScore(entry,filters.query,true):null;
 return entry.captainTrips.filter(trip=>{
  const state=trip.jurisdiction==='OR'?'Oregon':'Washington';
  if(filters.state!=='All'&&filters.state!==state)return false;
  const places=[trip.waterway,trip.launchArea].filter(Boolean);
  if(filters.advertisedWater!=='All advertised waters'&&!places.includes(filters.advertisedWater))return false;
  if(filters.species&&filters.species!=='All species'&&!directorySpeciesLabels(trip.species).includes(filters.species))return false;
  const methods=[...trip.methodIds,...trip.gearIds].map(directoryMethodLabel);
  if(filters.method&&filters.method!=='All methods'&&!methods.includes(directoryMethodLabel(filters.method)))return false;
  if(filters.gear&&!trip.gearIds.includes(filters.gear))return false;
  if(filters.month&&!trip.months.includes(filters.month))return false;
  if(!query)return true;
  const atPort=fisheryAtPort(fisheryQuery,places,filters.method,filters.species);
  if(atPort)return matchesCaptainTripFishery(atPort.term,trip.species,methods)===true;
  const fishery=matchesCaptainTripFishery(fisheryQuery,trip.species,methods);
  if(fishery!==null)return fishery;
  if(queryIdentity!==null)return true;
  const context=normalizeGuideSearch([trip.title,...places,...trip.species,...methods].join(' '));
  return query.split(' ').every(term=>context.split(' ').includes(term));
 });
}

/** A full sourced water name uses the same scope as the explicit water filter. */
export function applyDirectoryWaterQuery(entries:DirectoryEntry[],filters:DirectoryFilters):DirectoryFilters|null {
 const query=normalizeGuideSearch(filters.query);
 if(!query)return filters;
 for(const entry of entries){
  const water=entry.advertisedWaters.find(name=>normalizeGuideSearch(name)===query);
  if(!water)continue;
  if(filters.advertisedWater!=='All advertised waters'&&normalizeGuideSearch(filters.advertisedWater)!==query)return null;
  return {...filters,query:'',advertisedWater:filters.advertisedWater==='All advertised waters'?water:filters.advertisedWater};
 }
 return filters;
}

/** Exact filters stay exact; fuzzy text matches never expand fisheries or merge identities. */
export function filterDirectoryEntries(entries:DirectoryEntry[],requested:DirectoryFilters,charterCities:string[]=[]):DirectoryEntry[]{
 const filters=applyDirectoryWaterQuery(entries,requested);
 if(!filters)return [];
 const portSearch=filters.query.trim() ? fisheryAtPort(filters.query,[
  ...charterCities,...locatedGuidePorts(entries),
 ],filters.method,filters.species) : null;
 const hasSpecies=Boolean(filters.species&&filters.species!=='All species');
 const selectedMethod=filters.method && filters.method!=='All methods' ? directoryMethodLabel(filters.method) : undefined;
 const hasMethod=Boolean(selectedMethod);
 const textSpecies=hasMethod?canonicalFisheryLabel(filters.query):undefined;
 const textMethod=hasSpecies?directoryMethodLabel(filters.query):undefined;
 const sameMethod=(value:string|undefined)=>value!==undefined && directoryMethodLabel(value)===selectedMethod;
 const hasWater=filters.advertisedWater!=='All advertised waters';
 const includeFishery=!filters.identityOnly&&(Boolean(portSearch)||isKnownFishery(filters.query)||hasSpecies||hasMethod||hasWater);
 const existingScore=(entry:DirectoryEntry):number|null=>{
  if(filters.gear||filters.month)return null;
  if(!directoryEntryInState(entry,filters.state,includeFishery)||
     (filters.sourceZone!=='All areas'&&!entry.areas.includes(filters.sourceZone)))return null;
  const facets=directoryFisheryFacets(entry,filters.state);
  if((hasWater&&!facets.waters.includes(filters.advertisedWater))||
     (hasSpecies&&!directorySpeciesLabels(facets.species).includes(filters.species!))||
     (hasMethod&&!facets.methods.some(sameMethod)))return null;
  if(!portSearch){
   const pairedSpecies=hasSpecies?filters.species:
    textSpecies&&directorySpeciesLabels(facets.species).includes(textSpecies)?textSpecies:undefined;
   const pairedMethod=selectedMethod??(textMethod&&facets.methods.some(value=>directoryMethodLabel(value)===textMethod)?textMethod:undefined);
   if(!hasWater&&pairedSpecies&&pairedMethod){
    // Only entries without in-scope offerings fall back to their flat listing facets.
    const offerings=sourcedOfferings(entry).filter(item=>inJurisdiction(item,filters.state));
    if(offerings.length&&!offerings.some(item=>{
     const {species,method}=offeringFacets(item);
     return species&&directorySpeciesLabels([species]).includes(pairedSpecies)&&
      method&&directoryMethodLabel(method)===pairedMethod;
    }))return null;
   }
   const exactFishery=isKnownFishery(filters.query);
   if(hasWater&&(hasSpecies||hasMethod||exactFishery)){
    const atWater=sourcedOfferings(entry).filter(item=>inJurisdiction(item,filters.state)&&item.relationship?.waterway===filters.advertisedWater);
    const tagMatch=entry.fishingTags?.some(value=>
     (hasSpecies&&directorySpeciesLabels([value]).includes(filters.species!))||
     (hasMethod&&sameMethod(value))||matchesFisherySearch(filters.query,[value])===true);
    if((atWater.length||tagMatch||hasMethod||knownDirectoryMethod(filters.query))&&!atWater.some(item=>{
     const {species,method,trip}=offeringFacets(item);
     const labels=[species,method,trip].filter((value):value is string=>Boolean(value));
     return (!hasSpecies||Boolean(species&&directorySpeciesLabels([species]).includes(filters.species!)))&&
      (!hasMethod||sameMethod(method))&&(!exactFishery||matchesFisherySearch(filters.query,labels,method?[method]:[])===true);
    }))return null;
   }
   const match=matchesFisherySearch(filters.query,[...facets.species,...facets.methods,...facets.trips],facets.methods);
   return match===null?guideSearchScore(entry,filters.query):match?30:null;
  }
  const match=sourcedOfferings(entry).some(item=>{
   if(!offeringPlaces(item).some(place=>normalizeGuideSearch(place)===portSearch.city)||
      !inJurisdiction(item,filters.state))return false;
   const {species,method,trip,waterway}=offeringFacets(item);
   const labels=[species,method,trip].filter((value):value is string=>Boolean(value));
   return matchesFisherySearch(portSearch.term,labels,method?[method]:[])===true&&
    (!hasSpecies||Boolean(species&&directorySpeciesLabels([species]).includes(filters.species!)))&&
    (!hasMethod||sameMethod(method))&&(!hasWater||filters.advertisedWater===waterway);
  });
  return match?30:null;
 };
 return entries.map(entry=>{
  const score=existingScore(entry);
  const trips=matchingCaptainTrips(entry,filters);
  if(!trips.length)return {entry,score};
  const captainScore=filters.query.trim()?guideSearchScore(entry,filters.query,true)??30:0;
  return {entry,score:score===null?captainScore:Math.min(score,captainScore)};
 })
  .filter((match):match is {entry:DirectoryEntry;score:number}=>match.score!==null)
  .sort((a,b)=>a.score-b.score||a.entry.name.localeCompare(b.entry.name,'en',{sensitivity:'base'})||a.entry.id.localeCompare(b.entry.id))
  .map(match=>match.entry);
}
