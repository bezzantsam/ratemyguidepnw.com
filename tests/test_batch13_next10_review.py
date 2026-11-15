import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('next10', ROOT / 'scripts/batch13_next10_review.py')
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


class NextTenReviewTests(unittest.TestCase):
    def setUp(self):
        self.review = json.loads(batch.REVIEW.read_text())
        self.selection = batch.SELECTION.read_bytes()
        self.registry = json.loads(batch.REGISTRY.read_text())

    def validate(self):
        return batch.validate(self.review, self.selection, self.registry)

    def test_real_batch_counts_and_no_input_mutation(self):
        before = copy.deepcopy((self.review, self.selection, self.registry))
        result = self.validate()
        self.assertEqual((result['source_pages'], result['candidate_fact_groups'], result['explicit_relationships']),
                         (14, 7, 8))
        self.assertEqual((result['cumulative_checked'], result['remaining_unchecked']), (60, 51))
        self.assertIs(result['publication_approved'], False)
        self.assertEqual((self.review, self.selection, self.registry), before)

    def test_held_information_cannot_become_candidate_facts(self):
        self.review['records'][0]['facts'] = copy.deepcopy(self.review['records'][4]['facts'])
        with self.assertRaisesRegex(ValueError, 'Held record'):
            self.validate()

    def test_registry_typo_and_person_identity_are_preserved(self):
        for field, replacement in [('registry_website', 'www.totalfisherman.com'),
                                   ('imported_name', 'Lacey DeWeert')]:
            with self.subTest(field=field):
                self.setUp()
                self.review['records'][7][field] = replacement
                with self.assertRaisesRegex(ValueError, 'Imported identity changed'):
                    self.validate()

    def test_duplicate_records_or_selection_tampering_fail(self):
        self.review['records'][1] = copy.deepcopy(self.review['records'][0])
        with self.assertRaisesRegex(ValueError, 'Review IDs'):
            self.validate()
        self.setUp()
        self.selection += b'\n'
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.validate()

    def test_missing_attribution_and_credentials_in_url_fail(self):
        self.review['sources']['casey-about']['locator'] = ''
        with self.assertRaisesRegex(ValueError, 'locator'):
            self.validate()
        self.setUp()
        self.review['sources']['casey-about']['url'] = 'https://user:secret@example.test/'
        with self.assertRaisesRegex(ValueError, 'credentials'):
            self.validate()
        self.setUp()
        self.review['records'][9]['facts'][1]['source_id'] = 'unknown'
        with self.assertRaisesRegex(ValueError, 'Unknown source'):
            self.validate()

    def test_summer_fly_fishing_cannot_transfer_to_winter_steelhead(self):
        winter = self.review['records'][8]['facts'][0]
        winter['explicit_relationships'][0]['method'] = 'Fly fishing'
        with self.assertRaisesRegex(ValueError, 'crosses source fact boundaries'):
            self.validate()

    def test_new_candidate_fields_and_approval_flags_fail(self):
        self.review['records'][4]['facts'][0]['verified_license'] = True
        with self.assertRaisesRegex(ValueError, 'Unexpected candidate field'):
            self.validate()
        self.setUp()
        self.review['policy']['publication_approved'] = True
        with self.assertRaisesRegex(ValueError, 'must remain false'):
            self.validate()
        self.setUp()
        self.review['records'][4]['identity']['legal_identity_verified'] = True
        with self.assertRaisesRegex(ValueError, 'approval must remain false'):
            self.validate()

    def test_inflated_completion_count_fails(self):
        self.review['scope']['cumulative_checked'] = 111
        with self.assertRaisesRegex(ValueError, 'counts'):
            self.validate()


if __name__ == '__main__':
    unittest.main()
