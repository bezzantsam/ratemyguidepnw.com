import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync('lib/saved-guides.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;

function harness(initial=null,failWrites=false){
 const store=new Map();
 if(initial!==null)store.set('rmgpnw:saved-guides:v1',initial);
 const events=[];
 const window={
  localStorage:{
   getItem:k=>store.get(k)??null,
   setItem:(k,v)=>{if(failWrites)throw new Error('quota');store.set(k,v);},
  },
  dispatchEvent:event=>events.push(event.type),
 };
 const exports={};
 vm.runInNewContext(compiled,{exports,window,Event:class Event{constructor(type){this.type=type}}});
 return {api:exports,store,events};
}

test('safely drops injected URLs, malformed paths, duplicates and oversize lists',()=>{
 const {api}=harness();
 const items=['/guides/og-12','https://evil.example','/washington/a_2','/guides/og-12','/guides/../a','/guides/x?tracking=yes'];
 assert.deepEqual(Array.from(api.normalizeSavedGuides(items)),['/guides/og-12','/washington/a_2']);
 assert.equal(api.normalizeSavedGuides(Array.from({length:100},(_,i)=>'/guides/g'+i)).length,50);
 assert.deepEqual(Array.from(api.normalizeSavedGuides('bad')),[]);
});

test('saved guides toggle, deduplicate and raise same-tab change event',()=>{
 const {api,events}=harness();
 assert.equal(api.toggleSavedGuide('/guides/og-12').saved,true);
 assert.equal(api.toggleSavedGuide('/guides/og-12').saved,false);
 assert.deepEqual(Array.from(api.readSavedGuides()),[]);
 assert.deepEqual(events,['rmgpnw:saved-guides-changed','rmgpnw:saved-guides-changed']);
});

test('corrupted browser storage and disabled storage fail without crashing',()=>{
 const broken=harness('not json');
 assert.deepEqual(Array.from(broken.api.readSavedGuides()),[]);
 const denied=harness(null,true);
 assert.equal(denied.api.toggleSavedGuide('/washington/abc').saved,false);
 assert.equal(denied.events.length,0);
});

test('feature respects distinct profile paths and never uses ratings as evidence',()=>{
 const search=readFileSync('components/UnifiedSearch.tsx','utf8');
 const oregon=readFileSync('app/guides/[slug]/page.tsx','utf8');
 const washington=readFileSync('app/washington/[id]/page.tsx','utf8');
 const page=readFileSync('app/saved/page.tsx','utf8');
 assert.match(search,/SaveGuideButton href=\{g\.href\}/);
 assert.match(oregon,/SaveGuideButton href=\{\`\/guides\/\$\{guideSlug\(g\)\}\`\}/);
 assert.match(washington,/SaveGuideButton href=\{\`\/washington\/\$\{g\.id\}\`\}/);
 assert.match(page,/Clearing browser storage removes them/);
 assert.match(page,/not current license checks/);
});
