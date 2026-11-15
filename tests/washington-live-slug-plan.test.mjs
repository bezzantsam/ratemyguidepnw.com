import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>JSON.parse(readFileSync(path,'utf8'));
const plan=read('supabase/proposals/washington-identity-slug-remap-review-only.json');
const imported=read('lib/washington-raw.json');
const stable=read('lib/washington-stable-ids.json');
const normalize=x=>(x||'').trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const assigned=imported.flatMap(row=>{
  const key=JSON.stringify([normalize(row.name),normalize(row.business),normalize(row.source)]);
  const id=stable[key];
  return id?[{new_slug:id,registered_name:row.name,registered_business:row.business||null,source:row.source}]:[];
});

test('review-only Washington slug snapshot covers every current stable directory ID',()=>{
  assert.equal(plan.schema_version,1);
  assert.equal(plan.mode,'read_only_snapshot_reconciliation_no_database_writes');
  assert.equal(plan.counts.expected,158);
  assert.equal(plan.counts.matches,158);
  assert.equal(plan.counts.ambiguous,0);
  assert.equal(assigned.length,158);
  assert.equal(plan.proposed_changes.length,132);
  assert.equal(plan.unchanged_slug_ids.length,26);
  const currentSlugs=assigned.map(r=>r.new_slug).sort();
  const planSlugs=[...plan.unchanged_slug_ids,...plan.proposed_changes.map(r=>r.new_slug)].sort();
  assert.deepEqual(planSlugs,currentSlugs);
});

test('no public URL is assigned to more than one historical row',()=>{
  const changes=plan.proposed_changes;
  assert.equal(new Set(changes.map(x=>x.old_slug)).size,changes.length);
  assert.equal(new Set(changes.map(x=>x.new_slug)).size,changes.length);
  assert.equal(new Set([...changes.map(x=>x.old_slug),...plan.unchanged_slug_ids]).size,158);
  assert.equal(new Set([...changes.map(x=>x.new_slug),...plan.unchanged_slug_ids]).size,158);
  assert.ok(changes.every(x=>x.old_slug!==x.new_slug));
});

test('each proposed public identity still matches its source-imported name and business',()=>{
  const bySlug=new Map(assigned.map(x=>[x.new_slug,x]));
  for(const row of plan.proposed_changes){
    const expected=bySlug.get(row.new_slug);
    assert.ok(expected,row.new_slug);
    assert.equal(normalize(row.registered_name),normalize(expected.registered_name));
    assert.equal(normalize(row.registered_business),normalize(expected.registered_business));
    assert.equal(normalize(row.source),normalize(expected.source));
    assert.equal(row.review_status,'pending_manual_review');
  }
});

test('no SQL write or migration code can be mistaken for a ready-to-apply fix',()=>{
  const doc=readFileSync('docs/WASHINGTON_LIVE_IDENTITY_RECONCILIATION.md','utf8');
  assert.match(doc,/no live schema or data writes/i);
  assert.match(doc,/slug uniqueness/i);
  assert.match(doc,/real JWT/i);
  assert.match(doc,/manual/i);
  assert.match(doc,/live snapshot/i);
  const source=readFileSync('supabase/proposals/washington-identity-slug-remap-review-only.json','utf8');
  assert.doesNotMatch(source,/\bupdate public\.guides\b|\bdelete from\b|\bset role\b/i);
  assert.equal(plan.mode.includes('no_database_writes'),true);
});
