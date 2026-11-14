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
function renderComponent(path,slug='og-0000315'){
  const source=read(path);
  const cjs=ts.transpileModule(source,{compilerOptions:{
    target:ts.ScriptTarget.ES2020,
    module:ts.ModuleKind.CommonJS,
    jsx:ts.JsxEmit.ReactJSX,
  }}).outputText;
  const module={exports:{}};
  vm.runInNewContext(cjs,{module,exports:module.exports,require,console});
  return renderToStaticMarkup(React.createElement(module.exports.default,{slug}));
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

test('a published OR/WA profile still renders visible, neutral, accessible content',()=>{
  for(const path of LEGACY){
    for(const id of ['og-0000315','wa-005']){
      const html=renderComponent(path,id);
      assert.match(html,/aria-labelledby=/);
      assert.match(html,/data-profile=/);
      assert.match(html,/independent review|review and/i);
      assert.doesNotMatch(html,/<button|<form|<script|<iframe|<img/i);
      assert.doesNotMatch(html,/Save captain information|Photo uploaded|Welcome video saved/);
      assert.doesNotMatch(html,/credential verified|Verified trip/i);
    }
  }
});

test('existing public source panels and claim routes survive with no new auto-publishing path',()=>{
  const original=read('app/guides/[slug]/page.tsx');
  const washington=read('app/washington/[id]/page.tsx');
  const claim=read('app/claim/[id]/page.tsx');
  for(const page of [original,washington]){
    assert.match(page,/<CaptainDetails/);
    assert.match(page,/<CaptainMedia/);
    assert.match(page,/<CaptainReviews/);
    assert.match(page,/<GuideTrustPanel/);
    assert.match(page,/Claim this profile/);
  }
  assert.match(original,/<GuideEnrichmentPanel/);
  assert.match(washington,/classifyWashingtonSource/);
  assert.match(claim,/<CaptainFisheryEditor/);
  assert.match(claim,/manual|independent review/i);
  assert.doesNotMatch(claim,/media.*upsert|guide_media.*insert/i);
});

test('new captain updates still travel only through the pending proposal contract',()=>{
  const editor=read('components/CaptainFisheryEditor.tsx');
  const sql=read('supabase/migrations/0003_pending_captain_fishery_proposals.sql');
  assert.match(editor,/from\('guide_fishery_proposals'\)\.insert\(row\)/);
  assert.match(editor,/approvedOwner/);
  assert.match(sql,/review_state text not null default 'pending'/);
  assert.match(sql,/create policy verified_owner_can_propose_fisheries/);
  assert.match(sql,/No UPDATE\/DELETE grants or policies/);
  assert.doesNotMatch(editor,/from\('guide_details'\)|from\('guide_media'\)/);
});

test('public media remains gated until a moderator-approved published read layer exists',()=>{
  const notes=read('docs/LEGACY_CAPTAIN_PUBLICATION_GATE.md');
  assert.match(notes,/inactive/i);
  assert.match(notes,/independent/i);
  assert.match(notes,/staging/i);
  assert.match(notes,/storage/i);
  assert.match(notes,/consent/i);
  assert.match(notes,/no production migration/i);
});
