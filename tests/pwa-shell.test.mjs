import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(path,'utf8');

test('install manifest describes a real standalone app with valid icons and no fake capabilities',()=>{
 const js=ts.transpileModule(read('app/manifest.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};vm.runInNewContext(js,{exports});
 const m=exports.default();
 assert.equal(m.name,'RateMyGuidePNW');
 assert.equal(m.display,'standalone');
 assert.equal(m.scope,'/');
 assert.equal(m.start_url,'/');
 assert.equal(m.icons.length,2);
 assert.equal(m.icons[0].sizes,'192x192');
 assert.equal(m.icons[1].sizes,'512x512');
 assert.match(m.icons[1].purpose,/maskable/);
 for(const path of ['app/icon-192/route.tsx','app/icon-512/route.tsx','app/icon.tsx','app/apple-icon.tsx','lib/app-icon.tsx'])assert.ok(read(path).length>10);
});

test('offline HTML clearly says connection required and never shows fake creel data',()=>{
 const offline=read('public/offline.html');
 assert.match(offline,/You’re offline/);
 assert.match(offline,/Connect to the internet/);
 assert.match(offline,/don’t store private reviews/);
 assert.doesNotMatch(offline,/Chinook\/boat|live forecast|verified customer/i);
});

test('service worker intercepts only same-origin GET navigations',async()=>{
 const handlers={};const online=[];
 const cacheContent=new Map([['/offline.html',new Response('OFFLINE NOTICE',{status:200})]]);
 const self={
  location:{origin:'https://ratemyguidepnw.com'},
  clients:{claim:async()=>{}},
  skipWaiting:async()=>{},
  addEventListener:(type,handler)=>{handlers[type]=handler},
 };
 const caches={
  open:async()=>({add:async key=>{if(key!=='/offline.html')throw Error('Unexpected cached URL')}}),
  keys:async()=>[],
  delete:async()=>true,
  match:async key=>cacheContent.get(key),
 };
 const fetch=async req=>{online.push(req.url);throw Error('network down')};
 vm.runInNewContext(read('public/sw.js'),{self,caches,fetch,Response,URL,Promise,console});
 let intercepted=null;
 function simulate(request){
  intercepted=null;
  handlers.fetch({request,respondWith:value=>{intercepted=value}});
  return intercepted;
 }
 assert.equal(simulate({method:'POST',mode:'navigate',url:'https://ratemyguidepnw.com/reviews'}),null);
 assert.equal(simulate({method:'GET',mode:'cors',url:'https://ratemyguidepnw.com/rest/v1/reviews'}),null);
 assert.equal(simulate({method:'GET',mode:'navigate',url:'https://third-party.example/reviews'}),null);
 const response=await simulate({method:'GET',mode:'navigate',url:'https://ratemyguidepnw.com/guides'});
 assert.equal(await response.text(),'OFFLINE NOTICE');
 assert.equal(online.length,1);
 assert.match(read('public/sw.js'),/cache\.add\(OFFLINE_URL\)/);
 assert.doesNotMatch(read('public/sw.js'),/cache\.put\(|caches\.put\(/);
});

test('mobile tabs link only to existing paths and expose active current page',()=>{
 const nav=read('components/MobileNavigation.tsx');
 for(const path of ['/', '/guides','/reviews','/saved']){
  assert.ok(nav.includes("href:'"+path+"'"));
 }
 assert.match(nav,/aria-current/);
 assert.match(nav,/usePathname/);
 assert.match(read('app/layout.tsx'),/<MobileNavigation/);
 assert.match(read('app/layout.tsx'),/<PWARegistration/);
 assert.match(read('app/globals.css'),/env\(safe-area-inset-bottom\)/);
});

test('installation guidance is opt-in, real-browser-triggered, and no offline data claim',()=>{
 const code=read('components/AppInstall.tsx');
 assert.match(code,/beforeinstallprompt/);
 assert.match(code,/appinstalled/);
 assert.match(code,/Add to Home Screen/);
 assert.match(code,/Connection required/);
 assert.match(code,/if\(installed\|\|\(!promptEvent&&!ios\)\)return null/);
 const sw=read('components/PWARegistration.tsx');
 assert.match(sw,/window\.isSecureContext/);
 assert.match(sw,/navigator\.serviceWorker\.register/);
});


test('service worker precaches only the offline page and evicts its own old cache',async()=>{
 const handlers={};const saved=[];const deleted=[];const existing=['rmgpnw-offline-shell-v0','unrelated-cache-v1'];
 const self={
  location:{origin:'https://ratemyguidepnw.com'},
  clients:{claim:async()=>{}},
  skipWaiting:async()=>{},
  addEventListener:(name,handler)=>{handlers[name]=handler},
 };
 const caches={
  open:async name=>{assert.equal(name,'rmgpnw-offline-shell-v1');return {add:async key=>saved.push(key)}},
  keys:async()=>existing,
  delete:async key=>{deleted.push(key);return true},
 };
 vm.runInNewContext(read('public/sw.js'),{self,caches,URL,fetch,Response,Promise,console});
 const wait=fn=>new Promise((resolve,reject)=>fn({waitUntil:p=>Promise.resolve(p).then(resolve,reject)}));
 await wait(handlers.install);
 await wait(handlers.activate);
 assert.deepEqual(saved,['/offline.html']);
 assert.deepEqual(deleted,['rmgpnw-offline-shell-v0']);
});
