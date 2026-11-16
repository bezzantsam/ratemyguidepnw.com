import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');

test('read-only review, moderation, and shared layout surfaces make no backend calls',()=>{
 for(const path of ['app/admin/page.tsx','app/reviews/page.tsx','components/CaptainReviews.tsx','components/DockTalkTicker.tsx']){
  const source=read(path);
  assert.doesNotMatch(source,/createClient|AuthPanel|@supabase|\.from\(|\.rpc\(|fetch\(|getPublishedDockReviews/);
  assert.doesNotMatch(source,/<form|<input|<textarea|onClick|onSubmit/);
 }
 assert.match(read('app/admin/page.tsx'),/Moderation unavailable/);
 assert.match(read('components/CaptainReviews.tsx'),/Review data is unavailable/);
 assert.doesNotMatch(read('app/reviews/page.tsx'),/No customer reviews have been published|No ratings yet/);
});

test('claim and media surfaces clearly disable submissions and edits',()=>{
 for(const path of ['app/guides/[slug]/page.tsx','app/washington/[id]/page.tsx'])assert.match(read(path),/Claiming currently unavailable/);
 for(const path of ['app/claim/[id]/page.tsx','components/ClaimForm.tsx','components/CaptainDetails.tsx','components/CaptainMedia.tsx']){
  assert.doesNotMatch(read(path),/\.insert\(|\.upsert\(|\.update\(|\.upload\(|\.rpc\(|onSubmit/);
 }
 assert.match(read('app/claim/[id]/page.tsx'),/Profile claim submissions are not currently available/);
});
