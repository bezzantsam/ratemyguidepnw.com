import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=p=>readFileSync(p,'utf8');
function transpile(path,imports={}){
 const js=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};
 vm.runInNewContext(js,{exports,URLSearchParams,URL,Date,fetch:async()=>{throw Error('offline network forbidden')},
   require:name=>{if(imports[name])return imports[name];throw Error('unexpected import '+name)}});
 return exports;
}
const sources=transpile('lib/waterway-sources.ts');
const adapter=transpile('lib/agency-conditions-server.ts',{'./waterway-sources':sources});
const now='2026-11-13T20:00:00Z';
const property=(overrides={})=>({
 monitoring_location_id:'USGS-14301500',parameter_code:'00060',time:'2026-11-13T19:45:00Z',
 value:'0',unit_of_measure:'ft^3/s',approval_status:'Provisional',...overrides
});
const feature=(props)=>({type:'Feature',properties:props});
const usgs=(...values)=>({type:'FeatureCollection',features:values.map(v=>feature(v))});

test('configured sources are four verified agency IDs and Kalama is not invented as live',()=>{
 assert.equal(Object.keys(sources.WATERWAY_SOURCES).length,4);
 assert.equal(sources.WATERWAY_SOURCES['wilson-river'].stationId,'14301500');
 assert.equal(sources.WATERWAY_SOURCES['cowlitz-river'].stationId,'14243000');
 assert.equal(sources.WATERWAY_SOURCES['astoria-tides'].stationId,'9439040');
 assert.equal(sources.WATERWAY_SOURCES['garibaldi-tides'].stationId,'9437540');
 assert.match(sources.WATERWAY_EXCLUDED_SOURCES['kalama-river'],/NOT live/);
});

test('modern USGS adapter uses latest-continuous v1, not retiring NWIS',()=>{
 const url=adapter.agencyRequestUrl('wilson-river');
 assert.match(url,/api\.waterdata\.usgs\.gov\/ogcapi\/v1\/collections\/latest-continuous\/items/);
 assert.match(url,/monitoring_location_id=USGS-14301500/);
 assert.doesNotMatch(url,/waterservices\.usgs\.gov|nwis\/iv/);
 const noaa=adapter.agencyRequestUrl('astoria-tides');
 assert.match(noaa,/product=predictions/);
 assert.match(noaa,/interval=hilo/);
 assert.match(noaa,/station=9439040/);
 assert.match(noaa,/time_zone=lst_ldt/);
 assert.equal(sources.WATERWAY_CACHE_SECONDS,1800);
});

test('zero is a valid agency observation and never replaced with missing',()=>{
 const value=adapter.parseUsgsObservation('wilson-river',usgs(property()),now);
 assert.equal(value.status,'available');
 assert.equal(value.values.length,1);
 assert.equal(value.values[0].value,0);
 assert.equal(value.values[0].quality,'Provisional');
 assert.equal(value.values[0].unit,'cfs');
});

test('fresher observations of same metric win, different metrics remain distinct',()=>{
 const result=adapter.parseUsgsObservation('wilson-river',usgs(
  property({value:'200',time:'2026-11-13T19:00:00Z'}),
  property({value:'250',time:'2026-11-13T19:50:00Z'}),
  property({parameter_code:'00065',unit_of_measure:'ft',value:'6.8'}),
  property({parameter_code:'00010',unit_of_measure:'degC',value:'10.4'})
 ),now);
 assert.equal(result.status,'available');
 assert.equal(result.values.length,3);
 assert.equal(result.values.find(x=>x.metric==='Discharge').value,250);
 assert.equal(result.values.find(x=>x.metric==='Gage height').unit,'ft');
 assert.equal(result.values.find(x=>x.metric==='Water temperature').unit,'°C');
});

test('rejects wrong USGS station, invalid units, future dates and nonexistent values',()=>{
 const data=usgs(
  property({monitoring_location_id:'USGS-99999999'}),
  property({value:'-999999'}),
  property({value:'NaN'}),
  property({unit_of_measure:'m^3/s'}),
  property({time:'2026-11-14T08:00:00Z'}),
  property({time:'2026-11-13T19:40:00',value:'230'})
 );
 const result=adapter.parseUsgsObservation('wilson-river',data,now);
 assert.equal(result.status,'unavailable');
 assert.equal(result.values.length,0);
});

test('stale measurements are clearly stale rather than current conditions',()=>{
 const result=adapter.parseUsgsObservation('wilson-river',
  usgs(property({value:'100',time:'2026-11-12T10:00:00Z'})),now);
 assert.equal(result.status,'stale');
 assert.equal(result.values[0].value,100);
 assert.match(result.caveat,/provisional/);
});

test('missing, malformed and error payloads are unavailable, not a zero reading',()=>{
 for(const value of [null,{},[],{features:[]},{type:'FeatureCollection',features:[{}]}]){
  const result=adapter.parseUsgsObservation('wilson-river',value,now);
  assert.equal(result.status,'unavailable');
  assert.equal(result.values.length,0);
 }
});

test('NOAA high and low are predictions, never observed current or slack times',()=>{
 const result=adapter.parseNoaaPredictions('astoria-tides',{
  predictions:[
   {t:'2026-11-13 08:52',v:'8.2',type:'H'},
   {t:'2026-11-13 15:12',v:'-0.7',type:'L'},
   {t:'bad',v:'4.3',type:'H'},
   {t:'2026-11-13 17:00',v:'',type:'H'},
  ]
 },now);
 assert.equal(result.sourceType,'astronomical_prediction');
 assert.equal(result.status,'available');
 assert.equal(result.values.length,2);
 assert.equal(result.values[0].value,8.2);
 assert.equal(result.values[1].value,-0.7);
 assert.match(result.values[0].sourceTime,/station local time/);
 assert.match(result.caveat,/NOT slack-current times/);
 assert.match(result.caveat,/wind surge/);
});

test('waterway module requires a known source and never issues network requests in tests',()=>{
 assert.throws(()=>adapter.agencyRequestUrl('kalama-river'),/Cannot read properties|undefined/);
 assert.doesNotMatch(read('lib/agency-conditions-server.ts'),/supabase|sendBeacon|navigator|localStorage|cookie/i);
 const doc=read('docs/MY_WATERWAYS_SOURCE_FOUNDATION.md');
 assert.match(doc,/not live/i);
 assert.match(doc,/stale/i);
 assert.match(doc,/modern USGS/i);
 assert.match(doc,/NOAA/i);
});
