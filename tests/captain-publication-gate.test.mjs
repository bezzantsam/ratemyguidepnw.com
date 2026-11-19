import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const read=path=>readFileSync(path,'utf8');
const LEGACY=[
  'components/CaptainDetails.tsx',
  'components/CaptainMedia.tsx',
];
function renderComponent(path,slug='og-0000315',extra={}){
  const source=read(path);
  const cjs=ts.transpileModule(source,{compilerOptions:{
    target:ts.ScriptTarget.ES2020,
    module:ts.ModuleKind.CommonJS,
    jsx:ts.JsxEmit.ReactJSX,
  }}).outputText;
  const module={exports:{}};
  vm.runInNewContext(cjs,{module,exports:module.exports,require,console});
  return renderToStaticMarkup(React.createElement(module.exports.default,{slug,...extra}));
}

test('both legacy public components are display-only with no direct backend or storage access',()=>{
  for(const path of LEGACY){
    const src=read(path);
    assert.doesNotMatch(src,/['"]use client['"]/);
    assert.doesNotMatch(src,/from ['"]@supabase\/supabase-js['"]/);
    assert.doesNotMatch(src,/\bcreateClient\s*\(/);
    assert.doesNotMatch(src,/\b(?:db|supabase|client)\.from\s*\(/);
    assert.doesNotMatch(src,/\.storage\.from\s*\(/);
    assert.doesNotMatch(src,/\.(?:upsert|insert|update|delete|upload|remove)\s*\(/);
    assert.doesNotMatch(src,/\buseEffect\s*\(|\buseState\s*\(/);
    assert.doesNotMatch(src,/\bNEXT_PUBLIC_SUPABASE_/);
    assert.doesNotMatch(src,/<(?:iframe|img|video|form|input|button)\b/i);
  }
});

test('enabled claim copy points to the current profile flow without promising verification',()=>{
 const html=renderComponent('components/CaptainDetails.tsx','og-0000315',{claimAvailable:true});
 assert.match(html,/whether this listing can be claimed/);
 assert.match(html,/declarations are attributed to the captain/);
 assert.doesNotMatch(html,/Claiming currently unavailable|independently verified trip/);
});

test('a published OR/WA profile still renders visible, neutral, accessible content',()=>{
  for(const path of LEGACY){
    for(const id of ['og-0000315','wa-005']){
      const html=renderComponent(path,id);
      assert.match(html,/aria-labelledby=/);
      assert.match(html,/data-profile=/);
      assert.match(html,/independent review|review and/i);
      assert.doesNotMatch(html,/<button|<form|<script|<iframe|<img/i);
      assert.doesNotMatch(html,/Save captain information|Photo uploaded|Welcome video saved/);
      assert.doesNotMatch(html,/<(?:span|strong)[^>]*>\s*(?:Verified trip|Credential verified)/i);
    }
  }
});

test('public profile paths keep claim and review submission disabled',()=>{
 const washington=read('app/washington/[id]/page.tsx');
 const claim=read('app/claim/[id]/page.tsx');
 assert.doesNotMatch(washington,/<CaptainDetails|<CaptainMedia/);
 assert.match(washington,/<GuideEnrichmentPanel/);
 assert.match(claim,/Profile claim submissions are not currently available/);
 assert.doesNotMatch(claim,/<CaptainFisheryEditor|<ClaimForm/);
});
