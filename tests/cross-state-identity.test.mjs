import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const requireNode=createRequire(import.meta.url);
function load(path,deps={}){
 const exports={};
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,URL,URLSearchParams,Date,Set,Map,process:{env:{}},require:name=>Object.hasOwn(deps,name)?deps[name]:requireNode(name)});
 return exports;
}
const research=load('lib/washington-reconciled.ts');
const editorial=load('lib/editorial-guide-corrections.ts',{'./editorial-guide-corrections.json':JSON.parse(readFileSync('lib/editorial-guide-corrections.json','utf8'))});
const {filterDirectoryEntries}=load('lib/directory-query.ts');
const washingtonFilter={state:'Washington',sourceZone:'All areas',advertisedWater:'All advertised waters',query:'Synthetic Captain'};
const waSource={name:'Synthetic Captain',business:'Fixture Outfit',source:'Fixture directory',notes:null};
const other={...waSource,business:'Different Outfit',source:'Other source'};
const norm=s=>(s||'').trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const key=row=>JSON.stringify([norm(row.name),norm(row.business),norm(row.source)]);
const registration='OG.9999000';
const candidate={id:'or-fixture',name:'Synthetic Captain',oregonRegistration:registration,washingtonSources:[]};
const approval={oregonRegistration:registration,washingtonSourceKey:key(waSource),status:'approved',evidence:{url:'https://fixture.invalid/identity',locator:'synthetic identity evidence',reviewer:'Fixture reviewer',reviewedOn:'2020-01-02'}};
const orGuide={registration,name:'Synthetic Captain',business:'Fixture Outfit',areas:[],activity:'Fishing',sourceStatus:'ACTIVE'};
function fixture(decisions){
 const rec={...research,reconciledWashingtonCaptains:[candidate],identityLinkDecisions:decisions,unresolvedWashingtonSourceHolds:[]};
 const wa=load('lib/washington.ts',{'./washington-raw.json':[waSource,other],'./washington-stable-ids.json':{[key(waSource)]:'wa-900',[key(other)]:'wa-901'},'./washington-reconciled':rec});
 const directory=load('lib/directory.ts',{
  './registry':{oregonGuides:[orGuide],guideSlug:g=>g.registration.toLowerCase().replace(/[^a-z0-9]+/g,'-')},
  './washington':wa,'./guide-enrichment':{advertisedWaterwayNames:()=>[],guideSearchTerms:()=>[]},'./guide-attributes-server':{attributesFor:()=>[]},'./editorial-guide-corrections':editorial
 });
 return {wa,directory};
}
const stub=()=>null;
const Link=({href,children})=>React.createElement('a',{href:typeof href==='string'?href:href.pathname},children);
async function renderPages(wa){
 const waPage=load('app/washington/page.tsx',{'next/link':Link,'@/components/WashingtonSearch':stub,'@/lib/washington':wa});
 const profile=load('app/guides/[slug]/page.tsx',{
  'next/link':Link,'next/navigation':{notFound:()=>{throw Error('unexpected notFound')}},
  '@/lib/registry':{findGuide:()=>orGuide,guideSlug:()=> 'og-9999000',oregonGuides:[orGuide]},'@/lib/washington':wa,
  '@/components/ReturnToResults':stub,'@/components/GuideEnrichmentPanel':stub,'@/components/CaptainDetails':stub,
  '@/components/CaptainReviews':stub,'@/components/CaptainMedia':stub,'@/components/GuideTrustPanel':stub,
  '@/components/launch/ProfileSharing':{ProfileSharing:stub},'@/components/launch/AuthCheck':{AuthCheck:()=>null},'@/components/launch/GuideEngagement':{GuideEngagement:stub},'@/lib/canonical-share':{profileShareMetadata:()=>({})}
 });
 return {wa:renderToStaticMarkup(React.createElement(waPage.default)),profile:renderToStaticMarkup(await profile.default({params:Promise.resolve({slug:'og-9999000'})}))};
}

test('missing, pending, ambiguous, rejected, malformed and conflicting decisions fail closed',()=>{
 for(const decisions of [[],[{...approval,status:'pending'}],[{...approval,status:'ambiguous'}],[{...approval,status:'rejected'}],[{...approval,evidence:{...approval.evidence,reviewer:''}}],[approval,{...approval,status:'rejected'}],[approval,{...approval,oregonRegistration:'OG.9999001',status:'pending'}],[approval,{...approval,washingtonSourceKey:key(other),status:'pending'}]]){
  const {wa,directory}=fixture(decisions);
  assert.equal(wa.oregonWashingtonMatches.length,0);
  assert.equal(wa.washingtonGuides.length,2);
  assert.equal(wa.washingtonRecordForOregon(registration),undefined);
  assert.deepEqual(Array.from(directory.directoryEntries[0].states),['Oregon']);
  assert.deepEqual(Array.from(filterDirectoryEntries(directory.directoryEntries,washingtonFilter),x=>x.id),['wa-900','wa-901']);
 }
 assert.equal(research.approvedIdentityLinks([{...approval,washingtonSourceKey:'["bad"]'}]).length,0);
});

test('synthetic reviewed link governs search, badge, profile and exact source suppression while preserving URLs',async()=>{
 const {wa,directory}=fixture([approval]);
 assert.equal(wa.oregonWashingtonMatches.length,1);
 assert.equal(wa.washingtonRecordForOregon(registration).source.business,'Fixture Outfit');
 assert.deepEqual(Array.from(directory.directoryEntries[0].states),['Oregon','Washington']);
 assert.deepEqual(Array.from(wa.washingtonGuides,x=>x.id),['wa-901']);
 assert.deepEqual(Array.from(directory.directoryEntries,x=>x.id),[registration,'wa-901']);
 assert.deepEqual(Array.from(filterDirectoryEntries(directory.directoryEntries,washingtonFilter),x=>x.id),[registration,'wa-901']);
 assert.equal(wa.washingtonGuide('wa-900').business,'Fixture Outfit');
 assert.equal(wa.washingtonGuide('wa-901').business,'Different Outfit');
 const html=await renderPages(wa);
 assert.match(html.profile,/Also listed in Washington/);
 assert.match(html.profile,/Fixture directory/);
 assert.match(html.wa,/Reviewed cross-state links/);
 assert.match(html.wa,/\/guides\/og-9999000/);
});

test('unresolved real research has no state badge or cross-state claim in rendered pages',async()=>{
 const {wa,directory}=fixture([]);
 const html=await renderPages(wa);
 assert.doesNotMatch(html.profile,/Also listed in Washington|matching listing|single captain profile/);
 assert.doesNotMatch(html.wa,/Reviewed cross-state links|Oregon \+ Washington source listings/);
 assert.deepEqual(Array.from(directory.directoryEntries[0].states),['Oregon']);
 assert.equal(research.identityLinkDecisions.length,0);
 assert.equal(research.reconciledWashingtonCaptains.filter(x=>x.oregonRegistration).length,7);
});

test('source keys and research endpoints must be unique and known before an approval is used',()=>{
 const {wa}=fixture([]);
 assert.equal(wa.resolveWashingtonLinks([waSource,waSource],[approval],[candidate]).length,0);
 assert.equal(wa.resolveWashingtonLinks([other],[approval],[candidate]).length,0);
 assert.equal(wa.resolveWashingtonLinks([waSource],[approval],[]).length,0);
 assert.equal(wa.resolveWashingtonLinks([waSource],[approval],[candidate,candidate]).length,0);
 assert.throws(()=>wa.mapWashingtonGuides([waSource,waSource]),/Duplicate Washington source identity key/);
});

test('every previously suppressed source is an explicit hold with an unused proposed ID',()=>{
 const rows=JSON.parse(readFileSync('lib/washington-raw.json','utf8'));
 const allocated=JSON.parse(readFileSync('lib/washington-stable-ids.json','utf8'));
 const holds=research.unresolvedWashingtonSourceHolds;
 const keys=rows.map(key),ids=new Set(Object.values(allocated));
 assert.equal(holds.length,5);
 assert.equal(new Set(Array.from(holds,x=>x.key)).size,5);
 assert.equal(new Set(Array.from(holds,x=>x.proposedId)).size,5);
 for(const hold of holds){
  assert.equal(keys.filter(k=>k===hold.key).length,1);
  assert.equal(allocated[hold.key],undefined);
  assert.equal(ids.has(hold.proposedId),false);
  assert.ok(Number(hold.proposedId.slice(3))>157);
 }
 assert.equal(rows.length,Object.keys(allocated).length+holds.length);
});
