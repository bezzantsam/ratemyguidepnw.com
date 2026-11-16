import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const root = new URL('../docs/research/', import.meta.url);
const raw = readFileSync(new URL('BATCH13_DEDUPED_RESEARCH_MANIFEST_20261115.json',root));
const manifest = JSON.parse(raw);
const previous = JSON.parse(readFileSync(new URL('BATCH13_SOURCE_REVIEW_20261115.json',root),'utf8'));
const current = JSON.parse(readFileSync(new URL('BATCH13_NEXT30_SOURCE_REVIEW_20261115.json',root),'utf8'));

test('the next30 baseline still has the exact pinned Git blob bytes',()=>{
 const header=Buffer.from(`blob ${raw.length}\0`);
 const sha=createHash('sha1').update(header).update(raw).digest('hex');
 assert.equal(sha,current.baseline.manifest_blob_sha);
});
test('new records are exactly the first30 remaining full-manifest identities',()=>{
 const prior=new Set(previous.records.map(r=>r.registration_id));
 assert.equal(prior.size,20);
 const expected=manifest.records.filter(r=>!prior.has(r.registration_id)).sort((a,b)=>a.registration_id.localeCompare(b.registration_id)).slice(0,30);
 assert.deepEqual(current.records.map(r=>r.registration_id),expected.map(r=>r.registration_id));
 for(let i=0;i<expected.length;i++) {
  for(const field of ['registration_id','imported_name','imported_business','registry_website']) assert.equal(current.records[i][field],expected[i][field],`${i}:${field}`);
 }
 const combined=new Set([...prior,...current.records.map(r=>r.registration_id)]);
 assert.equal(combined.size,50);
 assert.equal(manifest.records.length-combined.size,61);
});
