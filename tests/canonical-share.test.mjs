import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync('lib/canonical-share.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function load(env={}) {
  const exports={};
  vm.runInNewContext(code,{exports,process:{env}});
  return exports;
}
const exports=load();

test('profile and review links use the public origin and preserve a stable guide identity',()=>{
  for(const path of ['/guides/og-0002254','/guides/og-0001225-f-f','/washington/wa-000']) {
    assert.equal(exports.canonicalProfileUrl(path),'https://ratemyguidepnw.vercel.app'+path);
    assert.equal(exports.canonicalReviewRequestUrl(path),'https://ratemyguidepnw.vercel.app'+path+'?intent=review#write-review');
  }
});

test('every current source-backed profile path can be represented canonically',()=>{
  const oregon=JSON.parse(readFileSync('lib/oregon-guides.json','utf8'));
  const washington=JSON.parse(readFileSync('lib/washington-stable-ids.json','utf8'));
  for(const record of oregon) {
    const slug=record.registration.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
    assert.equal(exports.canonicalProfileUrl(`/guides/${slug}`),`https://ratemyguidepnw.vercel.app/guides/${slug}`);
  }
  for(const id of Object.values(washington)) assert.equal(exports.canonicalProfileUrl(`/washington/${id}`),`https://ratemyguidepnw.vercel.app/washington/${id}`);
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

test('auth round trip preserves only the selected guide and review intent',()=>{
  const profile='/guides/og-0002254';
  assert.equal(exports.guideAuthRedirectPath(`${profile}?intent=review#write-review`,profile),`${profile}?intent=review`);
  assert.equal(exports.guideAuthRedirectPath(`${profile}?intent=review`,profile),`${profile}?intent=review`);
  for(const candidate of ['//evil.example', '/guides/og-0000050?intent=review#write-review', `${profile}?intent=review&next=//evil.example#write-review`, `${profile}?intent=review#access_token=secret`]) {
    assert.equal(exports.guideAuthRedirectPath(candidate,profile),profile);
  }
  assert.equal(exports.guideAuthRestoredPath(profile,'?intent=review','',profile),`${profile}?intent=review#write-review`);
  assert.equal(exports.guideAuthRestoredPath(profile,'?intent=review','#write-review',profile),`${profile}?intent=review#write-review`);
  assert.equal(exports.guideAuthRestoredPath(profile,'?intent=review','#access_token=secret',profile),null);
  assert.equal(exports.guideAuthRestoredPath(profile,'?intent=review&next=//evil.example','',profile),null);
  assert.equal(exports.guideAuthRestoredPath('/guides/og-0000050','?intent=review','',profile),null);
  assert.throws(()=>exports.guideAuthRedirectPath('/admin','//evil.example'));
});

test('published review links preserve a validated ID and cannot cross guide or auth boundaries',()=>{
  const profile='/guides/og-0002254',id='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
  assert.equal(exports.canonicalPublishedReviewUrl(profile,id),`https://ratemyguidepnw.vercel.app${profile}#review-${id}`);
  assert.equal(exports.guideAuthRedirectPath(`${profile}#review-${id}`,profile),`${profile}?review=${id}`);
  assert.equal(exports.guideAuthRestoredPath(profile,`?review=${id}`,'',profile),`${profile}#review-${id}`);
  assert.equal(exports.guideAuthRestoredPath(profile,`?review=${id}`,'#access_token=secret',profile),null);
  assert.equal(exports.guideAuthRestoredPath(profile,`?review=${id}`,`#review-${other}`,profile),null);
  assert.equal(exports.guideAuthRedirectPath(`/guides/og-0000050#review-${id}`,profile),profile);
  assert.throws(()=>exports.canonicalPublishedReviewUrl(profile,'not-a-review'));
});

test('social metadata points to the canonical guide and makes no verification or rating claim',()=>{
  const metadata=exports.profileShareMetadata('/washington/wa-000','Example Guide','Example Fishing');
  assert.equal(metadata.alternates.canonical,'https://ratemyguidepnw.vercel.app/washington/wa-000');
  assert.equal(metadata.openGraph.url,metadata.alternates.canonical);
  assert.equal(metadata.openGraph.images[0].url,'https://ratemyguidepnw.vercel.app/share-card.png');
  assert.match(metadata.title,/Example Guide/);
  assert.match(metadata.description,/Example Fishing/);
  assert.doesNotMatch(metadata.description,/verified|licensed|five.star/i);
});

test('only a production deployment with explicit cutover uses the new public origin',()=>{
  const profile='/guides/og-0002254';
  const cutover={NEXT_PUBLIC_RMG_CANONICAL_CUTOVER_ENABLED:'true'};
  for (const env of [
    {},
    cutover,
    {...cutover,NEXT_PUBLIC_VERCEL_ENV:'preview'},
    {...cutover,NEXT_PUBLIC_VERCEL_ENV:'development'},
    {NEXT_PUBLIC_VERCEL_ENV:'production'},
    {NEXT_PUBLIC_VERCEL_ENV:'production',NEXT_PUBLIC_RMG_CANONICAL_CUTOVER_ENABLED:'false'},
  ]) {
    const share=load(env);
    assert.equal(share.canonicalProfileUrl(profile),'https://ratemyguidepnw.vercel.app'+profile);
    assert.equal(share.profileShareMetadata(profile,'Guide',null).openGraph.siteName,'Rate Your Guide');
  }
  const share=load({...cutover,NEXT_PUBLIC_VERCEL_ENV:'production'});
  assert.equal(share.canonicalReviewRequestUrl(profile),'https://rateyourguide.com'+profile+'?intent=review#write-review');
  const metadata=share.profileShareMetadata(profile,'Guide',null);
  assert.equal(metadata.alternates.canonical,'https://rateyourguide.com'+profile);
  assert.equal(metadata.openGraph.images[0].url,'https://rateyourguide.com/share-card.png');
  assert.equal(share.guideAuthRedirectPath(profile+'?intent=review#write-review',profile),profile+'?intent=review');
});
