import {validFishingSelection} from './captain-fishing/catalog.mjs';

type Jurisdiction = 'OR' | 'WA';
export type CaptainTripSource = {jurisdiction: Jurisdiction; sourceId: string};

export type CaptainTrip = {
  id: string;
  title: string;
  jurisdiction: Jurisdiction;
  waterway: string;
  launchArea: string;
  species: string[];
  months: number[];
  methodIds: string[];
  gearIds: string[];
  vesselId: string | null;
  duration: 'unspecified' | 'half_day' | 'full_day' | 'multi_day';
  bookingStyle: 'call_to_confirm' | 'per_seat' | 'private_boat' | 'both';
};

type Vessel = {id: string; label: string; type: string; covered: boolean; heated: boolean; maxAnglers: number | null; fishCare: string[]};
type PublishedCaptainTrips = CaptainTripSource & {
  publishedVersion: number;
  vessels: Vessel[];
  offerings: CaptainTrip[];
};

export const captainTripMonths = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'] as const;

export function captainTripKey({jurisdiction,sourceId}:CaptainTripSource):string {
  return `${jurisdiction}:${sourceId}`;
}

const object=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0&&value.length<=80;
const strings=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(text);
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
const vesselId=(value:unknown):value is string=>typeof value==='string'&&/^v[1-9]\d{0,3}$/.test(value);
const validSource=(jurisdiction:unknown,id:unknown):id is string=>typeof id==='string'&&
  (jurisdiction==='OR'?/^OG\.\d{7}(\.[A-Z0-9&]+)?$/.test(id):jurisdiction==='WA'&&/^wa-\d{3,9}$/.test(id));

function parseVessel(value:unknown):Vessel|null {
  if(!object(value))return null;
  const {id,label,type,covered,heated,maxAnglers,fishCare}=value;
  if(!vesselId(id)||!text(label)||!text(type)||typeof covered!=='boolean'||typeof heated!=='boolean'||
    !(maxAnglers===null||integer(maxAnglers))||!strings(fishCare))return null;
  return {id,label,type,covered,heated,maxAnglers,fishCare};
}

function parseTrip(value:unknown):CaptainTrip|null {
  if(!object(value))return null;
  const {id,title,jurisdiction,waterway,launchArea,species,months,methodIds,gearIds,vesselId:boat,duration,bookingStyle}=value;
  if(typeof id!=='string'||!/^p[1-9]\d{0,3}$/.test(id)||!text(title)||(jurisdiction!=='OR'&&jurisdiction!=='WA')||
    !text(waterway)||!text(launchArea)||!strings(species)||!species.length||!Array.isArray(months)||
    !months.every(month=>integer(month)&&month<=12)||!strings(methodIds)||!strings(gearIds)||
    !validFishingSelection(methodIds,gearIds)||!(boat===null||vesselId(boat))||
    (duration!=='unspecified'&&duration!=='half_day'&&duration!=='full_day'&&duration!=='multi_day')||
    (bookingStyle!=='call_to_confirm'&&bookingStyle!=='per_seat'&&bookingStyle!=='private_boat'&&bookingStyle!=='both'))return null;
  return {id,title,jurisdiction,waterway,launchArea,species,months,methodIds,gearIds,vesselId:boat,duration,bookingStyle};
}

function parsePublished(value:unknown):PublishedCaptainTrips {
  if(!object(value))throw new Error('Invalid public trip projection');
  const {jurisdiction,sourceId,publishedVersion,attribution,vessels,offerings}=value;
  if((jurisdiction!=='OR'&&jurisdiction!=='WA')||!validSource(jurisdiction,sourceId)||!integer(publishedVersion)||
    attribution!=='captain_declared'||!Array.isArray(vessels)||vessels.length>4||
    !Array.isArray(offerings)||offerings.length>8)throw new Error('Invalid public trip projection');
  const boats=vessels.map(parseVessel),trips=offerings.map(parseTrip);
  if(!boats.every(boat=>boat!==null)||!trips.every(trip=>trip!==null)||
    new Set(boats.map(boat=>boat.id)).size!==boats.length||new Set(trips.map(trip=>trip.id)).size!==trips.length||
    trips.some(trip=>trip.vesselId!==null&&!boats.some(boat=>boat.id===trip.vesselId)))throw new Error('Invalid public trip projection');
  return {jurisdiction,sourceId,publishedVersion,vessels:boats,offerings:trips};
}

async function readPublicTrips(body:object,signal:AbortSignal):Promise<unknown> {
  const response=await fetch('/api/guide-offerings',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
    credentials:'omit',cache:'no-store',signal,
  });
  if(!response.ok)throw new Error('Public trips unavailable');
  return response.json();
}

export async function fetchCaptainTripsForProfile(source:CaptainTripSource,signal:AbortSignal) {
  const data=await readPublicTrips({operation:'public_profile',...source},signal);
  if(!object(data))throw new Error('Invalid public trip response');
  if(data.profile===null)return null;
  const profile=parsePublished(data.profile);
  if(captainTripKey(profile)!==captainTripKey(source))throw new Error('Mismatched public trip profile');
  return profile;
}

const batchSize=100;
const maxBatchPages=16;

export async function fetchCaptainTripsForDirectory(signal:AbortSignal):Promise<Map<string,CaptainTrip[]>> {
  const profiles=new Map<string,CaptainTrip[]>();
  let cursor:string|null=null;
  const seen=new Set<string>();
  for(let page=0;page<maxBatchPages;page++){
    const result=await readPublicTrips({operation:'public_batch',afterSourceId:cursor,limit:batchSize},signal);
    if(!object(result)||!Array.isArray(result.items)||result.items.length>batchSize)throw new Error('Invalid public trip batch');
    for(const item of result.items){
      const profile=parsePublished(item),key=captainTripKey(profile);
      if(profiles.has(key))throw new Error('Duplicate public trip profile');
      profiles.set(key,profile.offerings);
    }
    if(result.nextCursor===null)return profiles;
    if(!text(result.nextCursor)||seen.has(result.nextCursor)||!result.items.length)throw new Error('Invalid public trip cursor');
    seen.add(result.nextCursor);
    cursor=result.nextCursor;
  }
  throw new Error('Public trip batch exceeded its maximum size');
}
