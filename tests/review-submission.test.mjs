import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync('lib/review-submission.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const api={};
vm.runInNewContext(compiled,{exports:api});
const draft=()=>({...api.EMPTY_REVIEW_DRAFT,ratings:{}});

test('month selection refuses invalid and future dates',()=>{
 assert.equal(api.isValidTripMonth('2026-12','2026-11'),false);
 assert.equal(api.isValidTripMonth('2026-13','2026-11'),false);
 assert.equal(api.isValidTripMonth('2026-08-05','2026-11'),false);
 assert.equal(api.isValidTripMonth('2026-08','2026-11'),true);
 assert.equal(api.reviewStepError(0,draft(),'2026-11')!==null,true);
});

test('overall rating has no default; optional categories may be not-applicable',()=>{
 const d=draft();
 assert.equal(d.ratings.quality,undefined);
 d.month='2026-08';
 assert.match(api.reviewStepError(1,d,'2026-11'),/overall rating/);
 d.ratings.quality=5;
 assert.equal(api.reviewStepError(1,d,'2026-11'),null);
 assert.equal(api.isRating(0),false);
 assert.equal(api.isRating(3.5),false);
 assert.equal(api.isRating(3),true);
});

test('story validation requires genuine attestation and explicit rebook answer',()=>{
 const d=draft();d.month='2026-08';d.ratings.quality=2;
 d.body='A'.repeat(80);
 assert.match(api.reviewStepError(2,d,'2026-11'),/book again/);
 d.wouldBook='no';
 assert.match(api.reviewStepError(2,d,'2026-11'),/genuine firsthand/);
 d.attested=true;
 assert.equal(api.reviewStepError(2,d,'2026-11'),null);
 d.body='A'.repeat(501);
 assert.match(api.reviewStepError(2,d,'2026-11'),/80–500/);
 d.body='A'.repeat(79);
 assert.match(api.reviewStepError(2,d,'2026-11'),/80–500/);
});

test('insert is pending only, with existing DB columns and month granularity',()=>{
 const d=draft();d.month='2026-08';d.ratings.quality=1;
 d.ratings.communication=2;d.wouldBook='no';d.attested=true;d.body='Tough experience. '.repeat(6);
 const row=api.createPendingReviewInsert(d,'guide-id','user-id');
 assert.equal('status' in row,false); // Database default owns moderation state.
 assert.equal(row.guide_id,'guide-id');
 assert.equal(row.trip_month,'2026-08-01');
 assert.equal(row.quality,1);
 assert.equal(row.communication,2);
 assert.equal(row.safety,null);
 assert.equal(row.would_book_again,false);
 assert.equal(row.intensity,3);
 assert.equal(row.trip_context,null);
 assert.equal('reviewer_email' in row,false);
 assert.equal('verified_trip' in row,false);
 assert.equal('trip_date' in row,false);
});

test('privacy warning detects accidental identifiers, not ordinary criticism',()=>{
 assert.equal(api.reviewPrivacyWarning('Call me at 503-555-0199'),true);
 assert.equal(api.reviewPrivacyWarning('Email user@example.com'),true);
 assert.equal(api.reviewPrivacyWarning('My name is Test Angler'),true);
 assert.equal(api.reviewPrivacyWarning('The captain was late but worked hard'),false);
});

test('review composer never claims an active proof-upload workflow',()=>{
 const component=readFileSync('components/ReviewComposer.tsx','utf8');
 const reviews=readFileSync('components/CaptainReviews.tsx','utf8');
 assert.match(component,/No receipt upload or independently verified-trip badge is offered yet/);
 assert.match(component,/No ratings are preselected/);
 assert.match(component,/aria-current/);
 assert.match(component,/window.sessionStorage.removeItem/);
 assert.match(component,/reviewStepError\(2,draft,latestMonth\)/);
 assert.match(reviews,/public_angler_reviews/);
 assert.match(reviews,/ReviewComposer guideId=/);
 assert.doesNotMatch(component,/status:\s*'published'/);
});
