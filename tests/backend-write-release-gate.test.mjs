import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = file => readFileSync(file, 'utf8');

function gate(env = {}) {
  const source = read('lib/backend-write-availability.ts');
  const code = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020
  }}).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, process: {env}, require: name => {
      assert.equal(name, 'server-only', 'gate must never import an auth/session/database client');
      return {};
    }
  });
  return exports.backendWriteAvailability();
}

test('both browser write experiences fail closed by default', () => {
  const result = gate();
  assert.equal(result.reviews, false);
  assert.equal(result.claims, false);
});

test('production environment or an accidental deployment flag cannot activate unreviewed writes', () => {
  for (const env of [
    {NODE_ENV: 'production'},
    {NODE_ENV: 'production', RMG_BACKEND_WRITE_RELEASE: 'true'},
    {NODE_ENV: 'production', RMG_BACKEND_WRITE_RELEASE: 'explicitly-reviewed-live-rls-and-jwt'},
    {NODE_ENV: 'development', RMG_BACKEND_WRITE_RELEASE: 'explicitly-reviewed-live-rls-and-jwt'},
  ]) {
    const result = gate(env);
    assert.equal(result.reviews, false, 'unreviewed review RPC/column cannot be activated');
    assert.equal(result.claims, false, 'missing claim RPC cannot be activated');
  }
});

test('reviewed feature approvals require a server-side code change in addition to deployment opt-in', () => {
  const source = read('lib/backend-write-availability.ts');
  assert.match(source, /import 'server-only'/);
  assert.match(source, /reviewSubmission:\s*false/);
  assert.match(source, /captainClaimSubmission:\s*false/);
  assert.match(source, /RMG_BACKEND_WRITE_RELEASE/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_/);
  assert.doesNotMatch(source, /createClient|service_role|supabase/i);
});

test('Oregon and Washington profile pages pass server-gated review availability', () => {
  for (const page of ['app/guides/[slug]/page.tsx', 'app/washington/[id]/page.tsx']) {
    const source = read(page);
    assert.match(source, /import \{backendWriteAvailability\} from '@\/lib\/backend-write-availability'/);
    assert.match(source, /<CaptainReviews[^>]+allowWrites=\{backendWriteAvailability\(\)\.reviews\}/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_.*REVIEWS_ENABLED/);
  }
  const component = read('components/CaptainReviews.tsx');
  assert.match(component, /allowWrites=false/);
  assert.match(component, /submitEnabled=\{allowWrites\}/);
  assert.match(component, /allowWrites&&!status&&guideId&&<ReviewInviteButton\/>/);
});

test('review composer blocks writes even if its submit handler is called directly', () => {
  const source = read('components/ReviewComposer.tsx');
  assert.match(source, /submitEnabled = false/);
  assert.match(source, /if\(!submitEnabled\)\{setMessage/);
  assert.match(source, /disabled=\{!submitEnabled\|\|!signedIn\|\|!guideId\|\|busy\}/);
  assert.match(source, /Review submissions are not live yet/);
  assert.match(source, /!submitEnabled\?<p role="status">Submitting is disabled/);
  assert.match(source, /from\('reviews'\)\.insert/);
});

test('captain claim page and form block RPC even if submit handler is called', () => {
  const page = read('app/claim/[id]/page.tsx');
  assert.match(page, /backendWriteAvailability/);
  assert.match(page, /submitEnabled=\{backendWriteAvailability\(\)\.claims\}/);
  const form = read('components/ClaimForm.tsx');
  assert.match(form, /submitEnabled=false/);
  assert.match(form, /if\(!submitEnabled\)\{setStatus/);
  assert.match(form, /disabled=\{!submitEnabled\|\|!client/);
  assert.match(form, /submitEnabled&&<AuthPanel\/>/);
  assert.match(form, /client\.rpc\('request_guide_claim'/);
});

test('none of the released client paths can turn on themselves through a NEXT_PUBLIC flag', () => {
  const files = [
    'components/CaptainReviews.tsx','components/ReviewComposer.tsx',
    'components/ClaimForm.tsx','app/claim/[id]/page.tsx',
    'app/guides/[slug]/page.tsx','app/washington/[id]/page.tsx',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /NEXT_PUBLIC_.*(?:REVIEW_WRITES|CLAIM_WRITES|BACKEND_WRITE_RELEASE)/);
  }
});
