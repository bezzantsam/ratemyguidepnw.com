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
const queue=compile('components/launch/ModerationQueue.tsx',{'./submission-model':model,'./SubmissionViews':views});
const published=compile('components/launch/PublishedReviews.tsx');

test('review validation requires both ratings, rebooking answer, narrative and firsthand attestation',()=>{
  const valid={quality:5,intensity:3,wouldBookAgain:true,body:'A thoughtful account of the fishing trip. '.repeat(3),firsthand:true};
  assert.equal(model.validateReviewDraft(valid),null);
  for(const rating of [0,6,1.5,NaN]) {
    assert.ok(model.validateReviewDraft({...valid,quality:rating}));
    assert.ok(model.validateReviewDraft({...valid,intensity:rating}));
  }
  assert.ok(model.validateReviewDraft({...valid,wouldBookAgain:null}));
  assert.equal(model.validateReviewDraft({...valid,wouldBookAgain:false}),null);
  assert.ok(model.validateReviewDraft({...valid,body:'   short   '}));
  assert.ok(model.validateReviewDraft({...valid,body:'x'.repeat(3001)}));
  assert.ok(model.validateReviewDraft({...valid,firsthand:false}));
});

test('claim validation rejects empty and excessively long explanations',()=>{
  assert.ok(model.validateClaimStatement('  '));
  assert.ok(model.validateClaimStatement('x'.repeat(1001)));
  assert.equal(model.validateClaimStatement('I operate the listed guide business.'),null);
});

test('a missing, malformed or unknown receipt is never treated as successful',()=>{
  for(const receipt of [undefined,null,{}, {status:'approved'}, {status:'published',message:42}]) assert.equal(model.isSubmissionReceipt(receipt,'review'),false);
  assert.equal(model.isSubmissionReceipt({status:'pending'},'review'),true);
  assert.equal(model.isSubmissionReceipt({status:'published'},'review'),true);
  assert.equal(model.isSubmissionReceipt({status:'removed'},'review'),true);
  assert.equal(model.isSubmissionReceipt({status:'denied'},'claim'),true);
  assert.equal(model.isSubmissionReceipt({status:'rejected'},'claim'),false);
});

test('status renders the actual receipt and does not imply that sign-in verifies a trip',()=>{
  for(const status of ['pending','approved','denied']) {
    const html=renderToStaticMarkup(React.createElement(views.SubmissionStatus,{kind:'claim',receipt:{status}}));
    assert.match(html,new RegExp(`Claim request: ${status}`));
  }
  const review=renderToStaticMarkup(React.createElement(views.ReviewSubmission,{onSubmit:async()=>({status:'pending'})}));
  assert.match(review,/Signing in confirms your account, not that a trip occurred/);
  assert.match(review,/I personally took this trip/);
  const claim=renderToStaticMarkup(React.createElement(views.ClaimSubmission,{onSubmit:async()=>({status:'pending'})}));
  assert.match(claim,/does not give control over angler reviews/);
});

test('moderation queue renders submitted text safely and does not invent pending entries',()=>{
  const empty=renderToStaticMarkup(React.createElement(queue.ModerationQueue,{items:[],onDecide:async()=>({status:'approved'})}));
  assert.match(empty,/No pending submissions/);
  assert.doesNotMatch(empty,/>Approve</);
  const items=[{id:'r1',kind:'review',guideName:'Example guide',description:'<script>unsafe</script>',submittedAt:'2026-11-17'}];
  const html=renderToStaticMarkup(React.createElement(queue.ModerationQueue,{items,onDecide:async()=>({status:'approved'})}));
  assert.match(html,/&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>unsafe<\/script>/);
  assert.match(html,/>Approve</);
  assert.match(html,/>Reject</);
});

test('review display uses the full backend aggregate and fails closed on another guide or unpublished content',()=>{
  const page={guideKey:'OR:1',total:9,average:4.2,reviews:[{id:'r1',guideKey:'OR:1',status:'published',rating:5,body:'A real trip account.',publishedAt:'2026-11-17'}]};
  assert.equal(published.validReviewPage('OR:1',page),true);
  const html=renderToStaticMarkup(React.createElement(published.PublishedReviews,{guideKey:'OR:1',state:{status:'ready',page}}));
  assert.match(html,/4\.2 \/ 5/);
  assert.match(html,/9 published reviews/);
  for(const changed of [{...page,guideKey:'WA:1'},{...page,reviews:[{...page.reviews[0],guideKey:'WA:1'}]},{...page,reviews:[{...page.reviews[0],status:'pending'}]},{...page,total:0,average:null}]) {
    assert.equal(published.validReviewPage('OR:1',changed),false);
    const invalid=renderToStaticMarkup(React.createElement(published.PublishedReviews,{guideKey:'OR:1',state:{status:'ready',page:changed}}));
    assert.match(invalid,/temporarily unavailable/);
    assert.doesNotMatch(invalid,/A real trip account/);
  }
  assert.equal(published.validReviewPage('OR:1',{guideKey:'OR:1',total:0,average:null,reviews:[]}),true);
});
