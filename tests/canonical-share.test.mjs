import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync('lib/canonical-share.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};vm.runInNewContext(code,{exports});

test('profile and review links use the public origin and preserve a stable guide identity',()=>{
  for(const path of ['/guides/og-0002254','/guides/og-0001225-f-f','/washington/wa-000']) {
    assert.equal(exports.canonicalProfileUrl(path),'https://ratemyguidepnw.com'+path);
    assert.equal(exports.canonicalReviewRequestUrl(path),'https://ratemyguidepnw.com'+path+'?intent=review#write-review');
  }
});

test('every current source-backed profile path can be represented canonically',()=>{
  const oregon=JSON.parse(readFileSync('lib/oregon-guides.json','utf8'));
  const washington=JSON.parse(readFileSync('lib/washington-stable-ids.json','utf8'));
  for(const record of oregon) {
    const slug=record.registration.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
    assert.equal(exports.canonicalProfileUrl(`/guides/${slug}`),`https://ratemyguidepnw.com/guides/${slug}`);
  }
  for(const id of Object.values(washington)) assert.equal(exports.canonicalProfileUrl(`/washington/${id}`),`https://ratemyguidepnw.com/washington/${id}`);
});

test('reject external, noncanonical, malformed, or query-bearing paths',()=>{
  for(const path of ['//evil.example/guides/og-0002254','https://evil.example/guides/og-0002254','/guides/og-0002254?returnTo=evil','/guides/../admin','/washington/wa-1','/guides/og-0002254#reviews','/guides/OG-0002254']) {
    assert.throws(()=>exports.canonicalProfileUrl(path));
  }
});

test('sign-in return accepts only the intended profile or that profile’s review intent',()=>{
  const profile='/guides/og-0002254';
  assert.equal(exports.safeGuideReturnTo(profile,profile),profile);
  assert.equal(exports.safeGuideReturnTo(`${profile}?intent=review#write-review`,profile),`${profile}?intent=review#write-review`);
  for(const candidate of ['//evil.example','https://evil.example/','/guides/og-0000050','/guides/og-0002254?intent=review&next=https://evil.example/#write-review','/guides/og-0002254#write-review','/guides/../admin']) {
    assert.equal(exports.safeGuideReturnTo(candidate,profile),profile);
  }
  assert.throws(()=>exports.safeGuideReturnTo('/admin','//evil.example'));
});

test('social metadata points to the canonical guide and makes no verification or rating claim',()=>{
  const metadata=exports.profileShareMetadata('/washington/wa-000','Example Guide','Example Fishing');
  assert.equal(metadata.alternates.canonical,'https://ratemyguidepnw.com/washington/wa-000');
  assert.equal(metadata.openGraph.url,metadata.alternates.canonical);
  assert.equal(metadata.openGraph.images[0].url,'https://ratemyguidepnw.com/share-card.png');
  assert.match(metadata.title,/Example Guide/);
  assert.match(metadata.description,/Example Fishing/);
  assert.doesNotMatch(metadata.description,/verified|licensed|five.star/i);
});
