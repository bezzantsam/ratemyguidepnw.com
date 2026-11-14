"""Synthetic fleet-source tests. This module does not approve real boats or crew."""
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
spec = importlib.util.spec_from_file_location('charter', ROOT / 'scripts/charter_fleet_research.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)

TODAY = date(2026, 11, 14)


def boat(name, captain, crew=(), url=None):
    return {
        'vessel_name': name, 'vessel_specs': "31' synthetic cabin cruiser",
        'captains': [{'name': captain, 'role': 'Captain'}],
        'deckhands': [{'name': person, 'role': 'Deckhand'} for person in crew],
        'source_url': url or 'https://example.org/boat',
        'date_checked': '2026-11-13',
    }


def source():
    return {'schema_version': '2026-11-13.v2', 'date_checked': '2026-11-13',
            'saltwater_charter_fleets': {
                'harbor_one': {
                    'directory_id': None, 'entity_type': 'saltwater_six_pack_charter',
                    'public_name': 'Harbor One Charters', 'conflicts_and_unresolved': [],
                    'vessels': [
                        boat('The Marlin', 'Captain Ada', ['Mate River', 'Mate Avery']),
                        boat('The Steelhead', 'Captain Theo', ['Mate River', 'Mate Avery']),
                    ],
                },
                'harbor_two': {
                    'directory_id': None, 'entity_type': 'saltwater_charter_outfitter',
                    'public_name': 'Harbor Two Outfitters',
                    'vessels': [
                        boat('Longline', 'Captain Theo', ['Mate River']),
                        boat('Shelter', 'Captain Lia', ['Mate Quinn']),
                    ],
                },
            }}


class CharterTests(unittest.TestCase):
    def normalize(self, value=None):
        return c.normalize(value or source(), today=TODAY)

    def test_shared_crew_is_outfitter_roster_not_vessel_assignment(self):
        x = self.normalize()
        self.assertEqual(x['counts']['fleets'], 2)
        self.assertEqual(x['counts']['vessels'], 4)
        self.assertEqual(x['counts']['fleet_only_crew_relationships'], 2)
        harbor = x['fleets'][0]
        self.assertEqual(len(harbor['outfitter_roster_only']), 2)
        self.assertEqual(harbor['vessels'][0]['crew_reported'], [])
        self.assertEqual(harbor['vessels'][1]['crew_reported'], [])
        self.assertTrue(all(p['relationship'] == 'outfitter_roster_only' for p in harbor['outfitter_roster_only']))
        self.assertTrue(all(p['individual_vessel_assignment_confirmed'] is False for p in harbor['outfitter_roster_only']))

    def test_single_boat_crew_remains_reported_but_unverified(self):
        second = self.normalize()['fleets'][1]
        self.assertEqual(second['vessels'][0]['crew_reported'][0]['name'], 'Mate River')
        self.assertEqual(second['vessels'][0]['crew_reported'][0]['relationship'], 'reported_vessel_crew')
        self.assertFalse(second['vessels'][0]['crew_reported'][0]['individual_vessel_assignment_confirmed'])
        self.assertEqual(second['outfitter_roster_only'], [])

    def test_a_person_on_two_boats_keeps_one_fleet_local_research_id(self):
        data = source()
        data['saltwater_charter_fleets']['harbor_one']['vessels'][1]['captains'][0]['name'] = 'Captain Ada'
        x = self.normalize(data)
        boats = x['fleets'][0]['vessels']
        self.assertEqual(boats[0]['captains_reported'][0]['research_person_id'],
                         boats[1]['captains_reported'][0]['research_person_id'])
        # Matching human names in different businesses must never generate a cross-fleet identity link.
        other_fleet_id = x['fleets'][1]['vessels'][0]['captains_reported'][0]['research_person_id']
        same_name_elsewhere = c._research_id('harbor_one', 'Captain Theo')
        self.assertNotEqual(other_fleet_id, same_name_elsewhere)

    def test_public_directory_unchanged_and_no_approval_or_credential_created(self):
        data = source()
        original = copy.deepcopy(data)
        result = self.normalize(data)
        self.assertEqual(original, data)
        self.assertEqual(result['mode'], 'offline_unverified_source_review')
        for fleet in result['fleets']:
            self.assertIsNone(fleet['public_directory_id'])
            self.assertEqual(fleet['publication_status'], 'pending_review')
            self.assertFalse(fleet['website_or_license_verified_by_importer'])
            for vessel in fleet['vessels']:
                self.assertEqual(vessel['publication_status'], 'pending_review')
                self.assertFalse(vessel['current_hull_verified'])
                self.assertFalse(vessel['evidence']['actual_source_contents_rechecked'])
                for person in vessel['captains_reported']+vessel['crew_reported']:
                    self.assertEqual(person['credential_status'], 'unknown')
                    self.assertFalse(person['identity_verified'])
        self.assertNotIn('"ratings":', json.dumps(result))
        self.assertNotIn('"reviews":', json.dumps(result))

    def test_new_public_registration_id_cannot_be_minted(self):
        data = source()
        data['saltwater_charter_fleets']['harbor_one']['directory_id'] = 'OG.0001234'
        with self.assertRaisesRegex(ValueError, 'matched public ID'):
            self.normalize(data)

    def test_no_ordinary_river_guide_can_enter_charter_fleet_contract(self):
        data = source()
        data['saltwater_charter_fleets']['harbor_one']['entity_type'] = 'river_guide'
        with self.assertRaisesRegex(ValueError, 'only saltwater charter fleets'):
            self.normalize(data)

    def test_vessel_source_requires_complete_https_and_real_date(self):
        for url in ('http://example.org/boat','javascript:alert(1)',
                    'https://user:pass@example.org/boat','https://example.com invalid'):
            data = source()
            data['saltwater_charter_fleets']['harbor_one']['vessels'][0]['source_url'] = url
            with self.assertRaises(ValueError, msg=url):
                self.normalize(data)
        data = source()
        data['saltwater_charter_fleets']['harbor_one']['vessels'][0]['date_checked'] = '2027-08-01'
        with self.assertRaisesRegex(ValueError, 'future'):
            self.normalize(data)

    def test_missing_captain_name_or_duplicate_vessel_fails_closed(self):
        data = source()
        data['saltwater_charter_fleets']['harbor_one']['vessels'][0]['captains'] = []
        with self.assertRaisesRegex(ValueError, 'named captain'):
            self.normalize(data)
        data = source()
        data['saltwater_charter_fleets']['harbor_one']['vessels'][1]['vessel_name'] = 'The Marlin'
        with self.assertRaisesRegex(ValueError, 'duplicate vessel name'):
            self.normalize(data)

    def test_a_person_cannot_be_captain_and_crew_on_same_boat(self):
        data = source()
        data['saltwater_charter_fleets']['harbor_one']['vessels'][0]['deckhands'].append(
            {'name':'Captain Ada','role':'Mate'})
        with self.assertRaisesRegex(ValueError, 'both crew and captain'):
            self.normalize(data)

    def test_unknown_source_schema_refused_instead_of_silently_coerced(self):
        data = source()
        data['schema_version'] = '2026-11-14.v3'
        with self.assertRaisesRegex(ValueError, 'known Gemini handoff version'):
            self.normalize(data)

    def test_private_output_path_cannot_escape_research_drafts(self):
        with tempfile.TemporaryDirectory() as root_str:
            root = Path(root_str)
            (root/'research-drafts').mkdir()
            (root/'lib').mkdir()
            self.assertEqual(c._private_output(root/'research-drafts/review.json', root),
                             (root/'research-drafts/review.json').resolve())
            with self.assertRaisesRegex(ValueError, 'Outputs must remain'):
                c._private_output(root/'lib/guide-enrichment.json', root)
            (root/'research-drafts/to_public').symlink_to(root/'lib', target_is_directory=True)
            with self.assertRaisesRegex(ValueError, 'Outputs must remain'):
                c._private_output(root/'research-drafts/to_public/review.json', root)


if __name__ == '__main__':
    unittest.main()
