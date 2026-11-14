import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(path,'utf8');
const source=read('lib/review-moderation-decision.ts');
const compiled=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,
}}).outputText;
const api={};
vm.runInNewContext(compiled,{exports:api});
const moderate=api.planReviewDecision;
const reviewer='a1495270-608e-4bd6-9b47-a76d96cdfb1f';
const editor='6e264ab1-f5b2-4c92-838b-de121bec4ecd';
const context=(overrides={})=>({
  reviewStatus:'pending',authorId:reviewer,moderatorId:editor,
  moderatorActive:true,moderatorIsApprovedGuideOwner:false,
  guideIsPublished:true,firsthandAttested:true,
  body:'An honest account of a trip where the captain showed care and preparation.',
  ...overrides,
});

test('positive and negative experiences are published using identical eligibility checks',()=>{
  const accepted=moderate(context(),'publish','Firsthand account met neutral content standards.');
  assert.equal(accepted.nextStatus,'published');
  assert.equal(accepted.previousStatus,'pending');
  assert.equal(accepted.requiresPublicationTimestamp,true);
  assert.equal(accepted.requiresPrivateAuditEvent,true);
  const critical=moderate(context({
    body:'The captain was late, and I would not choose to book another trip.',
  }),'publish','Negative but firsthand and respectful account.');
  assert.equal(critical.nextStatus,'published');
});

test('a human moderator can reject a pending review and must record a real reason',()=>{
  const result=moderate(context(),'reject','Contains names of other private passengers.');
  assert.equal(result.nextStatus,'rejected');
  assert.equal(result.requiresPublicationTimestamp,false);
  assert.equal(result.reason,'Contains names of other private passengers.');
  assert.throws(()=>moderate(context(),'reject','bad'),/reason/i);
  assert.throws(()=>moderate(context(),'publish','x'.repeat(501)),/reason/i);
  assert.throws(()=>moderate(context(),'publish',null),/reason/i);
});

test('invalid decision and NULL are denied, not silently turned into rejection',()=>{
  for(const choice of [null,undefined,'approve','remove','publish_all','auto_publish',true,0])
    assert.throws(()=>moderate(context(),choice,'Some internal reason for review.'),/Only publish or reject/);
});

test('no moderator identity, deactivated moderator, or self-review can authorize a decision',()=>{
  for(const rejected of [
    {moderatorActive:false},
    {authorId:editor},
    {moderatorId:reviewer},
    {moderatorId:'user-entered-email'},
    {authorId:''},
  ])assert.throws(()=>moderate(context(rejected),'publish','Independent moderation note.'),/moderator|UUID|self/i);
});

test('approved guide owners cannot moderate their own ratings',()=>{
  assert.throws(()=>moderate(context({moderatorIsApprovedGuideOwner:true}),
    'publish','Owner attempting to decide own reviews.'),/own guides/);
});

test('only pending reviews transition; duplicates or changed published records fail closed',()=>{
  for(const state of ['published','rejected','removed'])
    assert.throws(()=>moderate(context({reviewStatus:state}),
      'reject','Any nonpending review is closed to changes.'),/Only a pending review/);
});

test('suspended and draft guides cannot have a new public review',()=>{
  assert.throws(()=>moderate(context({guideIsPublished:false}),
    'publish','Guide currently suspended from the directory.'),/suspended|draft/);
});

test('firsthand attestation and meaningful length are mandatory only for publishing',()=>{
  assert.throws(()=>moderate(context({firsthandAttested:false}),
    'publish','No firsthand attendance was confirmed by user.'),/self-attestation/);
  assert.throws(()=>moderate(context({body:'short'}),
    'publish','Review text shorter than approved minimum length.'),/publication limits/);
  assert.throws(()=>moderate(context({body:'x'.repeat(501)}),
    'publish','Review text over approved maximum length.'),/publication limits/);
  assert.equal(moderate(context({firsthandAttested:false}),
    'reject','Unattested review should not be published.').nextStatus,'rejected');
});

test('database procedure validates membership, row locks and conflict rules again',()=>{
  const sql=read('supabase/proposals/review_moderation_decisions_staging_only.sql');
  assert.match(sql,/create schema if not exists private/);
  assert.match(sql,/create table private\.review_moderators/);
  assert.match(sql,/active boolean not null default false/);
  assert.match(sql,/revoke all on table private\.review_moderators/);
  assert.match(sql,/grant select on table private\.review_moderators to service_role/);
  assert.match(sql,/where m\.user_id = p_moderator_id/);
  assert.match(sql,/m\.active is true/);
  assert.match(sql,/v_review\.author_id = p_moderator_id/);
  assert.match(sql,/c\.claimant_id = p_moderator_id/);
  assert.match(sql,/c\.status='approved'/);
  assert.match(sql,/for update;/); // serializes simultaneous decisions
  assert.match(sql,/v_review\.status <> 'pending'/);
  assert.match(sql,/p_decision is null/);
  assert.match(sql,/firsthand_attested is not true/);
  assert.match(sql,/g\.listing_status='published'/);
});

test('database records decision and publication in a single atomic transaction',()=>{
  const sql=read('supabase/proposals/review_moderation_decisions_staging_only.sql');
  assert.match(sql,/begin;/);
  assert.match(sql,/commit;/);
  assert.match(sql,/update public\.reviews/);
  assert.match(sql,/where id=p_review_id and status='pending'/);
  assert.match(sql,/published_at=case when p_decision='publish'/);
  assert.match(sql,/insert into private\.review_decision_events/);
  assert.match(sql,/unique\(review_id\)/); // single decision, no repeat
  assert.match(sql,/returning event_id into v_decision_id/);
  assert.match(sql,/to_status text not null check\(to_status in \('published','rejected'\)\)/);
  assert.match(sql,/reason text not null check\(char_length\(btrim\(reason\)\) between 12 and 500\)/);
});

test('function is service-only, not a public/moderator browser RPC',()=>{
  const sql=read('supabase/proposals/review_moderation_decisions_staging_only.sql');
  assert.match(sql,/security invoker/);
  assert.doesNotMatch(sql,/\bsecurity definer\b/i);
  assert.match(sql,/revoke all on function public\.decide_angler_review\(uuid,uuid,text,text\)\s+from public, anon, authenticated, service_role/);
  assert.match(sql,/grant execute on function public\.decide_angler_review\(uuid,uuid,text,text\)\s+to service_role/);
  assert.doesNotMatch(sql,/grant execute on function public\.decide_angler_review[^;]*to authenticated/);
  assert.doesNotMatch(sql,/grant (?:insert|update|delete)\s+on(?: table)? private\.review_moderators to authenticated/i);
  assert.doesNotMatch(sql,/grant (?:select|update|delete)\s+on(?: table)? private\.review_decision_events to authenticated/i);
});

test('private ledger has no client grants and ordinary services have no update/delete access',()=>{
  const sql=read('supabase/proposals/review_moderation_decisions_staging_only.sql');
  assert.match(sql,/alter table private\.review_decision_events force row level security/);
  assert.match(sql,/revoke all on table private\.review_decision_events\s+from public, anon, authenticated, service_role/);
  assert.match(sql,/grant select, insert on table private\.review_decision_events to service_role/);
  assert.doesNotMatch(sql,/grant.*update.*private\.review_decision_events/i);
  assert.doesNotMatch(sql,/grant.*delete.*private\.review_decision_events/i);
  assert.doesNotMatch(sql,/payment_status|premium_tier|sponsor_plan|rating_boost/i);
});

test('this branch does not expose a live moderation route or writable admin UI',()=>{
  assert.equal(existsSync('app/api/moderation/reviews/route.ts'),false);
  const preview=read('app/admin/inbox/page.tsx');
  assert.match(preview,/process\.env\.NODE_ENV\s*!==\s*'development'/);
  assert.match(preview,/notFound\(\)/);
  assert.doesNotMatch(preview,/\.rpc\(|\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(source,/createClient|supabase|service_role|auth\.jwt/);
  const workflow=read('.github/workflows/site-build.yml');
  assert.doesNotMatch(workflow,/db push|apply_migration|staging_only\.sql/);
  const docs=read('docs/MODERATION_DECISION_STAGING.md');
  assert.match(docs,/INACTIVE/);
  assert.match(docs,/real JWT/);
  assert.match(docs,/no production/i);
  assert.match(docs,/service[_-]role/i);
  assert.match(docs,/cannot prove/i);
});
