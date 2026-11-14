import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(path,'utf8');
const source=read('lib/review-invitations.ts');
const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020
}}).outputText;
const exported={};
vm.runInNewContext(compiled,{exports:exported,URL,Error});
const {buildPublicReviewLink,formatNeutralReviewInvite,REVIEW_INVITE_TEXT}=exported;

test('neutral profile sharing works for Oregon and Washington public IDs',()=>{
 assert.equal(buildPublicReviewLink('https://ratemyguidepnw.com/guides/og-0000315'),
              'https://ratemyguidepnw.com/guides/og-0000315#write-review');
 assert.equal(buildPublicReviewLink('https://ratemyguidepnw.com/washington/wa-005'),
              'https://ratemyguidepnw.com/washington/wa-005#write-review');
 assert.equal(buildPublicReviewLink('https://ratemyguidepnw.com/guides/og-0001225-f-f'),
              'https://ratemyguidepnw.com/guides/og-0001225-f-f#write-review');
});

test('shared URLs strip personal tracking params and other fragments',()=>{
 const url=buildPublicReviewLink('https://ratemyguidepnw.com/washington/wa-062?source=text&email=private%40mail.com#captain');
 assert.equal(url,'https://ratemyguidepnw.com/washington/wa-062#write-review');
 assert.doesNotMatch(url,/email|source=|@|captain$/);
});

test('only public guide-profile URLs are eligible to share',()=>{
 for(const url of [
  'javascript:alert(1)',
  'data:text/html,hello',
  'https://ratemyguidepnw.com/guides',
  'https://ratemyguidepnw.com/admin/inbox',
  'https://ratemyguidepnw.com/claim/OG.0000315',
  'https://ratemyguidepnw.com/washington/wa-xx',
  'https://ratemyguidepnw.com/guides/og-0000315/other',
 ]){
  assert.throws(()=>buildPublicReviewLink(url),/public guide|Only public/i,url);
 }
});

test('neutral invite asks past anglers for honest mixed or negative feedback as well as praise',()=>{
 const url=buildPublicReviewLink('https://ratemyguidepnw.com/guides/og-0000315');
 const invite=formatNeutralReviewInvite(url);
 assert.ok(invite.includes(url));
 assert.match(invite,/personally fished/);
 assert.match(invite,/positive, mixed, or critical/);
 assert.match(invite,/No receipt or payment details needed/);
 assert.doesNotMatch(invite,/5 stars|five stars|positive only|gift card|discount for rating/i);
 assert.equal(invite,REVIEW_INVITE_TEXT+'\n'+url);
});

test('sharing control has no tracking or automatic outreach and shows only when review form is available',()=>{
 const button=read('components/ReviewInviteButton.tsx');
 const reviewList=read('components/CaptainReviews.tsx');
 assert.match(button,/navigator\.share/);
 assert.match(button,/navigator\.clipboard\.writeText/);
 assert.match(button,/Share honest review link/);
 assert.match(button,/Guides can invite past clients/);
 assert.doesNotMatch(button,/fetch\(|sendBeacon|supabase|\.insert\(|sendSms|sendEmail/);
 assert.match(reviewList,/!status&&guideId&&<ReviewInviteButton\/>/);
 assert.match(reviewList,/from\('public_angler_reviews'\)/);
});
