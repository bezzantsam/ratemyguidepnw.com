import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
function compile(path, imports={}) {
  const source=readFileSync(path,'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,require:name=>imports[name]??require(name)});
  return exports;
}
const model=compile('components/launch/submission-model.ts');
const views=compile('components/launch/SubmissionViews.tsx',{'./submission-model':model});

test('review validation requires a bounded rating, useful narrative and firsthand attestation',()=>{
  const valid={rating:5,body:'A thoughtful account of the fishing trip.',firsthand:true};
  assert.equal(model.validateReviewDraft(valid),null);
  for(const rating of [0,6,1.5,NaN]) assert.ok(model.validateReviewDraft({...valid,rating}));
  assert.ok(model.validateReviewDraft({...valid,body:'   short   '}));
  assert.ok(model.validateReviewDraft({...valid,body:'x'.repeat(501)}));
  assert.ok(model.validateReviewDraft({...valid,firsthand:false}));
});

test('claim validation rejects empty and excessively long explanations',()=>{
  assert.ok(model.validateClaimStatement('  '));
  assert.ok(model.validateClaimStatement('x'.repeat(1001)));
  assert.equal(model.validateClaimStatement('I operate the listed guide business.'),null);
});

test('a missing, malformed or unknown receipt is never treated as successful',()=>{
  for(const receipt of [undefined,null,{}, {status:'published'}, {status:'approved',message:42}]) assert.equal(model.isSubmissionReceipt(receipt),false);
  assert.equal(model.isSubmissionReceipt({status:'pending'}),true);
  assert.equal(model.isSubmissionReceipt({status:'rejected',message:'Please provide more detail.'}),true);
});

test('status renders the actual receipt and does not imply that sign-in verifies a trip',()=>{
  for(const status of ['pending','approved','rejected']) {
    const html=renderToStaticMarkup(React.createElement(views.SubmissionStatus,{kind:'claim',receipt:{status}}));
    assert.match(html,new RegExp(`Claim request: ${status}`));
  }
  const review=renderToStaticMarkup(React.createElement(views.ReviewSubmission,{onSubmit:async()=>({status:'pending'})}));
  assert.match(review,/Signing in confirms your account, not that a trip occurred/);
  assert.match(review,/I personally took this trip/);
  const claim=renderToStaticMarkup(React.createElement(views.ClaimSubmission,{onSubmit:async()=>({status:'pending'})}));
  assert.match(claim,/does not give control over angler reviews/);
});
