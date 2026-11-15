import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');
const required=[
 'app/manifest.ts',
 'public/sw.js',
 'components/MobileNavigation.tsx',
 'components/AppInstall.tsx',
 'app/saved/page.tsx',
 'lib/washington-stable-ids.json',
 'lib/guide-enrichment.json',
 'lib/guide-identity.ts',
 'components/RelatedOutfitterCaptains.tsx',
 'components/CaptainFisheryEditor.tsx',
 'lib/captain-fisheries.ts',
 'lib/moderation-review.ts',
 'app/admin/inbox/page.tsx',
 'supabase/migrations/0003_pending_captain_fishery_proposals.sql',
 'docs/INTEGRATED_LAUNCH_GATES.md',
];
test('all expected independently tested feature modules exist in integrated tree',()=>{
 for(const path of required)assert.ok(existsSync(path),'missing integrated module '+path);
});

test('public guide pages never query or display unapproved captain proposals',()=>{
 for(const path of ['app/guides/[slug]/page.tsx','app/washington/[id]/page.tsx',
                    'lib/directory.ts','components/UnifiedSearch.tsx']){
  const source=read(path);
  assert.doesNotMatch(source,/guide_fishery_proposals|profile_change_proposals|submitter_email/);
 }
 const review=read('components/GuideTrustPanel.tsx');
 assert.doesNotMatch(review,/credential_verified\s*=\s*true/);
});

test('manual moderation UI is synthetic, development-only and cannot approve or publish',()=>{
 const route=read('app/admin/inbox/page.tsx');
 const panel=read('components/ModeratorDiffPreview.tsx');
 assert.match(route,/process\.env\.NODE_ENV\s*!==\s*'development'/);
 assert.match(route,/notFound\(\)/);
 assert.match(route,/Synthetic local preview/);
 assert.doesNotMatch(route,/supabase|\.rpc\(|\.insert\(|\.update\(|\.delete\(/i);
 assert.doesNotMatch(panel,/<button|onClick|Approve & Publish/);
 assert.match(panel,/No moderation actions are connected/);
});

test('pending captain proposal review status is database generated, not client supplied',()=>{
 const mapper=read('lib/captain-fisheries.ts');
 const schema=read('supabase/migrations/0003_pending_captain_fishery_proposals.sql');
 const submitter=read('components/CaptainFisheryEditor.tsx');
 assert.match(submitter,/approvedOwner/);
 assert.match(submitter,/from\('guide_claims'\)/);
 assert.match(submitter,/createCaptainProposalInsert/);
 assert.match(schema,/review_state text not null default 'pending'/);
 assert.match(schema,/grant insert \(guide_id,submitted_by,vessels,offerings\)/);
 assert.match(schema,/review_state='pending'/);
 assert.doesNotMatch(mapper,/review_state:\s*'approved'/);
 assert.doesNotMatch(mapper,/is_published:\s*true/);
});

test('source and person identity safeguards survive the integrated branches',()=>{
 const or=read('app/guides/[slug]/page.tsx');
 const wa=read('app/washington/[id]/page.tsx');
 const directory=read('components/UnifiedSearch.tsx');
 assert.match(or,/RelatedOutfitterCaptains/);
 assert.match(or,/GuideEnrichmentPanel/);
 assert.match(wa,/classifyWashingtonSource/);
 assert.match(wa,/RelatedOutfitterCaptains/);
 assert.match(directory,/filterDirectoryEntries/);
 assert.match(directory,/Advertised fishing water \(pilot\)/);
 const groups=read('lib/guide-identity.ts');
 assert.match(groups,/DO_NOT_MERGE_PAIRS/);
 assert.match(groups,/isExplicitlyDistinctCaptain/);
});

test('offline worker only caches the static outage page, not user or scientific data',()=>{
 const worker=read('public/sw.js');
 assert.match(worker,/cache\.add\(OFFLINE_URL\)/);
 assert.match(worker,/OFFLINE_URL\s*=\s*'\/offline\.html'/);
 assert.doesNotMatch(worker,/cache\.put\(/);
 assert.doesNotMatch(worker,/precache.*guides|precache.*review|candidate\.json/i);
});

test('all integration suites and full build remain required by scripts and CI',()=>{
 const pkg=JSON.parse(read('package.json'));
 const wf=read('.github/workflows/site-build.yml');
 for(const script of ['test:intel','test:pwa','test:shortlist','test:review',
                      'test:directory-ids','test:discovery','test:identities',
                      'test:captain-fisheries','test:moderation']){
  assert.ok(pkg.scripts.check.includes('npm run '+script),'not gated '+script);
  assert.ok(wf.includes('npm run '+script),'not in GitHub CI '+script);
 }
 assert.match(pkg.scripts.check,/npm run typecheck && npm run build/);
 assert.match(read('docs/INTEGRATED_LAUNCH_GATES.md'),/Do not reactivate it without owner approval/);
});
