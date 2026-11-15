import markets from '../research/market-adapters.json';

/**
 * PRIVATE CONTRACT ONLY: no endpoint, no telemetry, no cookie or analytics service.
 * The project is not allowed to collect events until actual consent, abuse,
 * privacy and database launch gates have been reviewed.
 *
 * A submitted click is only unverified intent; never proof of a completed booking.
 */
export const EVENT_COLLECTION_ENABLED = false as const;

export const INTENT_EVENT_TYPES = [
  'directory_filter_applied',
  'guide_profile_viewed',
  'booking_referral_clicked',
] as const;

export type IntentEventType = (typeof INTENT_EVENT_TYPES)[number];
export type BookingDestination = 'website'|'booking_page'|'telephone';
export type FilterKind = 'corridor'|'waterway'|'species'|'month';

export type AcceptedIntentEvent = {
  version:1;
  market_id:string;
  event_type:IntentEventType;
  guide_id?:string;
  corridor_slug?:string;
  waterway_slug?:string;
  species_slug?:string;
  target_month?:number;
  filter_kind?:FilterKind;
  outbound_type?:BookingDestination;
};

const allowedKeys=new Set([
  'version','event_type','market_id','guide_id',
  'corridor_slug','waterway_slug','species_slug','target_month',
  'filter_kind','outbound_type',
]);
const knownTypes=new Set<string>(INTENT_EVENT_TYPES);
const outboundTypes=new Set(['website','booking_page','telephone']);
const filterKinds=new Set(['corridor','waterway','species','month']);
const regionSlug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const guideId=/^(?:OG\.\d{7}(?:\.[A-Za-z0-9&-]{1,12})?|wa-\d{3,})$/;

export class IntentEventContractError extends Error {
  constructor(message:string){super(message);this.name='IntentEventContractError';}
}

function isRecord(value:unknown):value is Record<string,unknown> {
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

function optionalSlug(input:Record<string,unknown>,field:string):string|undefined {
  const value=input[field];
  if(value===undefined)return undefined;
  if(typeof value!=='string'||value.length>64||!regionSlug.test(value))
    throw new IntentEventContractError('Invalid controlled '+field+'.');
  return value;
}

/**
 * A deliberately minimal, allowlisted event *shape* for future server intake.
 * Valid syntax is not consent, identity proof, an authorized actor or evidence
 * that this event genuinely happened; only protected server logic can establish
 * actual event provenance.
 */
export function validateIntentEventShape(value:unknown):AcceptedIntentEvent {
  if(!isRecord(value))throw new IntentEventContractError('Expected one event object.');
  if(Object.keys(value).length>10)
    throw new IntentEventContractError('Event payload is too large.');
  for(const key of Object.keys(value)){
    if(!allowedKeys.has(key))throw new IntentEventContractError('Unapproved event field: '+key);
  }
  if(value.version!==1)throw new IntentEventContractError('Unsupported event contract version.');
  if(typeof value.event_type!=='string'||!knownTypes.has(value.event_type))
    throw new IntentEventContractError('Unapproved event type.');
  if(typeof value.market_id!=='string'||
      !Object.prototype.hasOwnProperty.call(markets.markets,value.market_id))
    throw new IntentEventContractError('Unknown or unconfigured launch market.');

  const event_type=value.event_type as IntentEventType;
  const market_id=value.market_id;
  const result:AcceptedIntentEvent={version:1,event_type,market_id};
  const guide=value.guide_id;
  if(guide!==undefined){
    if(typeof guide!=='string'||guide.length>32||!guideId.test(guide))
      throw new IntentEventContractError('Invalid public guide ID format.');
    result.guide_id=guide;
  }
  const fields=['corridor_slug','waterway_slug','species_slug'] as const;
  for(const field of fields){
    const normalized=optionalSlug(value,field);
    if(normalized!==undefined)result[field]=normalized;
  }
  const month=value.target_month;
  if(month!==undefined){
    if(typeof month!=='number'||!Number.isInteger(month)||month<1||month>12)
      throw new IntentEventContractError('Invalid target month.');
    result.target_month=month;
  }
  if(value.filter_kind!==undefined){
    if(typeof value.filter_kind!=='string'||!filterKinds.has(value.filter_kind))
      throw new IntentEventContractError('Unrecognized filter kind.');
    result.filter_kind=value.filter_kind as FilterKind;
  }
  if(value.outbound_type!==undefined){
    if(typeof value.outbound_type!=='string'||!outboundTypes.has(value.outbound_type))
      throw new IntentEventContractError('Unrecognized outbound type.');
    result.outbound_type=value.outbound_type as BookingDestination;
  }

  if(event_type==='directory_filter_applied'){
    if(result.guide_id||result.outbound_type)
      throw new IntentEventContractError('Directory filters cannot contain guide or booking identity.');
    if(!result.filter_kind)throw new IntentEventContractError('Filter kind is required.');
    const matching={
      corridor:result.corridor_slug,
      waterway:result.waterway_slug,
      species:result.species_slug,
      month:result.target_month,
    }[result.filter_kind];
    if(matching===undefined)throw new IntentEventContractError('Filter value is required.');
  }
  if(event_type==='guide_profile_viewed'){
    if(!result.guide_id||result.outbound_type||result.filter_kind)
      throw new IntentEventContractError('Profile-view events require a public guide ID only.');
  }
  if(event_type==='booking_referral_clicked'){
    if(!result.guide_id||!result.outbound_type||result.filter_kind)
      throw new IntentEventContractError('Outbound referral requires a guide and allowed destination type.');
  }
  return result;
}
