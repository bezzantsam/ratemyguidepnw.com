import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('RMG homepage keeps directory search and does not promote the separate research product',()=>{
  const source=read('app/page.tsx');
  assert.match(source,/<h1>Rate your guide\.<\/h1>/);
  assert.match(source,/href="\/write-review">Rate your guide/);
  assert.match(source,/<UnifiedSearch entries=\{directoryEntries\}/);
  assert.doesNotMatch(source,/href=["']\/intel|home-intel-feature|Buoy 10 Chinook Intel/);
  assert.match(source,/Review submissions are unavailable/);
  assert.match(source,/Are you listed as a captain\?/);
  assert.match(source,/Have you taken a trip\?/);
});
test('About uses the approved review-first copy without research promotion',()=>{
  const source=read('app/about/page.tsx');
  assert.match(source,/RateMyGuidePNW helps anglers find fishing guides, read reviews, and share their experiences\. Our goal is to make choosing a fishing guide easier and more transparent\./);
  assert.doesNotMatch(source,/Chinook|Chrome|Real trips\. Real talk\./i);
});
test('main navigation prioritizes reviews and keeps research out of the directory',()=>{
  const source=read('app/layout.tsx');
  assert.match(source,/href="\/write-review"/);
  assert.match(source,/href="\/guides"/);
  assert.match(source,/href="\/about"/);
  assert.doesNotMatch(source,/Dock Talk|About the Listings|Real Trips\. Real Talk/);
  assert.doesNotMatch(source,/href=["']\/intel|Chinook fishing intel/);
  assert.match(source,/Reviews and profile claims are currently unavailable/);
});
test('pre-launch indexing stays disabled until an explicitly approved release',()=>{
  assert.match(read('app/layout.tsx'),/robots: \{ index: false, follow: false \}/);
});
test('automatic deployments are disabled for this work branch, not silently changed globally',()=>{
  const config=JSON.parse(read('vercel.json'));
  assert.deepEqual(config.git.deploymentEnabled,{
    'codex/directory-identity-copy-fix':false,
    'coordinator/rmg-launch-prep':false,
    'codex/beta-completion':false,
    'codex/rmg-mobile-css-08':false,
    'codex/rmg-guide-search-corrections-20261117':false,
  });
});
