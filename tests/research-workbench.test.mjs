import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname, extname} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';

const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  const path = resolve(file);
  if (cache.has(path)) return cache.get(path);
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
  const exports = {};
  cache.set(path, exports);
  const js = ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  vm.runInNewContext(js, {exports, URL, require: name => {
    if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
    let dependency = name.startsWith('@/') ? resolve(name.slice(2)) : resolve(dirname(path), name);
    if (!extname(dependency)) dependency += existsSync(dependency + '.ts') ? '.ts' : '.tsx';
    return load(dependency);
  }}, {filename: path});
  return exports;
}

const api=load('lib/research-workbench.ts');
const queue=JSON.parse(readFileSync('docs/research/requested-launch-review.json','utf8'));
const key=api.researchKey(queue.pendingEntities[0]);

test('filters real pending entities without mutating source records',()=>{
 const before=JSON.stringify(queue);
 assert.equal(api.filterResearchQueue(queue.pendingEntities,{},'Outlaw','vessel','all')[0].publicName,'The Outlaw');
 assert.equal(api.filterResearchQueue(queue.pendingEntities,{},'Kodi','vessel','all').length,0);
 const decisions={[key]:{state:'needs_evidence',note:'Need brother identity',evidenceUrl:''}};
 assert.equal(api.filterResearchQueue(queue.pendingEntities,decisions,'','all','needs_evidence').length,1);
 assert.equal(JSON.stringify(queue),before);
});

test('ready requires explicit evidence and safe links; cannot approve credentials',()=>{
 for(const url of ['javascript:alert(1)','http://example.com','https://user:secret@example.com','not a url'])assert.equal(api.safeResearchUrl(url),null);
 assert.ok(api.decisionError({state:'ready_for_review',note:'',evidenceUrl:'https://example.com'}));
 assert.ok(api.decisionError({state:'ready_for_review',note:'Claim',evidenceUrl:''}));
 assert.ok(api.decisionError({state:'approved',note:'Claim',evidenceUrl:'https://example.com'}));
 assert.equal(api.decisionError({state:'ready_for_review',note:'Business page names co-guide. Checked today.',evidenceUrl:'https://example.com/about'}),null);
});

test('handoff exports only edited known items and always keeps publication pending',()=>{
 const decision={state:'ready_for_review',note:' Source names this person. ',evidenceUrl:'https://example.com/about'};
 const before=JSON.stringify(queue);
 const out=api.buildResearchHandoff(queue,{[key]:decision,unknown:decision},'2026-11-14T12:00:00Z');
 assert.equal(out.items.length,1);
 assert.equal(out.items[0].publicationStatus,'pending_review');
 assert.equal(out.items[0].entity.credentialStatus,'unknown');
 assert.equal(out.items[0].entity.directoryId,null);
 assert.equal(out.items[0].review.note,'Source names this person.');
 assert.equal(JSON.stringify(queue),before);
 assert.equal(api.buildResearchHandoff(queue,{},'now').items.length,0);
 assert.throws(()=>api.buildResearchHandoff(queue,{[key]:{...decision,evidenceUrl:''}},'now'),/evidence URL/);
});

test('unfinished notes can be exported but invalid links and oversized notes cannot',()=>{
 const note={state:'needs_evidence',note:'Still investigating',evidenceUrl:''};
 assert.equal(api.buildResearchHandoff(queue,{[key]:note},'now').items[0].review.evidenceUrl,null);
 assert.ok(api.decisionError({...note,note:'x'.repeat(2001)}));
 assert.ok(api.decisionError({...note,evidenceUrl:'javascript:alert(1)'}));
});

test('screen renders real queue with explicit local-only limits and an empty state',()=>{
 const Workbench=load('components/ResearchWorkbench.tsx').default;
 const render=q=>renderToStaticMarkup(require('react').createElement(Workbench,{queue:q}));
 const html=render(queue);
 assert.match(html,/Resolve the next profile/);
 assert.match(html,/Kodi Cherry/);
 assert.match(html,/Notes stay in this tab/);
 assert.match(html,/cannot publish profiles/);
 assert.doesNotMatch(html,/>Approve|>Publish/);
 assert.match(render({...queue,pendingEntities:[]}),/No matching research items/);
});

test('production route rejects before reading real queue; client has no backend or static private-data import',()=>{
 const route=readFileSync('app/admin/research/page.tsx','utf8');
 assert.ok(route.indexOf("if(process.env.NODE_ENV!=='development')notFound()")<route.indexOf('await readFile'));
 assert.match(route,/force-dynamic/);
 const client=readFileSync('components/ResearchWorkbench.tsx','utf8');
 assert.doesNotMatch(client,/supabase|fetch\(|localStorage|requested-launch-review/);
 assert.match(client,/noopener noreferrer/);
});
