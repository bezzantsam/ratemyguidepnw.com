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
const trip=compile('components/launch/trip-responses.ts');
const draftStorage=compile('components/launch/review-draft-storage.ts',{'./submission-model':model,'./trip-responses':trip});
const details=compile('components/launch/TripDetails.tsx',{'./trip-responses':trip});
const views=compile('components/launch/SubmissionViews.tsx',{'./submission-model':model,'./trip-responses':trip,'./TripDetails':details,'./review-draft-storage':draftStorage});
const queue=compile('components/launch/ModerationQueue.tsx',{'./submission-model':model,'./SubmissionViews':views});
const published=compile('components/launch/PublishedReviews.tsx',{'./submission-model':model,'./ReviewShare':{ReviewShare:()=>null},'./ReportReview':{ReportReview:()=>null}});
const receiptId='10000000-0000-4000-8000-000000000001';

test('basic review requires a rating, nonempty narrative, disclosure and firsthand attestation',()=>{
  const valid={quality:5,intensity:3,wouldBookAgain:true,body:'A thoughtful account of the fishing trip. '.repeat(3),firsthand:true,tripMonth:null,relationship:'none'};
  assert.equal(model.validateReviewDraft(valid),null);
  for(const rating of [0,6,1.5,NaN]) {
    assert.ok(model.validateReviewDraft({...valid,quality:rating}));
    assert.ok(model.validateReviewDraft({...valid,intensity:rating}));
  }
  assert.equal(model.validateReviewDraft({...valid,intensity:null,wouldBookAgain:null}),null);
  assert.equal(model.validateReviewDraft({...valid,wouldBookAgain:false}),null);
  assert.equal(model.validateReviewDraft({...valid,body:'   short   '}),null);
  assert.ok(model.validateReviewDraft({...valid,body:'   '}));
  assert.ok(model.validateReviewDraft({...valid,body:'x'.repeat(3001)}));
  assert.ok(model.validateReviewDraft({...valid,firsthand:false}));
  assert.ok(model.validateReviewDraft({...valid,relationship:null}));
  assert.ok(model.validateReviewDraft({...valid,tripMonth:'2026-13'}));
  assert.equal(model.validateReviewDraft({...valid,tripMonth:'2026-11'}),null);
  assert.equal(model.validateReviewDraft({...valid,body:'🎣'.repeat(79)}),null);
  assert.equal(model.validateReviewDraft({...valid,body:'🎣'.repeat(80)}),null);
  assert.ok(model.validateReviewDraft({...valid,body:'🎣'.repeat(1501)}));
});

test('claim validation rejects empty and excessively long explanations',()=>{
  assert.ok(model.validateClaimStatement('  '));
  assert.ok(model.validateClaimStatement('x'.repeat(1201)));
  assert.equal(model.validateClaimStatement('x'.repeat(1200)),null);
  assert.ok(model.validateClaimStatement('x'.repeat(19)));
  assert.equal(model.validateClaimStatement('x'.repeat(20)),null);
  assert.equal(model.validateClaimStatement('I operate the listed guide business.'),null);
  assert.ok(model.validateClaimDraft({claimantName:'',businessName:'',evidence:'I operate the listed guide business.'}));
  assert.equal(model.validateClaimDraft({claimantName:'A Guide',businessName:'',evidence:'I operate the listed guide business.'}),null);
});

test('a missing, malformed or unknown receipt is never treated as successful',()=>{
  for(const receipt of [undefined,null,{}, {status:'pending'}, {id:receiptId,status:'approved'}, {id:receiptId,status:'published',message:42}]) assert.equal(model.isSubmissionReceipt(receipt,'review'),false);
  assert.equal(model.isSubmissionReceipt({id:receiptId,status:'pending'},'review'),true);
  assert.equal(model.isSubmissionReceipt({id:receiptId,status:'published'},'review'),true);
  assert.equal(model.isSubmissionReceipt({id:receiptId,status:'removed'},'review'),true);
  assert.equal(model.isSubmissionReceipt({id:receiptId,status:'denied'},'claim'),true);
  assert.equal(model.isSubmissionReceipt({id:receiptId,status:'rejected'},'claim'),false);
});

test('status renders the actual receipt and does not imply that sign-in verifies a trip',()=>{
  for(const status of ['pending','approved','denied']) {
    const html=renderToStaticMarkup(React.createElement(views.SubmissionStatus,{kind:'claim',receipt:{id:receiptId,status}}));
    assert.match(html,new RegExp(`Claim request: ${status}`));
  }
  const pending=renderToStaticMarkup(React.createElement(views.SubmissionStatus,{kind:'review',receipt:{id:receiptId,status:'pending'}}));
  assert.match(pending,/Your review is pending\. It is not on the public page\./);
  const denied=renderToStaticMarkup(React.createElement(views.SubmissionStatus,{kind:'claim',receipt:{id:receiptId,status:'denied'}}));
  assert.doesNotMatch(denied,/explanation below/);
  const review=renderToStaticMarkup(React.createElement(views.ReviewSubmission,{onSubmit:async()=>({status:'pending'}),allowTripResponses:true}));
  assert.match(review,/Signing in confirms your account, not that a trip occurred/);
  assert.match(review,/I personally took this trip/);
  assert.match(review,/<summary>Tell us more<\/summary>/);
  assert.match(review,/Trip month \(optional\)/);
  const basic=renderToStaticMarkup(React.createElement(views.ReviewSubmission,{onSubmit:async()=>({status:'pending'})}));
  assert.doesNotMatch(basic,/Trip month/);
  const claim=renderToStaticMarkup(React.createElement(views.ClaimSubmission,{onSubmit:async()=>({status:'pending'})}));
  assert.match(claim,/does not give control over angler reviews/);
});

test('moderation queue renders submitted text safely and does not invent pending entries',()=>{
  const error=renderToStaticMarkup(React.createElement(queue.ModerationQueue,{state:{status:'error'},onDecide:async()=>({status:'approved'})}));
  assert.match(error,/temporarily unavailable/);
  assert.doesNotMatch(error,/No pending submissions/);
  const empty=renderToStaticMarkup(React.createElement(queue.ModerationQueue,{state:{status:'ready',items:[]},onDecide:async()=>({status:'approved'})}));
  assert.match(empty,/No pending submissions/);
  assert.doesNotMatch(empty,/>Approve</);
  const items=[{id:'r1',kind:'review',guideName:'Example guide',description:'<script>unsafe</script>',submittedAt:'2026-11-17'}];
  const html=renderToStaticMarkup(React.createElement(queue.ModerationQueue,{state:{status:'ready',items},onDecide:async()=>({status:'approved'})}));
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

test('compact reviews follow the profile summary and invite a first reviewer only on a known empty page', () => {
  const guideKey = 'OR:1';
  const render = (state, inviteFirst = true) => renderToStaticMarkup(React.createElement(published.PublishedReviews, {guideKey, state, compactProfile: true, inviteFirst}));
  const empty = {guideKey, total: 0, average: null, reviews: []};
  const withReviews = {guideKey, total: 9, average: 4.2, reviews: [{id: 'r1', guideKey, status: 'published', rating: 5, body: 'A firsthand trip account.', publishedAt: '2026-11-17'}]};
  const cards = render({status: 'ready', page: withReviews});
  assert.match(cards, /Angler reviews/);
  assert.match(cards, /A firsthand trip account/);
  assert.doesNotMatch(cards, /4\.2|9 published reviews|Be the first/);
  assert.match(render({status: 'ready', page: empty}), /Be the first to share your experience/);
  assert.equal(render({status: 'ready', page: empty}, false), '');
  for (const state of [{status: 'loading'}, {status: 'error'}, {status: 'ready', page: {...empty, guideKey: 'OR:2'}}]) {
    assert.equal(render(state), '');
  }
});


test('new form places explicit booking and unselected dimension controls before relationship and narrative',()=>{
  const html=renderToStaticMarkup(React.createElement(views.ReviewSubmission,{onSubmit:async()=>({status:'pending'}),allowTripResponses:true}));
  const order=['Overall quality','Would you book again?','Rate individual aspects (optional)','Your relationship','Your experience'];
  assert.deepEqual(order.map(text=>html.indexOf(text)).sort((a,b)=>a-b),order.map(text=>html.indexOf(text)));
  assert.equal((html.match(/type="radio"/g)??[]).length,2);
  assert.doesNotMatch(html,/checked=""/);
  assert.equal((html.match(/selected="">Not rated/g)??[]).length,7);
});

test('published detail presents explicit No and only the dimension answers actually supplied',()=>{
  const review={id:'r1',guideKey:'WA:1',status:'published',rating:4,wouldBookAgain:false,
    ratings:{communication:5,value:2},body:'Firsthand account.',publishedAt:'2026-11-17'};
  const html=renderToStaticMarkup(React.createElement(published.ReviewCard,{review}));
  assert.match(html,/Overall quality: 4 \/ 5/);
  assert.match(html,/Would book again: <strong>No<\/strong>/);
  assert.match(html,/<dt>Communication<\/dt><dd>5 \/ 5<\/dd>/);
  assert.match(html,/<dt>Value<\/dt><dd>2 \/ 5<\/dd>/);
  assert.doesNotMatch(html,/Professionalism|Safety/);
  const legacy=renderToStaticMarkup(React.createElement(published.ReviewCard,{review:{...review,wouldBookAgain:undefined,ratings:undefined}}));
  assert.doesNotMatch(legacy,/Would book again|Individual ratings/);
});


test('form leads with safety, survey ratings and catch and asks for organization only once',()=>{
  const html=renderToStaticMarkup(React.createElement(views.ReviewSubmission,{onSubmit:async()=>({status:'pending'}),allowTripResponses:true}));
  const ordered=['Overall quality','Would you book again?','>Safety</label>','>Kindness</label>','>Organization</label>','>Finding fish</label>','How many fish did your group land?','Your experience'];
  const offsets=ordered.map(label=>html.indexOf(label));
  assert.ok(offsets.every(offset=>offset>=0));
  assert.deepEqual(offsets,[...offsets].sort((a,b)=>a-b));
  assert.equal((html.match(/>Organization<\/label>/g)??[]).length,1);
  assert.equal((html.match(/>Effort<\/label>/g)??[]).length,1);
  assert.match(html,/Include fish your group released\. Enter 0 if none landed\./);
});

test('published survey shows finding fish and reported zero separately from overall',()=>{
  const review={id:'r1',guideKey:'WA:1',status:'published',rating:5,body:'Earlier fishing trip.',publishedAt:'2026-11-17',
    tripHighlights:[{key:'fishiness',label:'Finding fish',answer:'2 / 5'},{key:'fish_landed',label:'Fish landed by the group',answer:'0'}]};
  const publicCard=renderToStaticMarkup(React.createElement(published.ReviewCard,{review}));
  assert.match(publicCard,/Overall quality: 5 \/ 5/);
  assert.match(publicCard,/<dt>Finding fish<\/dt><dd>2 \/ 5<\/dd>/);
  assert.match(publicCard,/Fish landed by the group, including releases: <strong>0<\/strong>/);
  const noCatch=renderToStaticMarkup(React.createElement(published.ReviewCard,{review:{...review,tripHighlights:[]}}));
  assert.doesNotMatch(noCatch,/Fish landed/);
});
