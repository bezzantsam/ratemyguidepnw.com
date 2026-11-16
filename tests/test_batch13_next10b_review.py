import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('next10b', ROOT / 'scripts/batch13_next10b_review.py')
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


class NextTenBReviewTests(unittest.TestCase):
    def setUp(self):
        self.review = json.loads(batch.REVIEW.read_text())
        self.selection = batch.SELECTION.read_bytes()
        self.registry = json.loads(batch.previous.REGISTRY.read_text())

    def validate(self):
        return batch.validate(self.review, self.selection, self.registry)

    def test_real_batch_counts_and_nonmutation(self):
        before = copy.deepcopy((self.review, self.selection, self.registry))
        result = self.validate()
        self.assertEqual((result['cumulative_checked'], result['remaining_unchecked']), (70, 41))
        self.assertEqual((result['source_pages'], result['candidate_fact_groups'], result['explicit_relationships']),
                         (14, 6, 10))
        self.assertEqual(result['counts_by_status']['source_supported_pending_editorial'], 4)
        self.assertEqual((self.review, self.selection, self.registry), before)

    def test_prior_checkpoint_cannot_be_rewritten(self):
        selection = json.loads(self.selection)
        selection['prior_review_files'][batch.PRIOR_REVIEW.name] = '0' * 64
        self.selection = json.dumps(selection).encode()
        with self.assertRaisesRegex(ValueError, 'checkpoint changed'):
            self.validate()

    def test_review_cannot_repeat_a_previously_checked_person(self):
        self.review['records'][0]['registration_id'] = 'OG.0001277'
        with self.assertRaisesRegex(ValueError, 'Review IDs differ'):
            self.validate()

    def test_historical_copy_and_identity_holds_cannot_supply_candidate_facts(self):
        for index in (2, 4, 6, 7, 8, 9):
            with self.subTest(index=index):
                self.setUp()
                self.review['records'][index]['facts'] = copy.deepcopy(self.review['records'][3]['facts'])
                with self.assertRaisesRegex(ValueError, 'Held record'):
                    self.validate()

    def test_archive_and_directory_sources_cannot_become_operator_claims(self):
        for sid in ('cornelison-home', 'home-identity'):
            with self.subTest(source=sid):
                self.setUp()
                self.review['records'][3]['facts'][0]['source_id'] = sid
                with self.assertRaisesRegex(ValueError, 'require operator evidence'):
                    self.validate()

    def test_ownership_and_original_registry_fields_stay_distinct(self):
        self.review['records'][1]['imported_name'] = 'Shannon Keys'
        with self.assertRaisesRegex(ValueError, 'Imported identity changed'):
            self.validate()
        self.setUp()
        self.review['records'][5]['imported_business'] = 'Mikoleits Guide Service'
        with self.assertRaisesRegex(ValueError, 'Imported identity changed'):
            self.validate()

    def test_no_river_inferred_from_boat_name_or_narrow_species_from_generic_group(self):
        lured = self.review['records'][3]['facts'][0]
        self.assertEqual(lured['advertised_waters'], [])
        self.assertEqual(lured['advertised_species'], [])
        self.assertEqual(lured['explicit_relationships'], [])
        mikoleit = self.review['records'][5]['facts'][1]
        self.assertIn('Crab', mikoleit['advertised_species'])
        self.assertNotIn('Dungeness Crab', mikoleit['advertised_species'])
        self.assertEqual(mikoleit['explicit_relationships'], [])
        lured['explicit_relationships'] = [{'waterway': 'Columbia River', 'species': 'Steelhead'}]
        with self.assertRaisesRegex(ValueError, 'crosses source fact boundaries'):
            self.validate()

    def test_approvals_and_false_closure_outcomes_are_rejected(self):
        self.review['records'][0]['publication_approved'] = True
        with self.assertRaisesRegex(ValueError, 'approval must remain false'):
            self.validate()
        self.setUp()
        self.review['records'][6]['failed_or_limited_fetches'][0]['result'] = 'business_closed'
        with self.assertRaisesRegex(ValueError, 'Unsubstantiated retrieval outcome'):
            self.validate()


if __name__ == '__main__':
    unittest.main()
