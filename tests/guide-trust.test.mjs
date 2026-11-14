import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path,'utf8');

test('both state profile pages display source-aware trust labels', () => {
  const or = read('app/guides/[slug]/page.tsx');
  const wa = read('app/washington/[id]/page.tsx');
  const component = read('components/GuideTrustPanel.tsx');
  assert.match(or, /GuideTrustPanel jurisdiction="Oregon"/);
  assert.match(wa, /GuideTrustPanel jurisdiction="Washington"/);
  assert.match(or, /importedStatus=\{g\.sourceStatus\}/);
  assert.match(wa, /sourceLabel=\{g\.source\}/);
  assert.match(component, /Listed in imported source/);
  assert.match(component, /Not live-verified/);
  assert.match(component, /Trip proof not certified/);
  assert.match(component, /Source label/);
  assert.match(component, /historical file value/);
});

test('no unsupported license, USCG or verified-trip icon is published', () => {
  const component = read('components/GuideTrustPanel.tsx');
  const policy = read('app/guides/verification/page.tsx');
  assert.doesNotMatch(component, /credential verified|license verified|verified trip badge/i);
  assert.match(component, /We have not established/);
  assert.match(component, /USCG credential/);
  assert.match(component, /review publication/);
  assert.match(policy, /We do not currently display a live-verified license/);
  assert.match(policy, /independently confirmed booking/);
  assert.match(policy, /A .*Verified trip.* badge must not appear/);
});

test('search list labels do not imply account claiming or review counts', () => {
  const paths=[
    'components/UnifiedSearch.tsx',
    'components/WashingtonSearch.tsx',
    'components/RegistryGuideCard.tsx',
  ];
  for (const path of paths) {
    const code = read(path);
    assert.doesNotMatch(code, />Unclaimed</);
    assert.doesNotMatch(code, /No reviews yet/);
    assert.match(code, /Source listing|Imported source listing/);
    assert.match(code, /Reviews on profile|Review information on profile/);
    assert.match(code, /See reviews/);
  }
});

test('guide profiles still load real Supabase moderation/review components', () => {
  for (const path of ['app/guides/[slug]/page.tsx','app/washington/[id]/page.tsx']) {
    const code=read(path);
    assert.match(code, /<CaptainDetails/);
    assert.match(code, /<CaptainMedia/);
    assert.match(code, /<CaptainReviews/);
    assert.match(code, /<GuideTrustPanel/);
    assert.doesNotMatch(code, /<strong>No reviews yet<\/strong>/);
  }
  const review=read('components/CaptainReviews.tsx');
  assert.match(review, /public_angler_reviews/);
  const mapping=read('lib/review-submission.ts');
  const composer=read('components/ReviewComposer.tsx');
  assert.match(mapping, /status:\s*'pending'/);
  assert.match(composer, /createPendingReviewInsert/);
  assert.doesNotMatch(mapping, /status:\s*'published'/);
});

test('explanation provides neutral distinctions and accessible source disclosure', () => {
  const code=read('app/guides/verification/page.tsx');
  assert.match(code, /export const metadata/);
  assert.match(code, /Listing does not establish/);
  assert.match(code, /Current registration and USCG credentials/);
  assert.match(code, /Claimed guide profile/);
  assert.match(code, /Published angler review/);
  assert.match(code, /Independently verified trip/);
  assert.match(code, /guide directory/);
  assert.match(code, /<main className="guide-verification-page"/);
  const css=read('app/globals.css');
  assert.match(css, /trust-evidence-grid/);
  assert.match(css, /max-width:830px/);
  assert.match(css, /focus-visible/);
});
