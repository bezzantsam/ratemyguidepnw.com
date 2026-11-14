"""Research assignment ledger regression tests. No network, real guides, or publication."""
from datetime import date
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import research_batch_tracker as t
from guide_research_batch import make_batch
from enrichment_handoff import digest


class AssignmentLedgerTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        (self.root / 'lib').mkdir()
        (self.root / 'research-drafts').mkdir()
        self.ids = ['OG.0000100', 'OG.0000102', 'OG.0009000', 'OG.0000088', 'OG.0000110']
        (self.root / 'lib/oregon-guides.json').write_text(json.dumps([
            {'registration': ident, 'name': 'Guide ' + str(i), 'business': 'Example Guide ' + str(i),
             'website': 'https://example' + str(i) + '.org'}
            for i, ident in enumerate(self.ids)]))
        (self.root / 'lib/washington-raw.json').write_text('[]')
        (self.root / 'lib/washington-stable-ids.json').write_text('{}')
        (self.root / 'lib/guide-enrichment.json').write_text('{}')
        self.ledger = t.empty(self.root)

    def assign(self, ids, batch_id='01', after=None):
        return t.assign(self.ledger, batch_id=batch_id, ids=ids, after=after,
                        assigned_on='2026-11-14', root=self.root)

    def handoff(self):
        return {'schema_version': 1, 'records': [{
            'directory_id': self.ids[0], 'publication_status': 'pending_review',
            'sources': [{'id': 's1', 'url': 'https://example0.org/fishing',
                         'source_type': 'operator_site', 'observed_on': '2026-11-14'}],
            'aliases': [], 'waterways': [{'value': 'Sandy River', 'source_ids': ['s1']}]}]}

    def files_for_return(self, handoff, holds):
        a = self.root / 'research-drafts/incoming.json'
        b = self.root / 'research-drafts/holds.json'
        a.write_text(json.dumps(handoff))
        b.write_text(json.dumps({'schema_version': 1, 'holds': holds}))
        return a, b

    def test_new_tracker_is_unverified_and_finds_first_15_in_import_order(self):
        self.assertEqual(self.ledger['revision'], 0)
        batch = t.next_batch(self.ledger, root=self.root)
        self.assertEqual([r['directory_id'] for r in batch['records']], self.ids)
        self.assertEqual(batch['next_after'], 'OG.0000110')
        self.assertEqual(t.status(self.ledger, root=self.root)['remaining_unassigned_website_candidates'], 5)

    def test_historical_assignment_is_explicitly_unattested_and_blocks_overlap(self):
        self.ledger = self.assign(self.ids[:2])
        self.assertEqual(self.ledger['batches'][0]['source'], 'historical_prompt')
        self.assertIsNone(self.ledger['batches'][0]['manifest_sha256'])
        self.assertEqual(t.next_batch(self.ledger, root=self.root)['records'][0]['directory_id'], self.ids[2])
        with self.assertRaisesRegex(ValueError, 'already assigned'):
            self.assign([self.ids[1]], batch_id='02')
        with self.assertRaisesRegex(ValueError, 'distinct'):
            self.assign([self.ids[2]])

    def test_numeric_order_is_not_import_order(self):
        self.ledger = self.assign([self.ids[2], self.ids[3]])
        self.assertEqual(self.ledger['batches'][0]['next_after'], 'OG.0000088')
        self.assertEqual(t.next_batch(self.ledger, root=self.root)['records'][0]['directory_id'], self.ids[4])
        with self.assertRaisesRegex(ValueError, 'directory order'):
            t.assign(t.empty(self.root), batch_id='02', ids=[self.ids[3], self.ids[2]], after=None, assigned_on='2026-11-14', root=self.root)

    def test_manifest_reservation_uses_current_source_fingerprints_and_exclusions(self):
        p = self.root / 'research-drafts/manifest.json'
        p.write_text(json.dumps(make_batch(self.root, limit=2)))
        self.ledger = t.reserve(self.ledger, p, '01', '2026-11-14', root=self.root)
        self.assertEqual(self.ledger['batches'][0]['source'], 'validated_manifest')
        self.assertEqual(self.ledger['batches'][0]['manifest_sha256'], digest(p))
        with self.assertRaisesRegex(ValueError, 'eligible'):
            t.reserve(self.ledger, p, '02', '2026-11-14', root=self.root)
        (self.root / 'lib/guide-enrichment.json').write_text('{"OG.0000100":{}}')
        with self.assertRaisesRegex(ValueError, 'stale'):
            t.reserve(t.empty(self.root), p, '03', '2026-11-14', root=self.root)

    def test_complete_return_counts_claims_and_explicit_holds_without_publishing(self):
        self.ledger = self.assign(self.ids[:2])
        before = digest(self.root / 'lib/guide-enrichment.json')
        p, h = self.files_for_return(self.handoff(), [{
            'directory_id': self.ids[1], 'reason_code': 'identity_unresolved',
            'reason': 'Registered identity not linked to operator'}])
        result = t.returned(self.ledger, batch_id='01', handoff_path=p, holds_path=h,
                            root=self.root, today=date(2026, 11, 14))
        self.assertEqual(result['batches'][0]['state'], 'returned_for_schema_review')
        self.assertEqual(result['batches'][0]['claim_records'], 1)
        self.assertEqual(result['batches'][0]['held_directory_ids'], [self.ids[1]])
        self.assertEqual(t.status(result, root=self.root)['guides_returned_for_schema_review'], 2)
        self.assertEqual(before, digest(self.root / 'lib/guide-enrichment.json'))
        with self.assertRaisesRegex(ValueError, 'still be assigned'):
            t.returned(result, batch_id='01', handoff_path=p, holds_path=h, root=self.root)

    def test_missing_or_overlapping_returns_cannot_be_marked_complete(self):
        self.ledger = self.assign(self.ids[:2])
        p, h = self.files_for_return(self.handoff(), [])
        with self.assertRaisesRegex(ValueError, 'accounted for once'):
            t.returned(self.ledger, batch_id='01', handoff_path=p, holds_path=h, root=self.root)
        p, h = self.files_for_return(self.handoff(), [{
            'directory_id': self.ids[0], 'reason_code': 'identity_unresolved',
            'reason': 'Already in the proposed claim'}])
        with self.assertRaisesRegex(ValueError, 'accounted for once'):
            t.returned(self.ledger, batch_id='01', handoff_path=p, holds_path=h, root=self.root)

    def test_all_held_may_return_with_explicitly_empty_handoff(self):
        self.ledger = self.assign(self.ids[:1])
        p, h = self.files_for_return({'schema_version': 1, 'records': []}, [{
            'directory_id': self.ids[0], 'reason_code': 'source_unreachable',
            'reason': 'No independent source claims available'}])
        outcome = t.returned(self.ledger, batch_id='01', handoff_path=p, holds_path=h, root=self.root)
        self.assertEqual(outcome['batches'][0]['claim_records'], 0)
        self.assertEqual(outcome['batches'][0]['state'], 'returned_for_schema_review')

    def test_invalid_handoff_does_not_mark_returned(self):
        self.ledger = self.assign(self.ids[:1])
        bad = self.handoff()
        bad['records'][0]['sources'][0]['url'] = 'http://not-verified.example.org'
        p, h = self.files_for_return(bad, [])
        with self.assertRaisesRegex(ValueError, 'schema validation'):
            t.returned(self.ledger, batch_id='01', handoff_path=p, holds_path=h,
                       root=self.root, today=date(2026, 11, 14))
        self.assertEqual(self.ledger['batches'][0]['state'], 'assigned')

    def test_old_ledger_refuses_changed_directory_and_duplicate_assignments(self):
        self.ledger = self.assign(self.ids[:1])
        path = t.write_new(self.root / 'research-drafts/tracker.json', self.ledger, root=self.root)
        self.assertEqual(t.load(path, root=self.root)['revision'], 1)
        tampered = json.loads(path.read_text())
        tampered['batches'].append({**tampered['batches'][0], 'batch_id': '02'})
        tampered['revision'] = 2  # reach duplicate-assignment invariant after satisfying revision count
        path.write_text(json.dumps(tampered))
        with self.assertRaisesRegex(ValueError, 'duplicate assignments'):
            t.load(path, root=self.root)
        path.write_text(json.dumps(self.ledger))
        (self.root / 'lib/oregon-guides.json').write_text('[]')
        with self.assertRaisesRegex(ValueError, 'Directory changed'):
            t.load(path, root=self.root)

    def test_private_output_refuses_public_paths_symlink_escape_and_overwrite(self):
        with self.assertRaisesRegex(ValueError, 'research-drafts'):
            t.write_new(self.root / 'lib/guide-enrichment.json', self.ledger, root=self.root)
        (self.root / 'research-drafts/link').symlink_to(self.root / 'lib', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'research-drafts'):
            t.write_new(self.root / 'research-drafts/link/public.json', self.ledger, root=self.root)
        p = self.root / 'research-drafts/okay.json'
        t.write_new(p, self.ledger, root=self.root)
        with self.assertRaises(FileExistsError):
            t.write_new(p, self.ledger, root=self.root)

    def test_latest_cursor_is_based_on_import_position_not_id_sort(self):
        a = self.assign(self.ids[:2])
        self.ledger = t.assign(a, batch_id='02', ids=self.ids[2:4], after=self.ids[1],
                               assigned_on='2026-11-14', root=self.root)
        batch = t.next_batch(self.ledger, root=self.root)
        self.assertEqual([r['directory_id'] for r in batch['records']], [self.ids[4]])
        s = t.status(self.ledger, root=self.root)
        self.assertEqual(s['guides_assigned'], 4)
        self.assertEqual(s['guides_assigned_not_returned'], 4)
        self.assertEqual(s['remaining_unassigned_website_candidates'], 1)


if __name__ == '__main__':
    unittest.main()
