import json
import subprocess
import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts import wa_review_intake as intake


class WashingtonReviewIntakeTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.today = date(2026, 11, 19)
        receipts = {}
        for name in intake.RECEIPTS:
            fake = f'Synthetic receipt for {name}'.encode()
            (self.root / name).write_bytes(fake)
            receipts[name] = intake.digest(fake)
        lib = intake.REPO / 'lib'
        self.packet = {
            'schema': 'wa-review-intake/v1',
            'candidate': {
                'source_id': 'wa-900001', 'legal_name': 'Synthetic Person Pilot',
                'business': 'Synthetic Pilot Outfit', 'credential_id': 'SYNTHETIC-NOT-A-LICENSE',
                'credential_type': 'Synthetic guide credential',
            },
            'catalog_sha256': {
                'washington_raw': intake.digest((lib / 'washington-raw.json').read_bytes()),
                'washington_ids': intake.digest((lib / 'washington-stable-ids.json').read_bytes()),
                'oregon_registry': intake.digest((lib / 'oregon-guides.json').read_bytes()),
            },
            'issuer': {
                'authority': 'WDFW', 'status': 'active', 'confirmed_on': '2026-11-18',
                'valid_through': '2026-12-31',
            },
            'owner_review': {
                'reviewer': 'Synthetic Intake Owner', 'checked_on': self.today.isoformat(),
                'collision_counts': dict.fromkeys(intake.COLLISION_SCOPES, 0),
            },
            'receipt_sha256': receipts,
        }
        self.decision = {
            'reviewer': 'Synthetic Independent Reviewer', 'checked_on': self.today.isoformat(),
            'decision': 'eligible_for_pilot_design',
        }

    def write_bundle(self):
        packet_bytes = json.dumps(self.packet).encode()
        (self.root / 'packet.json').write_bytes(packet_bytes)
        decision = {**self.decision, 'packet_sha256': intake.digest(packet_bytes)}
        (self.root / 'decision.json').write_text(json.dumps(decision))

    def assert_held(self, code):
        self.write_bundle()
        with self.assertRaisesRegex(intake.Hold, f'^{code}$'):
            intake.validate_packet(self.root, self.today)

    def test_complete_prospective_bundle_returns_only_status_hash_and_hold_count(self):
        self.write_bundle()
        expected_hash = intake.digest((self.root / 'packet.json').read_bytes())
        self.assertEqual(intake.validate_packet(self.root, self.today), {
            'status': 'structurally_complete_for_pilot_design',
            'packet_sha256': expected_hash,
            'historical_holds': 158,
        })

    def test_held_allocations_and_unallocated_historical_slots_are_rejected(self):
        for prior_id in ('wa-001', 'wa-158', 'wa-162', 'wa-163'):
            with self.subTest(source_id=prior_id):
                self.packet['candidate']['source_id'] = prior_id
                self.assert_held('new_source_id')

    def test_a_wa_name_or_an_oregon_business_stops_allocation_without_assigning_identity(self):
        lib = intake.REPO / 'lib'
        wa = json.loads((lib / 'washington-raw.json').read_bytes())[0]
        self.packet['candidate']['legal_name'] = wa['name'].swapcase()
        self.assert_held('possible_existing_identity')
        self.packet['candidate']['legal_name'] = 'Synthetic Person Pilot'
        or_rows = json.loads((lib / 'oregon-guides.json').read_bytes())
        self.packet['candidate']['business'] = next(row['business'] for row in or_rows if row.get('business'))
        self.assert_held('possible_existing_identity')

    def test_backend_uuid_and_multiple_candidates_are_rejected(self):
        self.packet['candidate']['guide_id'] = '00000000-0000-4000-8000-000000000001'
        self.assert_held('candidate_fields')
        self.packet['candidate'] = [self.packet['candidate'], self.packet['candidate']]
        self.assert_held('candidate_fields')

    def test_receipt_and_catalog_hash_fail_closed_if_changed(self):
        self.write_bundle()
        (self.root / 'operator-confirmation').write_text('Changed evidence')
        with self.assertRaisesRegex(intake.Hold, '^receipt_digest$'):
            intake.validate_packet(self.root, self.today)
        self.packet['catalog_sha256']['washington_ids'] = '0' * 64
        self.assert_held('catalog_changed')

    def test_unavailable_or_expired_issuance_is_held(self):
        self.packet['issuer']['valid_through'] = '2026-11-18'
        self.assert_held('issuer_confirmation')
        self.packet['issuer']['valid_through'] = '2026-12-31'
        self.packet['issuer']['status'] = 'pending'
        self.assert_held('issuer_confirmation')

    def test_missing_checks_and_positive_collision_cannot_advance(self):
        counts = self.packet['owner_review']['collision_counts']
        for scope in intake.COLLISION_SCOPES:
            with self.subTest(scope=scope):
                counts.pop(scope)
                self.assert_held('collision_not_cleared')
                counts[scope] = 1
                self.assert_held('collision_not_cleared')
                counts[scope] = 0

    def test_decision_is_independent_and_packet_bound(self):
        self.decision['reviewer'] = 'SYNTHETIC INTAKE OWNER'
        self.assert_held('independent_review')
        self.decision['reviewer'] = 'Synthetic Independent Reviewer'
        self.write_bundle()
        with (self.root / 'packet.json').open('ab') as f:
            f.write(b'\n')
        with self.assertRaisesRegex(intake.Hold, '^independent_review$'):
            intake.validate_packet(self.root, self.today)

    def test_missing_source_receipt_cli_output_does_not_echo_packet_data(self):
        self.write_bundle()
        (self.root / 'issuer-proof').unlink()
        result = subprocess.run(
            ['python3', str(intake.REPO / 'scripts/wa_review_intake.py'), str(self.root)],
            capture_output=True, text=True, check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')
        self.assertEqual(json.loads(result.stderr)['status'], 'held')
        self.assertNotIn('SYNTHETIC-NOT-A-LICENSE', result.stderr)


if __name__ == '__main__':
    unittest.main()
