import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync('lib/review-scorecard.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020
}}).outputText;
const api={};
vm.runInNewContext(compiled,{exports:api});
const summary=api.summarizePublishedReviewSample;
const ratings=(...values)=>values.map(quality=>({quality}));

test('no published reviews produces no fabricated zero-star score',()=>{
  const score=summary([]);
  assert.equal(score.count,0);
  assert.equal(score.average,null);
  assert.equal(score.scope,'no_reviews');
  assert.match(score.explanation,/No published reviews/);
});

test('one good or bad review is preserved honestly and flagged as a small sample',()=>{
  const good=summary(ratings(5));
  const poor=summary(ratings(1));
  assert.equal(good.average,5);
  assert.equal(poor.average,1);
  assert.equal(good.count,1);
  assert.equal(good.earlySample,true);
  assert.equal(poor.earlySample,true);
  assert.match(poor.explanation,/not independently booking-verified/);
});

test('unfavorable, mixed and favorable published ratings contribute equally to the mean',()=>{
  const score=summary(ratings(1,2,4,5,5));
  assert.equal(score.count,5);
  assert.equal(score.average,3.4);
  assert.equal(score.earlySample,false);
  assert.equal(score.scope,'displayed_published_reviews');
  assert.doesNotMatch(source,/paid_rank|verified_trip|verified_booking|weighted_5_star/);
});

test('an exact 50-review page is honestly labeled as the latest 50, not all time',()=>{
  const score=summary(Array.from({length:50},(_,i)=>({quality:i%2?1:5})));
  assert.equal(score.count,50);
  assert.equal(score.average,3);
  assert.equal(score.scope,'latest_50_published_reviews');
  assert.match(score.explanation,/not necessarily all time/);
  assert.throws(()=>summary(Array.from({length:51},()=>({quality:5}))),/at most 50/);
});

test('malformed ratings are rejected rather than treated as zeros or missing observations',()=>{
  for(const input of [[{quality:0}],[{quality:6}],[{quality:4.5}],[{quality:null}],[null],'five']){
    assert.throws(()=>summary(input),/Expected at most|invalid quality/);
  }
});

test('public UI uses only the published review read-model, displays count and caution',()=>{
  const code=readFileSync('components/CaptainReviews.tsx','utf8');
  assert.match(code,/from\('public_angler_reviews'\)/);
  assert.match(code,/summarizePublishedReviewSample\(reviews\)/);
  assert.match(code,/average from/);
  assert.match(code,/Early sample/);
  assert.match(code,/reviews\.length/);
  assert.match(code,/self-report, not a verified trip/);
  assert.doesNotMatch(code,/guide_fishery_proposals|claim_evidence|receipt_upload|fetchPrivateEvidence/);
});

test('moderator labels are independent of sentiment, no proof-rate target is treated as required',()=>{
  const policy=readFileSync('docs/ANGLER_REVIEW_POLICY.md','utf8');
  assert.match(policy,/No mandatory receipt/i);
  assert.match(policy,/negative review/i);
  assert.match(policy,/self-attestation/i);
  assert.match(policy,/publicly anonymous/i);
  assert.match(policy,/No evidence-backed review quota/i);
  assert.match(policy,/conflict of interest/i);
  assert.match(policy,/corrections and appeals/i);
});
