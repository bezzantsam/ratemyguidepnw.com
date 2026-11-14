import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const claim=read('components/ClaimForm.tsx');
const mapping=read('lib/review-submission.ts');
const reviews=read('components/ReviewComposer.tsx');
const schema=read('supabase/proposals/claim_review_pending_staging_only.sql');

test('claim form submits one atomic, authenticated RPC with source evidence and no caller-controlled user or state',()=>{
 assert.match(claim,/client\.rpc\('request_guide_claim',\{/);
 for(const key of ['p_guide_id:guide.id','p_claimant_name:captainName',
                   'p_business_name:businessName','p_public_evidence:publicEvidence'])
   assert.ok(claim.includes(key),key);
 assert.doesNotMatch(claim,/from\('guide_claims'\)\.insert/);
 assert.doesNotMatch(claim,/from\('claim_evidence'\)\.insert/);
 assert.doesNotMatch(claim,/claimant_id\s*:/);
 assert.doesNotMatch(claim,/status\s*:\s*['"](?:pending|approved|published)/);
 assert.match(claim,/No profile ownership was verified/);
 assert.match(claim,/no receipts, identity documents or secrets/i);
});

test('claim and private evidence are written in one SECURITY INVOKER function transaction',()=>{
 assert.match(schema,/create or replace function public\.request_guide_claim\(/);
 assert.match(schema,/security invoker/i);
 assert.doesNotMatch(schema,/security definer/i);
 assert.match(schema,/v_user_id uuid := auth\.uid\(\)/);
 assert.match(schema,/insert into public\.guide_claims \(guide_id, claimant_id\)/);
 assert.match(schema,/returning id into v_claim_id/);
 assert.match(schema,/insert into public\.claim_evidence/);
 assert.match(schema,/values\s*\(v_claim_id,/);
 assert.match(schema,/revoke all on function public\.request_guide_claim\(uuid,text,text,text\)/);
 assert.match(schema,/grant execute on function public\.request_guide_claim\(uuid,text,text,text\)\s+to authenticated/);
 assert.doesNotMatch(schema,/grant execute on function public\.request_guide_claim[^;]*to\s+anon/i);
});

test('private evidence never becomes available to anonymous readers or ordinary owner SELECT',()=>{
 assert.match(schema,/create table public\.claim_evidence/);
 assert.match(schema,/claim_id uuid not null unique references public\.guide_claims\(id\)/);
 assert.match(schema,/alter table public\.claim_evidence force row level security/);
 assert.match(schema,/revoke all on table public\.claim_evidence from public, anon, authenticated/);
 assert.match(schema,/grant insert \(claim_id, claimant_name, business_name, public_evidence\)/);
 assert.doesNotMatch(schema,/grant select[^;]*on (?:table )?public\.claim_evidence/i);
 assert.match(schema,/create policy claim_evidence_insert_own_pending_only/);
 assert.match(schema,/c\.claimant_id = \(select auth\.uid\(\)\)/);
});

test('browser reviews attest firsthand trips but never invent intensity or accept moderator status',()=>{
 assert.match(mapping,/firsthand_attested: draft\.attested === true/);
 assert.doesNotMatch(mapping,/intensity\s*:\s*3/);
 assert.doesNotMatch(mapping,/\bstatus\s*:/);
 assert.match(reviews,/I personally attended this fishing trip/);
 assert.match(reviews,/We do not require receipts/);
 assert.doesNotMatch(reviews,/\.rpc\('approve/);
 assert.match(schema,/alter table public\.reviews alter column intensity drop not null/);
 assert.match(schema,/add column firsthand_attested boolean not null default false/);
 assert.match(schema,/author_id = \(select auth\.uid\(\)\)/);
 assert.match(schema,/firsthand_attested is true/);
 assert.match(schema,/status = 'pending'/);
 assert.match(schema,/published_at is null/);
});

test('client grants restrict review insert to allowed data, never status or publication timestamps',()=>{
 const match=schema.match(/grant insert \(([^;]*?)\) on public\.reviews to authenticated;/);
 assert.ok(match,'explicit review INSERT grant required');
 const columns=match[1].replace(/\s+/g,'').split(',');
 for(const name of ['guide_id','author_id','quality','body','firsthand_attested'])assert.ok(columns.includes(name),name);
 for(const name of ['status','created_at','published_at','verified_trip','is_moderator'])
  assert.ok(!columns.includes(name),name);
 assert.match(schema,/revoke all on table public\.reviews from public, anon, authenticated/);
 assert.doesNotMatch(schema,/grant (?:all|update|delete) on (?:table )?public\.reviews to authenticated/i);
 assert.match(schema,/create policy authenticated_firsthand_review_pending/);
});

test('only published reviews for published guides can be read from security-invoker view',()=>{
 assert.match(schema,/create view public\.public_angler_reviews\s+with \(security_invoker = true\)/);
 assert.match(schema,/r\.status = 'published'/);
 assert.match(schema,/r\.published_at is not null/);
 assert.match(schema,/g\.listing_status = 'published'/);
 assert.match(schema,/drop policy if exists public_reviews on public\.reviews/);
 assert.match(schema,/create policy public_reviews_visible_only/);
 const view=schema.split('create view public.public_angler_reviews')[1].split('revoke all on table public.public_angler_reviews')[0];
 assert.doesNotMatch(view,/author_id|claim_evidence|p_public_evidence|private_angler_id|firsthand_attested/);
 assert.match(schema,/grant select on public\.public_angler_reviews to anon, authenticated/);
});

test('staging proposal cannot be applied automatically by migration runner or mistaken for production readiness',()=>{
 assert.ok(existsSync('supabase/proposals/claim_review_pending_staging_only.sql'));
 assert.match(schema,/STAGING DESIGN DRAFT, NEVER AUTOMATICALLY APPLY/);
 assert.match(schema,/NOT migrations\//);
 assert.match(schema,/NO moderation-approval function/);
 assert.doesNotMatch(schema,/create function public\.approve_review|create or replace function public\.approve_review/i);
 const preflight=read('scripts/backend_schema_preflight.py');
 assert.match(preflight,/BLOCKED_PENDING_REMOTE_SCHEMA_AND_JWT_RLS_VERIFICATION/);
 assert.match(preflight,/draft_staging_only_not_migrated_or_verified/);
 const workflow=read('.github/workflows/site-build.yml');
 assert.doesNotMatch(workflow,/supabase db push|supabase migration up|apply_migration/);
 assert.doesNotMatch(workflow,/claim_review_pending_staging_only\.sql/);
});

test('release documentation does not claim first-party user data or production RLS is ready',()=>{
 const doc=read('docs/ATOMIC_CLAIMS_STAGING_REVIEW.md');
 for(const term of ['inactive','read-only','real JWT','moderator','RLS','do not execute','staging','zero production']) {
  assert.match(doc,new RegExp(term,'i'),term);
 }
});
