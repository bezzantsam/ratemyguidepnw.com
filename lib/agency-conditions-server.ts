import {
  WATERWAY_SOURCES,WATERWAY_CACHE_SECONDS,OBSERVATION_STALE_AFTER_MINUTES,
  type WaterwaySourceKey,
} from './waterway-sources';

/**
 * SERVER-ONLY adapters: call only from trusted server code.
 * No live page is wired to this module yet. Use Next's shared fetch revalidation
 * rather than one government API request per visitor. No credentials or tracking.
 */
export type AgencyCondition={
  sourceKey:WaterwaySourceKey;
  agency:'USGS'|'NOAA';
  stationId:string;
  label:string;
  sourceUrl:string;
  status:'available'|'stale'|'unavailable';
  sourceType:'observation'|'astronomical_prediction';
  fetchedAt:string;
  values:readonly {
    metric:string;
    value:number;
    unit:string;
    sourceTime:string;
    quality:string;
  }[];
  caveat:string;
};

const USGS_CODES:Record<string,{metric:string;unit:string}>={
  '00060':{metric:'Discharge',unit:'cfs'},
  '00065':{metric:'Gage height',unit:'ft'},
  '00010':{metric:'Water temperature',unit:'°C'},
};
function record(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function validNumber(value:unknown):number|null{
  if(typeof value!=='string'&&typeof value!=='number')return null;
  if(typeof value==='string'&&!value.trim())return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:null;
}
function safeIsoTime(value:unknown):string|null{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value))return null;
  const t=Date.parse(value);
  return Number.isFinite(t)&&/(Z|[+-]\d{2}:\d{2})$/.test(value)?value:null;
}
function base(key:WaterwaySourceKey,fetchedAt:string):AgencyCondition{
  const src=WATERWAY_SOURCES[key];
  return{
    sourceKey:key,agency:src.agency,stationId:src.stationId,
    label:src.label,sourceUrl:src.sourceUrl,
    fetchedAt,sourceType:src.kind==='tides'?'astronomical_prediction':'observation',
    status:'unavailable',values:[],
    caveat:src.kind==='tides'
      ?'Astronomical predicted heights are NOT slack-current times, actual water levels, river-discharge effects or wind surge.'
      :'USGS observations may be provisional, missing, delayed or later revised. This is not a fishing-quality prediction.',
  };
}
function keyHasKind(key:WaterwaySourceKey,kind:'river'|'tides'){
  if(WATERWAY_SOURCES[key].kind!==kind)throw new Error('Source kind mismatch.');
}
/** Parse modern USGS OGC latest-continuous GeoJSON with source timestamps. */
export function parseUsgsObservation(
  key:WaterwaySourceKey,payload:unknown,
  fetchedAt:string
):AgencyCondition{
  keyHasKind(key,'river');
  const output=base(key,fetchedAt);
  const now=Date.parse(fetchedAt);
  if(!Number.isFinite(now))throw new Error('Invalid fetch timestamp.');
  // USGS latest-continuous OGC API v1 returns GeoJSON FeatureCollection.
  // Each feature properties includes monitoring_location_id, parameter_code,
  // time, value, approval_status and unit_of_measure; no old NWIS timeSeries.
  if(!record(payload)||payload.type!=='FeatureCollection'||!Array.isArray(payload.features))return output;
  const chosen=new Map<string,AgencyCondition['values'][number]>();
  for(const feature of payload.features){
    if(!record(feature)||!record(feature.properties))continue;
    const p=feature.properties;
    if(p.monitoring_location_id!=='USGS-'+output.stationId)continue;
    if(typeof p.parameter_code!=='string'||
       !Object.prototype.hasOwnProperty.call(USGS_CODES,p.parameter_code))continue;
    const metric=USGS_CODES[p.parameter_code];
    const value=validNumber(p.value),sourceTime=safeIsoTime(p.time);
    if(value===null||sourceTime===null)continue;
    const pointAt=Date.parse(sourceTime);
    if(pointAt>now+5*60000)continue;
    // Verify canonical units rather than silently labeling a converted unit.
    const officialUnit=String(p.unit_of_measure??'').trim();
    if(!officialUnit)continue;
    const validUnits=metric.metric==='Discharge'
      ?['ft^3/s','ft3/s','cfs']
      :metric.metric==='Gage height'?['ft','feet']
      :['degC','deg C','°C','C','degree Celsius'];
    if(!validUnits.includes(officialUnit))continue;
    const existing=chosen.get(p.parameter_code);
    if(existing&&Date.parse(existing.sourceTime)>=pointAt)continue;
    chosen.set(p.parameter_code,{
      metric:metric.metric,value,unit:metric.unit,sourceTime,
      quality:typeof p.approval_status==='string'&&p.approval_status.trim()
        ?p.approval_status.trim():'Unspecified',
    });
  }
  const values=[...chosen.values()];
  const fresh=values.filter(p=>now-Date.parse(p.sourceTime)<=OBSERVATION_STALE_AFTER_MINUTES*60000);
  return{
    ...output,values,
    status:values.length===0?'unavailable':fresh.length===values.length?'available':'stale',
  };
}
/** NOAA pred high/low are predicted tide heights, NEVER current slack times. */
export function parseNoaaPredictions(
  key:WaterwaySourceKey,payload:unknown,
  fetchedAt:string
):AgencyCondition{
  keyHasKind(key,'tides');
  const output=base(key,fetchedAt);
  if(!record(payload)||!Array.isArray(payload.predictions))return output;
  const values:AgencyCondition['values'][number][]=[];
  for(const raw of payload.predictions){
    if(!record(raw))continue;
    const value=Number(raw.v);
    if(typeof raw.v!=='string'||!raw.v.trim()||!Number.isFinite(value))continue;
    if(raw.type!=='H'&&raw.type!=='L')continue;
    // NOAA lst_ldt time is intentionally kept as a *station-local string*.
    // Do not append Z or infer UTC: DST transitions would otherwise be wrong.
    if(typeof raw.t!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw.t))continue;
    values.push({
      metric:raw.type==='H'?'Predicted high tide':'Predicted low tide',
      value,unit:'ft above MLLW',sourceTime:raw.t+' (station local time)',
      quality:'NOAA astronomical prediction',
    });
  }
  values.sort((a,b)=>a.sourceTime.localeCompare(b.sourceTime));
  return {...output,status:values.length?'available':'unavailable',values};
}
export function agencyRequestUrl(key:WaterwaySourceKey):string{
  const src=WATERWAY_SOURCES[key];
  if(src.kind==='river'){
    const query=new URLSearchParams({
      monitoring_location_id:'USGS-'+src.stationId,
      f:'json',
      limit:'100',
    });
    return 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items?'+query.toString();
  }
  const query=new URLSearchParams({
    station:src.stationId,product:'predictions',date:'today',
    datum:'MLLW',time_zone:'lst_ldt',units:'english',interval:'hilo',
    format:'json',application:'RateMyGuidePNW',
  });
  return 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?'+query.toString();
}
/**
 * Caller should provide one already-determined UTC time; no per-user identity.
 * No live automatic execution, no secrets; rate limits still apply upstream.
 */
export async function getAgencyConditions(
  key:WaterwaySourceKey,
  fetchedAt=new Date().toISOString()
):Promise<AgencyCondition>{
  if(!Object.prototype.hasOwnProperty.call(WATERWAY_SOURCES,key))
    throw new Error('Unapproved station.');
  const result=base(key,fetchedAt);
  try{
    const response=await fetch(agencyRequestUrl(key),{
      headers:{Accept:'application/json'},
      next:{revalidate:WATERWAY_CACHE_SECONDS},
    });
    if(!response.ok)return result;
    const body:unknown=await response.json();
    return WATERWAY_SOURCES[key].kind==='river'
      ?parseUsgsObservation(key,body,fetchedAt)
      :parseNoaaPredictions(key,body,fetchedAt);
  }catch{return result}
}
