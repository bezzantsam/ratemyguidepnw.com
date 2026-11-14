import copy
from datetime import date
import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('handoff', ROOT / 'scripts/enrichment_handoff.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)


def batch():
    return {'schema_version': 1, 'records': [{
        'directory_id': 'OG.0003790', 'publication_status': 'pending_review',
        'sources': [{'id': 'official', 'url': 'https://www.igotcrabs.net/bandit-guide-service',
                     'source_type': 'operator_site', 'observed_on': '2026-11-14'}],
        'aliases': [{'value': 'Billy the Beach Bandit', 'source_ids': ['official']}], 'waterways': []}]}


class HandoffTests(unittest.TestCase):
    def validate(self, data):
        return h.validate_handoff(data, today=date(2026, 11, 14))

    def test_valid_batch_is_staged_without_mutating_inputs_or_directory(self):
        data = batch()
        before = copy.deepcopy(data)
        file = ROOT / 'lib/guide-enrichment.json'
        fingerprint = h.digest(file)
        result = self.validate(data)
        self.assertTrue(result['valid'])
        self.assertEqual(result['records'][0]['status'], 'pending_human_source_review')
        self.assertEqual(result['records'][0]['publication_status'], 'pending_review')
        self.assertEqual(data, before)
        self.assertEqual(h.digest(file), fingerprint)

    def test_unmatched_duplicates_and_credential_fields_are_rejected(self):
        for field, value in [('directory_id', None), ('directory_id', 'OG.9999999'),
                             ('publication_status', 'approved'), ('credentials', 'licensed')]:
            data = batch()
            data['records'][0][field] = value
            self.assertFalse(self.validate(data)['valid'])
        data = batch()
        data['records'].append(copy.deepcopy(data['records'][0]))
        self.assertFalse(self.validate(data)['valid'])

    def test_claim_sources_dates_and_links_are_required(self):
        for key, value in [('url', 'javascript:alert(1)'), ('url', 'https://user:pw@example.com'),
                           ('observed_on', '2030-01-01'), ('observed_on', '2026-02-30'),
                           ('source_type', 'third_party_trip_reports')]:
            data = batch()
            data['records'][0]['sources'][0][key] = value
            self.assertFalse(self.validate(data)['valid'])
        data = batch()
        data['records'][0]['aliases'][0]['source_ids'] = ['missing']
        self.assertFalse(self.validate(data)['valid'])

    def test_existing_claims_are_not_counted_as_new(self):
        data = batch()
        data['records'][0]['aliases'][0]['value'] = 'Bandit Guide Service'
        result = self.validate(data)
        self.assertTrue(result['valid'])
        self.assertEqual(result['records'][0]['proposed_additions']['aliases'], [])

    def test_malformed_rows_report_errors_instead_of_crashing(self):
        for field, value in [('sources', None), ('aliases', [None]), ('aliases', [{'value': [], 'source_ids': []}]),
                             ('waterways', 'Buoy 10')]:
            data = batch()
            data['records'][0][field] = value
            self.assertFalse(self.validate(data)['valid'])

    def test_inventory_keeps_candidates_distinct_from_verified_websites(self):
        result = h.inventory()
        self.assertGreater(result['counts']['enriched_profiles'], 0)
        self.assertLessEqual(result['counts']['profiles_with_waterways'], result['counts']['enriched_profiles'])
        self.assertLess(result['counts']['oregon_website_candidates'], result['counts']['oregon_nonempty_website_fields'])
        for bad in ['none', 'na', 'person@example.com', 'Team Hook-up guide services']:
            self.assertIsNone(h.website_candidate(bad))
        self.assertEqual(h.website_candidate('www.example.com'), 'https://www.example.com')

    def test_cli_cannot_overwrite_public_data(self):
        file = ROOT / 'lib/guide-enrichment.json'
        before = h.digest(file)
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/enrichment_handoff.py'), 'inventory',
                                 '--output', str(file)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Outputs must stay under research-drafts', result.stderr)
        self.assertEqual(before, h.digest(file))


if __name__ == '__main__':
    unittest.main()
