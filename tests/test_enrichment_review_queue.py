"""Offline intake tests. Synthetic identities and domains only; no network or publication."""
import copy
from datetime import date
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('review_queue', ROOT / 'scripts/enrichment_review_queue.py')
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'lib').mkdir()
        (self.root / 'research-drafts').mkdir()
        (self.root / 'lib/oregon-guides.json').write_text(json.dumps([
            {'registration': f'OG.{i:07}', 'name': f'Guide {i}', 'website': 'https://example.org'}
            for i in range(1, 5)]))
        (self.root / 'lib/washington-raw.json').write_text('[]')
        (self.root / 'lib/washington-stable-ids.json').write_text('{}')
        (self.root / 'lib/guide-enrichment.json').write_text('{}')
        self.fixed_day = date(2026, 11, 14)

    def claim(self, num=1, value='Rogue River', source_id='source01', url='https://example.org/fishing'):
        return {'directory_id': f'OG.{num:07}', 'publication_status': 'pending_review',
                'sources': [{'id': source_id, 'url': url, 'source_type': 'operator_site',
                             'observed_on': '2026-11-14'}],
                'aliases': [], 'waterways': [{'value': value, 'source_ids': [source_id]}]}

    def batch(self, name, *records):
        path = self.root / 'research-drafts' / name
        path.write_text(json.dumps({'schema_version': 1, 'records': list(records)}))
        return path

    def build(self, paths, holds=None, **kwargs):
        return q.build_queue(paths, root=self.root, holds=holds, today=self.fixed_day, **kwargs)

    def test_two_distinct_submissions_stay_pending_without_mutating_directory(self):
        first = self.batch('one.json', self.claim(1))
        second = self.batch('two.json', self.claim(2, value='Columbia River'))
        baseline = q.digest(self.root / 'lib/guide-enrichment.json')
        result = self.build([first, second])
        self.assertEqual(result['counts']['pending_human_source_review'], 2)
        self.assertTrue(all(r['status'] == 'pending_human_source_review' for r in result['records']))
        self.assertEqual(result['records'][0]['proposed_additions']['waterways'][0]['value'], 'Rogue River')
        self.assertEqual(baseline, q.digest(self.root / 'lib/guide-enrichment.json'))

    def test_duplicate_same_evidence_held_despite_source_id_and_order_changes(self):
        one = self.claim(1)
        two = self.claim(1, source_id='some-other-reference')
        result = self.build([self.batch('a.json', one), self.batch('b.json', two)])
        item = result['records'][0]
        self.assertEqual(item['status'], 'duplicate_submission')
        self.assertIsNone(item['proposed_additions'])
        self.assertEqual(result['counts']['pending_human_source_review'], 0)

    def test_conflict_in_waterway_claims_is_explicit_and_not_merged(self):
        result = self.build([self.batch('a.json', self.claim()),
                             self.batch('b.json', self.claim(value='Columbia River'))])
        self.assertEqual(result['records'][0]['status'], 'conflicting_submissions')
        self.assertEqual(result['counts']['conflicting_submissions'], 1)
        self.assertIsNone(result['records'][0]['sources'])

    def test_invalid_claim_does_not_gain_human_review_status(self):
        bad = self.claim()
        bad['waterways'][0]['source_ids'] = ['nonexistent']
        result = self.build([self.batch('bad.json', bad)])
        self.assertEqual(result['records'][0]['status'], 'invalid_schema')
        self.assertTrue(result['records'][0]['submissions'][0]['validation_errors'])

    def test_holds_block_included_claim_and_can_track_research_only_records(self):
        path = self.batch('one.json', self.claim())
        holds = {'OG.0000001': [{'reason_code': 'identity_unresolved', 'reason': 'Conflicting registered name'}],
                 'OG.0000002': [{'reason_code': 'website_security_unverified', 'reason': 'Possible domain hijack'}]}
        result = self.build([path], holds=holds)
        self.assertEqual(result['counts']['manual_hold'], 1)
        self.assertEqual(result['counts']['manual_hold_no_claims'], 1)
        self.assertTrue(all(r['proposed_additions'] is None for r in result['records']))

    def test_hold_file_rejects_unknown_ids_codes_and_duplicates(self):
        good = {'schema_version': 1, 'holds': [{'directory_id': 'OG.0000001',
                     'reason_code': 'website_security_unverified', 'reason': 'Domain may be unsafe'}]}
        path = self.root / 'research-drafts/holds.json'
        path.write_text(json.dumps(good))
        self.assertEqual(len(q.load_holds(path, root=self.root)['OG.0000001']), 1)
        for mutate in (lambda d: d['holds'][0].update(directory_id='OG.9999999'),
                       lambda d: d['holds'][0].update(reason_code='approved'),
                       lambda d: d['holds'][0].update(reason_code=[]),
                       lambda d: d['holds'][0].update(reason=''),
                       lambda d: d['holds'].append(copy.deepcopy(d['holds'][0]))):
            item = copy.deepcopy(good)
            mutate(item)
            path.write_text(json.dumps(item))
            with self.assertRaises(ValueError):
                q.load_holds(path, root=self.root)

    def test_stale_baseline_prevents_intake(self):
        path = self.batch('one.json', self.claim())
        with self.assertRaisesRegex(ValueError, 'baseline SHA-256 has changed'):
            self.build([path], expected_baseline_sha256='0' * 64)

    def test_no_output_outside_ignored_directory_or_via_symlink(self):
        base = self.root / 'research-drafts'
        self.assertEqual(q._private_output(base / 'fresh.json', self.root), (base / 'fresh.json').resolve())
        with self.assertRaisesRegex(ValueError, 'Outputs must remain'):
            q._private_output(self.root / 'lib/guide-enrichment.json', self.root)
        (base / 'outbound').symlink_to(self.root / 'lib', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Outputs must remain'):
            q._private_output(base / 'outbound/guide-enrichment.json', self.root)

    def test_duplicate_batch_path_rejected(self):
        path = self.batch('one.json', self.claim())
        with self.assertRaisesRegex(ValueError, 'more than once'):
            self.build([path, path])

    def test_empty_handoff_and_unknown_guide_are_rejected(self):
        bad = self.batch('empty.json')
        with self.assertRaisesRegex(ValueError, '1 to 100'):
            self.build([bad])
        bad = self.batch('unknown.json', self.claim(num=999))
        result = self.build([bad])
        self.assertEqual(result['records'][0]['status'], 'invalid_schema')

    def test_same_filename_from_two_directories_is_rejected(self):
        first = self.batch('same.json', self.claim(1))
        other = self.root / 'other'
        other.mkdir()
        second = other / first.name
        second.write_text(json.dumps({'schema_version': 1, 'records': [self.claim(2)]}))
        with self.assertRaisesRegex(ValueError, 'basenames must be unique'):
            self.build([first, second])


if __name__ == '__main__':
    unittest.main()
