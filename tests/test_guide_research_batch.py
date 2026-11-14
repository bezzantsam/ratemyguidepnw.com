import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('batch', ROOT / 'scripts/guide_research_batch.py')
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


class ResearchBatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'lib').mkdir()
        (self.root / 'lib/oregon-guides.json').write_text(json.dumps([
            {'registration': 'OG.001', 'name': 'One', 'business': 'A', 'website': 'one.example.com'},
            {'registration': 'OG.002', 'name': 'Two', 'business': 'B', 'website': 'two.example.com'},
            {'registration': 'OG.003', 'name': 'Three', 'business': 'B', 'website': None},
            {'registration': 'OG.004', 'name': 'Four', 'business': 'C', 'website': 'four.example.com'},
            {'registration': 'OG.005', 'name': 'Five', 'business': 'D', 'website': 'five.example.com'},
        ]))
        (self.root / 'lib/guide-enrichment.json').write_text(json.dumps({
            'OG.002': {'searchAliases': [], 'advertisedWaters': []}
        }))

    def test_next_batches_skip_enriched_and_use_stable_cursor(self):
        first = batch.make_batch(self.root, limit=2)
        self.assertEqual([x['directory_id'] for x in first['records']], ['OG.001', 'OG.004'])
        self.assertEqual(first['counts']['unenriched_website_candidates'], 3)
        self.assertEqual(first['counts']['eligible_from_cursor'], 3)
        self.assertEqual(first['next_after'], 'OG.004')
        second = batch.make_batch(self.root, after=first['next_after'])
        self.assertEqual([x['directory_id'] for x in second['records']], ['OG.005'])

    def test_exclusions_and_exhaustion(self):
        result = batch.make_batch(self.root, excluded_ids={'OG.001', 'OG.005'})
        self.assertEqual([r['directory_id'] for r in result['records']], ['OG.004'])
        self.assertEqual(result['counts']['excluded_in_progress'], 2)
        self.assertEqual(batch.make_batch(self.root, after='OG.005')['records'], [])

    def test_unknown_cursor_and_exclusions_fail_closed(self):
        for kwargs in ({'after': 'OG.099'}, {'excluded_ids': {'OG.099'}},
                       {'limit': 0}, {'limit': 101}):
            with self.assertRaises(ValueError):
                batch.make_batch(self.root, **kwargs)

    def test_source_files_are_immutable_and_not_verification(self):
        before = batch.sha256(self.root / 'lib/guide-enrichment.json')
        result = batch.make_batch(self.root)
        self.assertEqual(before, batch.sha256(self.root / 'lib/guide-enrichment.json'))
        self.assertTrue(all(r['website_verified'] is False and
                            r['publication_status'] == 'research_only'
                            for r in result['records']))
        self.assertIn('syntax-checked only', result['warning'])
        self.assertIn('pending_review', batch.markdown(result))

    def test_exclusion_file_rejects_malformed_and_duplicates(self):
        path = self.root / 'exclude.json'
        for bad in ('{}', '[1]', '["OG.001", "OG.001"]'):
            path.write_text(bad)
            with self.assertRaises(ValueError):
                batch.load_exclusions(path)
        path.write_text('["OG.001"]')
        self.assertEqual(batch.load_exclusions(path), {'OG.001'})

    def test_directory_duplicate_ids_fail(self):
        path = self.root / 'lib/oregon-guides.json'
        records = json.loads(path.read_text())
        records.append(records[0])
        path.write_text(json.dumps(records))
        with self.assertRaises(ValueError):
            batch.make_batch(self.root)


if __name__ == '__main__':
    unittest.main()
