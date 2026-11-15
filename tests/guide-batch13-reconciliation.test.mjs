import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const path = new URL('../docs/research/BATCH13_DEDUPED_RESEARCH_MANIFEST_20261115.json', import.meta.url);
const manifest = JSON.parse(readFileSync(path, 'utf8'));
const records = manifest.records;

test('Batch 13 reconciliation preserves 111 unique stable registration IDs', () => {
  assert.equal(manifest.status, 'research_only_not_for_publication');
  assert.equal(records.length, 111);
  const ids = records.map((record) => record.registration_id);
  assert.equal(new Set(ids).size, 111);
  assert.ok(ids.every((id) => /^OG\.\d{7}$/.test(id)));
  assert.deepEqual([...ids].sort(), ids);
});

test('Batch 13 sibling membership counts reconcile exactly', () => {
  const overlap = records.filter((record) => record.present_in_pr96 && record.present_in_pr97).length;
  const only96 = records.filter((record) => record.present_in_pr96 && !record.present_in_pr97).length;
  const only97 = records.filter((record) => !record.present_in_pr96 && record.present_in_pr97).length;
  assert.deepEqual([overlap, only96, only97], [89, 11, 11]);
  assert.deepEqual([manifest.counts.pr96, manifest.counts.pr97, manifest.counts.distinct], [100, 100, 111]);
  assert.equal(records.filter((record) => record.source_url_candidates.length > 0).length, 20);
});

test('Research candidates cannot be treated as publication-approved profiles', () => {
  for (const record of records) {
    assert.equal(record.public_claim_approved, false, record.registration_id);
    assert.equal(record.source_review_required, true, record.registration_id);
    assert.equal(record.source_url_candidates.length, new Set(record.source_url_candidates).size);
    assert.ok(record.imported_name.length > 0);
    assert.ok(record.present_in_pr96 || record.present_in_pr97);
    if (record.pr96_public_evidence_url) {
      assert.ok(record.present_in_pr96);
      assert.ok(record.source_url_candidates.includes(record.pr96_public_evidence_url));
    }
    if (record.pr97_public_source_url) {
      assert.ok(record.present_in_pr97);
      assert.ok(record.source_url_candidates.includes(record.pr97_public_source_url));
    }
  }
});
