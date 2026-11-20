import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function compile(path,imports={}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,process:{env:{}},require:name=>imports[name]??require(name)});return exports;
}
const share=compile('lib/canonical-share.ts');
const stub={__esModule:true,default:()=>null};
const common={
  '@/components/launch/CaptainTripsEditor':{CaptainTripsEditor:()=>null},
  '@/components/ReturnToResults':stub,'@/components/GuideEnrichmentPanel':stub,'@/components/CaptainReviews':stub,
  '@/components/GuideTrustPanel':stub,'@/components/CaptainDetails':stub,'@/components/CaptainMedia':stub,
  '@/components/launch/ProfileSharing':{ProfileSharing:()=>null},'@/components/launch/ClaimProfile':{ClaimProfile:()=>null},'@/components/launch/AuthCheck':{AuthCheck:()=>null},'@/components/launch/GuideEngagement':{GuideEngagement:()=>null},'@/lib/canonical-share':share,
  'next/navigation':{notFound:()=>{throw Error('not found')}},'next/link':stub,
  '@/lib/washington':{washingtonRecordForOregon:()=>null,washingtonGuide:id=>id==='wa-000'?{id,name:'WA Guide',business:null}:null},
  '@/lib/registry':{findGuide:slug=>slug==='og-0002254'?{name:'OR Guide',business:'Fishing Co.'}:null,guideSlug:()=>'og-0002254'},
};
const oregon=compile('app/guides/[slug]/page.tsx',common);
const washington=compile('app/washington/[id]/page.tsx',common);

test('both profile routes publish matching canonical social metadata for the actual listing',async()=>{
  const or=await oregon.generateMetadata({params:Promise.resolve({slug:'og-0002254'})});
  const wa=await washington.generateMetadata({params:Promise.resolve({id:'wa-000'})});
  assert.equal(or.openGraph.url,'https://ratemyguidepnw.vercel.app/guides/og-0002254');
  assert.equal(or.alternates.canonical,or.openGraph.url);
  assert.match(or.openGraph.title,/OR Guide/);
  assert.match(or.openGraph.description,/Fishing Co\./);
  assert.equal(wa.openGraph.url,'https://ratemyguidepnw.vercel.app/washington/wa-000');
  assert.match(wa.openGraph.title,/WA Guide/);
  assert.equal(wa.openGraph.images[0].url,'https://ratemyguidepnw.vercel.app/share-card.png');
  await assert.rejects(oregon.generateMetadata({params:Promise.resolve({slug:'bogus'})}),/not found/);
  await assert.rejects(washington.generateMetadata({params:Promise.resolve({id:'wa-999'})}),/not found/);
});

test('social preview image exists as a 1200 by 630 PNG',()=>{
  const png=readFileSync('public/share-card.png');
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),1200);
  assert.equal(png.readUInt32BE(20),630);
});
