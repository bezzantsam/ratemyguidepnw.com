import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ROUTES,runSmoke,validateTarget} from '../scripts/read-only-launch-smoke.mjs';
const bodyFor=r=>`<!doctype html><html><body><main><h1>${r.text||'Not found'}</h1></main></body></html>`;
const fakeFetch=(change=()=>{})=>async(url,options)=>{
  const route=ROUTES.find(r=>r.path===url.pathname); assert.ok(route);
  assert.equal(options.method,'GET'); assert.equal(options.redirect,'manual'); assert.equal(options.credentials,'omit');
  const fixture={body:bodyFor(route),status:route.status,headers:{'content-type':'text/html; charset=utf-8'}};
  change(fixture,route); return new Response(fixture.body,fixture);
};
const fakeRun=change=>runSmoke('http://127.0.0.1:9999',{fetchImpl:fakeFetch(change)});

test('target requires explicit origin and remote opt-in',()=>{
  assert.equal(validateTarget('http://127.0.0.1:3000'),'http://127.0.0.1:3000');
  assert.equal(validateTarget('http://[::1]:3000'),'http://[::1]:3000');
  assert.throws(()=>validateTarget('https://ratemyguidepnw.com'),/allow-remote/);
  assert.throws(()=>validateTarget('http://ratemyguidepnw.com',true),/HTTPS/);
  assert.equal(validateTarget('https://ratemyguidepnw.com',true),'https://ratemyguidepnw.com');
  for(const value of ['not a URL','https://user:secret@example.com','https://example.com/?token=secret','https://example.com/#secret','https://example.com/guides','file:///tmp/site']) assert.throws(()=>validateTarget(value,true));
});
test('positive fixture exercises every declared route and only GET',async()=>{
  const result=await fakeRun(); assert.equal(result.passed,true); assert.equal(result.results.length,7);
  assert.ok(result.results.every(r=>r.method==='GET')); assert.ok(result.limitations.length>=4);
});
test('complete expected page must be present, not just HTTP 200',async()=>{
  const report=await fakeRun(f=>{f.body='<html><main>Sign in to continue</main></html>';f.status=200});
  assert.equal(report.passed,false); assert.ok(report.results[0].failures.includes('missing_expected_content'));
});
test('a research link on the homepage is rejected',async()=>{
  const report=await fakeRun((f,r)=>{if(r.path==='/')f.body=f.body.replace('</main>','<a href="/intel/buoy-10-chinook">Research</a></main>')});
  assert.equal(report.passed,false);assert.ok(report.results[0].failures.includes('research_promotion_in_directory'));
});
test('unsupported identity and fixture markers are rejected',async()=>{
  for(const marker of ['Shared captains appear once','Pending Secret Species','__editorial_visual__','rc-secret-canary-27f7bf9015']) {
    const report=await fakeRun((f,r)=>{if(r.path==='/guides')f.body+=`<script>${marker}</script>`});
    assert.equal(report.passed,false);assert.ok(report.results[1].failures.includes('forbidden_public_marker'));
  }
});
test('script/comment/template-only expected content cannot pass',async()=>{
  for(const wrapper of [s=>`<script>${s}</script>`,s=>`<!--${s}-->`,s=>`<template>${s}</template>`]) {
    const report=await fakeRun((f,r)=>{if(r.path==='/')f.body=`<html><main>Login</main>${wrapper(r.text)}</html>`});
    assert.equal(report.passed,false);assert.ok(report.results[0].failures.includes('missing_expected_content'));
  }
});
test('submission controls are rejected on unavailable routes',async()=>{
  const report=await fakeRun((f,r)=>{if(r.unavailable)f.body=f.body.replace('</main>','<form><input name="review"></form></main>')});
  assert.ok(report.results.filter(r=>r.failures.includes('unexpected_submission_control')).length===3);
});
test('unexpected redirects are not followed or accepted',async()=>{
  const report=await fakeRun(f=>{f.status=302;f.headers.location='https://example.com/?token=do-not-log'});
  assert.equal(report.passed,false);assert.ok(report.results.every(r=>r.failures.includes('unexpected_status')));
  assert.ok(!JSON.stringify(report).includes('do-not-log'));
});
test('non-HTML payloads fail even with matching text',async()=>{
  const report=await fakeRun(f=>{f.headers['content-type']='application/json'});
  assert.equal(report.passed,false);assert.ok(report.results.every(r=>r.failures.includes('unexpected_content_type')));
});
test('oversized bodies are bounded even without a content length',async()=>{
  const report=await runSmoke('http://127.0.0.1:9999',{maxBytes:64,fetchImpl:fakeFetch(f=>{f.body='x'.repeat(1000)})});
  assert.equal(report.passed,false);assert.ok(report.results.every(r=>r.failures.includes('response_too_large')));
});
test('declared oversized content is refused',async()=>{
  const report=await fakeRun(f=>{f.headers['content-length']='999999999'});
  assert.equal(report.passed,false);assert.ok(report.results.every(r=>r.failures.includes('response_too_large')));
});
test('errors are sanitized and never counted as permission denials',async()=>{
  const report=await runSmoke('http://127.0.0.1:9999',{fetchImpl:async()=>{throw new Error('https://secret/?token=PRIVATE')}});
  assert.equal(report.passed,false);assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  assert.ok(report.results.every(r=>r.failures.includes('request_failed')));
});
test('invalid resource limits are rejected',async()=>{
  for(const timeoutMs of [0,-1,60001,1.5]) await assert.rejects(()=>runSmoke('http://127.0.0.1',{timeoutMs}),/timeoutMs/);
  for(const maxBytes of [0,4194305]) await assert.rejects(()=>runSmoke('http://127.0.0.1',{maxBytes}),/maxBytes/);
});

async function withServer(t,handler) {
  const methods=[];const server=createServer((req,res)=>{methods.push(req.method);handler(req,res)});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
  return {origin:`http://127.0.0.1:${server.address().port}`,methods};
}
test('real loopback HTTP positive and error cases use no write methods',async t=>{
  let broken=false;
  const {origin,methods}=await withServer(t,(req,res)=>{
    const r=ROUTES.find(r=>r.path===req.url);res.writeHead(broken?503:r.status,{'content-type':'text/html'});res.end(bodyFor(r));
  });
  assert.equal((await runSmoke(origin)).passed,true);broken=true;assert.equal((await runSmoke(origin)).passed,false);
  assert.equal(methods.length,14);assert.ok(methods.every(m=>m==='GET'));
});
test('real request timeout fails closed',async t=>{
  const {origin}=await withServer(t,()=>{});
  const report=await runSmoke(origin,{timeoutMs:25});
  assert.equal(report.passed,false);assert.ok(report.results.every(r=>r.failures.includes('request_timeout')));
});
const execute=args=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/read-only-launch-smoke.mjs',...args],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}));
});
test('CLI creates a report and refuses to overwrite existing evidence',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'rmg-smoke-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const {origin}=await withServer(t,(req,res)=>{const r=ROUTES.find(r=>r.path===req.url);res.writeHead(r.status,{'content-type':'text/html'});res.end(bodyFor(r))});
  const output=join(dir,'result.json');const args=['--base-url',origin,'--output',output];
  const first=await execute(args);assert.equal(first.code,0);const before=await readFile(output,'utf8');assert.equal(JSON.parse(before).passed,true);
  const second=await execute(args);assert.equal(second.code,2);assert.match(second.stderr,/Refusing to overwrite/);assert.equal(await readFile(output,'utf8'),before);
});
test('CLI refuses absent, malformed and duplicate arguments without a default live URL',async()=>{
  for(const args of [[],['--base-url'],['--base-url','http://127.0.0.1','--base-url','http://127.0.0.1'],['--unknown']]) assert.equal((await execute(args)).code,2);
});
