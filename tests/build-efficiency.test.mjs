import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('all three large guide and claim directories are built on demand', () => {
  const paths = [
    'app/guides/[slug]/page.tsx',
    'app/washington/[id]/page.tsx',
    'app/claim/[id]/page.tsx',
  ];
  for (const path of paths) {
    const code = readFileSync(path,'utf8');
    assert.match(code,/generateStaticParams\(\)\s*\{\s*return \[\] as/);
    assert.match(code,/export const revalidate = 600/);
    assert.doesNotMatch(code, /generateStaticParams\(\)\s*\{\s*return \w+\.map\(/);
  }
});

test('only cached, published public reviews can enter shared layout', () => {
  const code = readFileSync('lib/dock-talk.ts','utf8');
  assert.match(code,/status', 'published'/);
  assert.match(code,/persistSession: false/);
  assert.match(code,/cache: 'force-cache'/);
  assert.match(code,/next: \{ revalidate: 600 \}/);
  assert.doesNotMatch(code,/cache: 'no-store'/);
  assert.doesNotMatch(code,/service_role|CHROME_AI_FORECAST_DATABASE_URL/);
});

test('website remains prelaunch and does not expose private Chrome-AI data', () => {
  const code=readFileSync('app/layout.tsx','utf8');
  assert.match(code,/robots: \{ index: false, follow: false \}/);
  assert.match(code,/DockTalkTicker/);
  assert.match(code,/Chinook Intel/);
});
