import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url),ts=require('typescript');
function compile(path,imports={},globals={}){
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,require:name=>imports[name]??require(name),...globals});return exports;
}
const model=compile('components/launch/submission-model.ts'),trip=compile('components/launch/trip-responses.ts');
function setup(browser){
  const items=new Map();
  const storage={getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value),removeItem:key=>items.delete(key),key:index=>[...items.keys()][index]??null,get length(){return items.size}};
  const api=compile('components/launch/review-draft-storage.ts',{'./submission-model':model,'./trip-responses':trip},{window:browser??{localStorage:storage}});
  return {api,items,storage};
}
const scope={accountId:'account-a',jurisdiction:'OR',sourceId:'OG.0000047'};
const partial={quality:'',intensity:'',wouldBookAgain:'',ratings:{safety:4},body:'I was still writing',tripMonth:'',
  tripDraft:{actual_duration_minutes:'value:',fish_landed:'value:-2',dog_present:'value:no'},relationship:'',firsthand:false,needsCheck:false};
const plain=value=>JSON.parse(JSON.stringify(value));

test('unfinished editable answers and latest keystrokes survive a new storage reader',()=>{
  const {api,items,storage}=setup();
  assert.equal(api.saveReviewDraft(scope,'review',partial,1000),true);
  const latest={...partial,quality:'5',wouldBookAgain:'no',body:'I was still writing the next character',firsthand:true,needsCheck:true};
  assert.equal(api.saveReviewDraft(scope,'review',latest,1001),true);
  const restarted=setup({localStorage:storage}).api;
  assert.deepEqual(plain(restarted.readReviewDraft(scope,'review',1002)),{status:'restored',draft:latest});
  assert.equal(items.size,1);
  assert.ok(trip.encodeTripResponses(latest.tripDraft).error,'draft persistence must not require submission-valid details');
});

test('drafts are isolated by account, jurisdiction, source and revision id',()=>{
  const {api}=setup();
  const scopes=[scope,{...scope,accountId:'account-b'},{...scope,jurisdiction:'WA'},{...scope,sourceId:'other'},
    {...scope,reviewId:'review-one'},{...scope,reviewId:'review-two'}];
  scopes.forEach((entry,index)=>assert.equal(api.saveReviewDraft(entry,index<4?'review':'revision',{...partial,body:`Draft ${index}`},1000),true));
  scopes.forEach((entry,index)=>assert.equal(api.readReviewDraft(entry,index<4?'review':'revision',1001).draft.body,`Draft ${index}`));
  assert.equal(api.readReviewDraft({...scope,sourceId:'unseen'},'review',1001).status,'empty');
  assert.equal(api.saveReviewDraft(scope,'revision',partial,1000),false,'a revision requires the original review identity');
});

test('saved data is allowlisted and does not include session or extra fields',()=>{
  const {api,items}=setup();
  api.saveReviewDraft({...scope,access_token:'SECRET_SCOPE_TOKEN'},'review',{...partial,access_token:'SECRET_DRAFT_TOKEN',session:{user:'SECRET_SESSION'}},1000);
  const raw=[...items.values()][0];
  assert.doesNotMatch(raw,/SECRET_|access_token|session/);
  assert.deepEqual(plain(api.readReviewDraft(scope,'review',1001).draft),partial);
});

test('seven-day inactivity expires a draft and subsequent editing renews its timestamp',()=>{
  const {api,items}=setup(),age=api.REVIEW_DRAFT_MAX_AGE_MS;
  api.saveReviewDraft(scope,'review',partial,1000);
  assert.equal(api.readReviewDraft(scope,'review',1000+age-1).status,'restored');
  api.saveReviewDraft(scope,'review',{...partial,body:'Updated draft'},1000+age-1);
  assert.equal(api.readReviewDraft(scope,'review',1000+age).draft.body,'Updated draft');
  assert.equal(api.readReviewDraft(scope,'review',1000+2*age-1).status,'empty');
  assert.equal(items.size,0);
});

test('corrupt, mismatched and unsupported stored data never populates the form',()=>{
  const {api,storage}=setup(),key=api.reviewDraftStorageKey(scope);
  api.saveReviewDraft(scope,'review',partial,1000);
  const valid=JSON.parse(storage.getItem(key));
  const bad=[null,[],{},'{not-json',JSON.stringify({...valid,version:2}),JSON.stringify({...valid,scope:{...scope,accountId:'someone-else'}}),
    JSON.stringify({...valid,draft:{...partial,ratings:{safety:9}}}),JSON.stringify({...valid,draft:{...partial,tripDraft:{unknown:'value:yes'}}}),
    JSON.stringify({...valid,draft:{...partial,firsthand:'true'}}),JSON.stringify({...valid,updatedAt:Infinity})];
  for(const entry of bad){
    storage.setItem(key,typeof entry==='string'?entry:JSON.stringify(entry));
    assert.equal(api.readReviewDraft(scope,'review',1001).status,'empty');
    assert.equal(storage.getItem(key),null);
  }
});

test('discard and sign-out clear only matching stored drafts',()=>{
  const {api,items,storage}=setup();
  const revision={...scope,reviewId:'review-one'},otherGuide={...scope,sourceId:'other'},otherAccount={...scope,accountId:'account-a-other'};
  for(const [entry,mode] of [[scope,'review'],[revision,'revision'],[otherGuide,'review'],[otherAccount,'review']])api.saveReviewDraft(entry,mode,partial,1000);
  storage.setItem('unrelated-key','keep');
  assert.equal(api.clearReviewDraft(scope),true);
  assert.equal(api.readReviewDraft(scope,'review',1001).status,'empty');
  assert.equal(api.readReviewDraft(revision,'revision',1001).status,'restored');
  assert.equal(api.clearReviewDraftsForAccount(scope.accountId),true);
  assert.equal(items.size,2);
  assert.equal(api.readReviewDraft(otherAccount,'review',1001).status,'restored');
  assert.equal(storage.getItem('unrelated-key'),'keep');
});

test('blocked access and full storage fail safely without hiding a failed save',()=>{
  const blocked={get localStorage(){throw Error('blocked')}};
  const unavailable=setup(blocked).api;
  assert.equal(unavailable.readReviewDraft(scope).status,'unavailable');
  assert.equal(unavailable.saveReviewDraft(scope,'review',partial),false);
  assert.equal(unavailable.clearReviewDraft(scope),false);
  assert.equal(unavailable.clearReviewDraftsForAccount(scope.accountId),false);
  const full=setup({localStorage:{getItem:()=>null,setItem(){throw Error('QuotaExceededError')},removeItem(){}}}).api;
  assert.equal(full.readReviewDraft(scope).status,'empty');
  assert.equal(full.saveReviewDraft(scope,'review',partial),false);
});
