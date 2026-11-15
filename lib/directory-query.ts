import type {DirectoryEntry} from './directory';

export type DirectoryFilters={state:string;sourceZone:string;advertisedWater:string;query:string};

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
  .replace(/['’]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
const nicknameLookup=new Map(nicknameFamilies.flatMap(group=>group.map(name=>[name,group] as const)));
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
 const identity=[entry.name,entry.business??'',...entry.searchAliases,...(entry.crew??[]).map(member=>member.name)].map(normalizeGuideSearch).filter(Boolean);
 const context=[...entry.areas,...entry.advertisedWaters].map(normalizeGuideSearch).filter(Boolean);
 index={identity,context,tokens:[...new Set(identity.flatMap(value=>value.split(' ')))],contextTokens:[...new Set(context.flatMap(value=>value.split(' ')))],firstName:normalizeGuideSearch(entry.name).split(' ')[0],id:entry.id.toLowerCase()};
 cache.set(entry,index);return index;
}
/** Lower scores mean closer matches. Null means at least one query term is unsupported. */
export function guideSearchScore(entry:DirectoryEntry,query:string):number|null {
 const raw=query.trim().toLowerCase();if(!raw)return 0;
 const index=indexFor(entry);
 // Registration/WA IDs must never be silently corrected to another identity.
 if(/^(og[.\s-]?\d|wa[.\s-]?\d)/i.test(raw))return index.id===raw?0:index.id.startsWith(raw)?1:null;
 const needle=normalizeGuideSearch(raw);if(!needle)return null;
 if(index.identity.includes(needle))return 0;
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
  else if(index.contextTokens.includes(term))cost=3;
  else if(index.contextTokens.some(token=>token.startsWith(term)))cost=4;
  else if(term.length>=4){
   const distance=term.length>=7?2:1;
   if(index.tokens.some(token=>token.length>=4&&closeSpelling(term,token,distance)))cost=5;
   else if(index.contextTokens.some(token=>token.length>=4&&closeSpelling(term,token,distance)))cost=6;
  }
  if(cost===null)return null;
  worst=Math.max(worst,cost);total+=cost;
 }
 return 10+worst*10+total/terms.length;
}

/** Exact filters stay exact; fuzzy text matches never expand fisheries or merge identities. */
export function filterDirectoryEntries(entries:DirectoryEntry[],filters:DirectoryFilters):DirectoryEntry[]{
 return entries.filter(entry=>
  (filters.state==='All'||entry.states.includes(filters.state as 'Oregon'|'Washington'))&&
  (filters.sourceZone==='All areas'||entry.areas.includes(filters.sourceZone))&&
  (filters.advertisedWater==='All advertised waters'||entry.advertisedWaters.includes(filters.advertisedWater))
 ).map(entry=>({entry,score:guideSearchScore(entry,filters.query)}))
  .filter((match):match is {entry:DirectoryEntry;score:number}=>match.score!==null)
  .sort((a,b)=>a.score-b.score||a.entry.name.localeCompare(b.entry.name,'en',{sensitivity:'base'})||a.entry.id.localeCompare(b.entry.id))
  .map(match=>match.entry);
}
