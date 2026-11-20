import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../lib/public-guide-ratings.ts',import.meta.url),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText;
const or = {jurisdiction:'OR',sourceId:'OG.9999999.A&B'};
const empty = {jurisdiction:'OR',sourceId:'OG.9999998'};
const wa = {jurisdiction:'WA',sourceId:'wa-999'};
const signal = new AbortController().signal;

function api(reply) {
 const exports = {}, calls = [];
 runInNewContext(code,{exports,fetch:async (path,options)=>{
  calls.push({path,options});
  return reply;
 }});
 return {...exports,calls};
}

test('one public request binds summaries to exact, requested source identities',async()=>{
 const client = api({ok:true,json:async()=>({items:[
  {...or,count:2,averageQuality:4.25}, {...empty,count:0,averageQuality:null}, {...wa,count:5,averageQuality:5},
  {...or,sourceId:'OG.9999999',count:3,averageQuality:5},
 ]})});
 const summaries = await client.fetchPublicGuideRatings([or,empty,wa],signal);
 assert.equal(client.calls.length,1);
 const [{path,options}] = client.calls;
 assert.equal(path,'/api/launch');
 assert.equal(options.method,'POST');
 assert.equal(options.signal,signal);
 assert.equal(options.credentials,'same-origin');
 assert.equal(options.mode,'same-origin');
 assert.equal(options.redirect,'error');
 assert.equal(options.cache,'no-store');
 assert.deepEqual(Object.entries(options.headers),[['Content-Type','application/json']]);
 assert.deepEqual(JSON.parse(options.body),{operation:'public_review_summaries',guides:[or,empty,wa]});
 assert.equal(summaries.size,2);
 assert.equal(summaries.get(client.guideRatingKey(or)).averageQuality,4.25);
 assert.equal(summaries.get(client.guideRatingKey(empty)).count,0);
 assert.equal(summaries.has(client.guideRatingKey(wa)),false);
});

test('missing, invalid and duplicate summaries do not become visible ratings',async()=>{
 const missing = {jurisdiction:'OR',sourceId:'OG.9999997'};
 const client = api({ok:true,json:async()=>({items:[
  {...or,count:2,averageQuality:4.25},{...or,count:2,averageQuality:4},
  {...empty,count:1,averageQuality:null},
 ]})});
 assert.equal((await client.fetchPublicGuideRatings([or,empty,missing],signal)).size,0);
});

test('empty and oversized pages make no calls, and failures surface without per-guide fallback',async()=>{
 const client = api({ok:false});
 assert.equal((await client.fetchPublicGuideRatings([],signal)).size,0);
 await assert.rejects(client.fetchPublicGuideRatings(Array(31).fill(or),signal),/Too many guides/);
 assert.equal(client.calls.length,0);
 await assert.rejects(client.fetchPublicGuideRatings([or,wa],signal),/Ratings unavailable/);
 assert.equal(client.calls.length,1);
});
