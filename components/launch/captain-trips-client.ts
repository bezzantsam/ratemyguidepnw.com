import type {TripPayload} from './CaptainTripFields';

export type OwnerTrips = {
  draft: TripPayload & {revision:number};
  proposal:{id:string;revision:number;status:'pending'|'approved'|'rejected';reason:string|null}|null;
  publishedVersion:number|null;
};

export class TripsError extends Error {
  constructor(readonly code:string){super(code);}
}

const strings=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(item=>typeof item==='string');
const row=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const textFields=(value:Record<string,unknown>,keys:string[])=>keys.every(key=>typeof value[key]==='string');

function draftShape(value:unknown):value is OwnerTrips['draft']{
  if(!row(value)||!Number.isSafeInteger(value.revision)||Number(value.revision)<0||
     !Array.isArray(value.vessels)||!Array.isArray(value.offerings))return false;
  return value.vessels.every(boat=>row(boat)&&textFields(boat,['id','label','type'])&&
      typeof boat.covered==='boolean'&&typeof boat.heated==='boolean'&&
      (boat.maxAnglers===null||Number.isInteger(boat.maxAnglers))&&strings(boat.fishCare))&&
    value.offerings.every(trip=>row(trip)&&textFields(trip,['id','title','waterway','launchArea'])&&
      (trip.jurisdiction==='OR'||trip.jurisdiction==='WA')&&strings(trip.species)&&
      strings(trip.methodIds)&&strings(trip.gearIds)&&Array.isArray(trip.months)&&trip.months.every(Number.isInteger)&&
      (trip.vesselId===null||typeof trip.vesselId==='string')&&
      ['call_to_confirm','per_seat','private_boat','both'].includes(String(trip.bookingStyle))&&
      ['unspecified','half_day','full_day','multi_day'].includes(String(trip.duration)));
}

function ownerState(value:unknown):OwnerTrips {
  const state=value as Partial<OwnerTrips>|null;
  if(!state||!draftShape(state.draft)||
    (state.publishedVersion!==null&&(!Number.isSafeInteger(state.publishedVersion)||Number(state.publishedVersion)<1))||
    (state.proposal!==null&&(!state.proposal||typeof state.proposal.id!=='string'||
      !Number.isSafeInteger(state.proposal.revision)||!['pending','approved','rejected'].includes(state.proposal.status)||
      (state.proposal.reason!==null&&typeof state.proposal.reason!=='string'))))
    throw new TripsError('service_unavailable');
  return state as OwnerTrips;
}

export function createCaptainTripsClient(sourceId:string,getToken:()=>Promise<string|null>){
  async function request(operation:'owner_get'|'owner_save'|'owner_submit',fields:Record<string,unknown>={}){
    const token=await getToken();
    if(!token)throw new TripsError('sign_in_required');
    const response=await fetch('/api/guide-offerings',{
      method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
      headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
      body:JSON.stringify({operation,jurisdiction:'OR',sourceId,...fields}),
    });
    const result=await response.json();
    if(!response.ok)throw new TripsError(typeof result?.error==='string'?result.error:'service_unavailable');
    return ownerState(result);
  }
  return {
    load:()=>request('owner_get'),
    async save(expectedRevision:number,draft:TripPayload){
      const state=await request('owner_save',{expectedRevision,draft});
      if(state.draft.revision!==expectedRevision+1)throw new TripsError('service_unavailable');
      return state;
    },
    async submit(expectedRevision:number){
      const state=await request('owner_submit',{expectedRevision});
      if(state.proposal?.revision!==expectedRevision)throw new TripsError('service_unavailable');
      return state;
    },
  };
}
