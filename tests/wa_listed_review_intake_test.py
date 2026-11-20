import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from scripts import wa_listed_review_intake as listed
from scripts import wa_review_intake as intake


class WashingtonListedIntakeTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.folder = Path(tmp.name)
        self.as_of = date(2026, 11, 19)
        self.row = {'name': 'Synthetic Holder', 'business': 'Synthetic Outfit',
                    'source': 'Fixture registry', 'notes': None}
        self.allocations = {listed.source_key(self.row): 'wa-901'}
        self.listing = listed.version('wa-901', [self.row], self.allocations)
        self.catalog = {'washington_raw': 'a'*64, 'washington_ids': 'b'*64, 'oregon_registry': 'c'*64}
        receipts = {}
        for name in intake.RECEIPTS:
            evidence = f'Synthetic {name}'.encode()
            (self.folder / name).write_bytes(evidence)
            receipts[name] = intake.digest(evidence)
        self.packet = {
            'schema': 'wa-listed-review-intake/v1',
            'listing': dict(self.listing),
            'catalog_sha256': dict(self.catalog),
            'identity_fingerprint': 'd'*64,
            'issuer': {'authority': 'WDFW', 'record_kind': 'issuer_identity_confirmation',
                       'confirmed_on': '2026-11-17'},
            'owner_review': {'reviewer': 'Synthetic Owner', 'checked_on': '2026-11-18',
                             'basis': 'issuer_and_operator_for_exact_listing',
                             'collision_counts': dict.fromkeys(listed.COLLISIONS, 0)},
            'receipt_sha256': receipts,
        }
        self.decision = {'reviewer': 'Synthetic Reviewer', 'checked_on': '2026-11-19',
                         'decision': 'eligible_for_listed_identity_proof'}

    def check(self):
        blob = json.dumps(self.packet).encode()
        (self.folder / 'packet.json').write_bytes(blob)
        (self.folder / 'decision.json').write_text(json.dumps(
            {**self.decision, 'packet_sha256': intake.digest(blob)}))
        with patch.object(listed, 'read_catalog', return_value=(self.listing, self.catalog)):
            return listed.validate_packet(self.folder, self.as_of)

    def held(self, reason):
        with self.assertRaisesRegex(intake.Hold, f'^{reason}$'):
            self.check()

    def test_one_exact_version_with_independent_evidence(self):
        result = self.check()
        self.assertEqual(result['status'], 'structurally_complete_for_listed_identity_proof')
        self.assertEqual(result['historical_holds'], 158)
        self.assertEqual(set(result), {'status', 'packet_sha256', 'historical_holds'})

    def test_catalog_coverage_matches_all_158_current_allocations(self):
        raw = json.loads((intake.REPO / 'lib/washington-raw.json').read_bytes())
        ids = json.loads((intake.REPO / 'lib/washington-stable-ids.json').read_bytes())
        keys = {listed.source_key(row) for row in raw}
        self.assertEqual(len(raw), len(keys))
        self.assertEqual((len(keys), len(ids), len(keys-set(ids))), (163, 158, 5))
        for source_id in ids.values():
            listed.version(source_id, raw, ids)

    def test_note_change_changes_full_version_even_with_the_same_key(self):
        changed = {**self.row, 'notes': 'Synthetic change'}
        result = listed.version('wa-901', [changed], self.allocations)
        self.assertEqual(result['source_key_sha256'], self.listing['source_key_sha256'])
        self.assertNotEqual(result['listing_sha256'], self.listing['listing_sha256'])
        self.packet['listing'] = result
        self.held('listing_version_changed')

    def test_absent_and_ambiguous_listing_keys_cannot_resolve(self):
        for rows, allocations, expected in [
            ([self.row], {}, 'listing_not_uniquely_allocated'),
            ([self.row], {**self.allocations, 'wrong': 'wa-901'}, 'listing_not_uniquely_allocated'),
            ([self.row, self.row], self.allocations, 'listing_source_not_unique'),
        ]:
            with self.subTest(reason=expected), self.assertRaisesRegex(intake.Hold, expected):
                listed.version('wa-901', rows, allocations)

    def test_name_only_or_conflicting_identity_cannot_advance(self):
        self.packet['owner_review']['basis'] = 'name_and_business_only'
        self.held('owner_review')
        self.packet['owner_review']['basis'] = 'issuer_and_operator_for_exact_listing'
        for scope in listed.COLLISIONS:
            self.packet['owner_review']['collision_counts'][scope] = 1
            self.held('collision_not_cleared')
            self.packet['owner_review']['collision_counts'][scope] = 0

    def test_stale_catalog_and_tampered_receipt_fail_closed(self):
        self.packet['catalog_sha256']['oregon_registry'] = '0'*64
        self.held('catalog_changed')
        self.packet['catalog_sha256'] = self.catalog
        (self.folder / 'issuer-proof').write_text('Altered synthetic evidence')
        self.held('receipt_digest')

    def test_no_historical_uuid_or_license_status_can_enter_packet(self):
        self.packet['guide_id'] = '00000000-0000-4000-8000-000000000001'
        self.held('listed_packet_fields')
        self.packet.pop('guide_id')
        self.packet['issuer']['license_verified'] = True
        self.held('issuer_confirmation')

    def test_same_reviewer_cannot_approve(self):
        self.decision['reviewer'] = 'SYNTHETIC OWNER'
        self.held('independent_review')


if __name__ == '__main__':
    unittest.main()
