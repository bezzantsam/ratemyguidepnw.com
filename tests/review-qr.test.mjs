import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path,imports={}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,process:{env:{}},require:name=>imports[name]});return exports;
}
const canonical=compile('lib/canonical-share.ts');
const vendor=compile('lib/vendor/qrcodegen.ts');
const qr=compile('lib/review-qr.ts',{'./canonical-share':canonical,'./vendor/qrcodegen':vendor});

test('downloadable QR SVG is deterministic, contains a quiet zone and changes with the guide',()=>{
  const first=qr.reviewRequestQrSvg('/guides/og-0002254');
  assert.equal(first,qr.reviewRequestQrSvg('/guides/og-0002254'));
  assert.notEqual(first,qr.reviewRequestQrSvg('/washington/wa-000'));
  assert.match(first,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(first,/aria-label="Review request QR code"/);
  const size=Number(first.match(/viewBox="0 0 (\d+) \1"/)[1]);
  const modules=[...first.matchAll(/M(\d+),(\d+)h1v1h-1z/g)].map(x=>[Number(x[1]),Number(x[2])]);
  assert.ok(modules.length>0);
  for(const [x,y] of modules) assert.ok(x>=4&&y>=4&&x<size-4&&y<size-4);
  assert.doesNotMatch(first,/<script|<image|href=/i);
  if(process.env.QR_TEST_SVG)writeFileSync(process.env.QR_TEST_SVG,first,{flag:'wx',mode:0o600});
});

test('QR generation refuses a noncanonical profile path',()=>{
  assert.throws(()=>qr.reviewRequestQrSvg('//evil.example'));
});
