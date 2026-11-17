import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('RMG homepage keeps directory search and does not promote the separate research product',()=>{
  const source=read('app/page.tsx');
  assert.match(source,/<UnifiedSearch entries=\{directoryEntries\}/);
  assert.doesNotMatch(source,/href=["']\/intel|home-intel-feature|Buoy 10 Chinook Intel/);
  assert.match(source,/Review submissions are unavailable/);
});
test('main navigation and metadata describe the read-only directory',()=>{
  const source=read('app/layout.tsx');
  assert.match(source,/href="\/guides\/verification"/);
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
  });
});
