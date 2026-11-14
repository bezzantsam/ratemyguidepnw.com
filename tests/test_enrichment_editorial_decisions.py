"""Strict claim decisions: offline tests with synthetic evidence and no publication."""
from copy import deepcopy
from datetime import date
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('editorial', ROOT / 'scripts/enrichment_editorial_decisions.py')
ed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ed)
from enrichment_review_queue import build_queue

TODAY = date(2026, 11, 14)


class EditorialTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        (self.root / 'lib').mkdir()
        (self.root / 'research-drafts').mkdir()
        (self.root / 'lib/oregon-guides.json').write_text(json.dumps([
            {'registration': 'OG.0000001', 'name': 'First Guide', 'website': 'https://example.org'},
            {'registration': 'OG.0000002', 'name': 'Second Guide', 'website': 'https://example.net'},
        ]))
        (self.root / 'lib/washington-raw.json').write_text('[]')
        (self.root / 'lib/washington-stable-ids.json').write_text('{}')
        (self.root / 'lib/guide-enrichment.json').write_text('{}')
        self.batch_path = self.root / 'research-drafts/one.json'
        self.batch_path.write_text(json.dumps({'schema_version': 1, 'records': [{
            'directory_id': 'OG.0000001', 'publication_status': 'pending_review',
            'sources': [{'id': 'first', 'url': 'https://example.org/about',
                         'source_type': 'operator_site', 'observed_on': '2026-11-14'}],
            'aliases': [{'value': 'First Guide LLC', 'source_ids': ['first']}],
            'waterways': [{'value': 'Sandy River', 'source_ids': ['first']}]
        }]}))
        self.queue = build_queue([self.batch_path], root=self.root, today=TODAY)
        self.queue_path = self.root / 'research-drafts/queue.json'
        self.queue_path.write_text(json.dumps(self.queue, indent=2))
        self.loaded, self.queue_sha = ed.load_queue(self.queue_path, root=self.root)
        self.template = ed.prepare_template(self.loaded, self.queue_sha)

    def ready(self, claim):
        claim['decision'] = 'approve_for_proposal'
        claim['selected_source_id'] = claim['source_ids'][0]
        claim['reviewer'] = 'Human reviewer'
        claim['reviewed_on'] = '2026-11-14'
        claim['note'] = 'Opened operator page and confirmed this exact claim.'
        claim['checks'] = {'source_content': True, 'operator_identity': True,
                           'publication_rights': True}

    def evaluate(self, submission):
        return ed.evaluate_decisions(self.loaded, self.template, submission, today=TODAY)

    def test_template_never_auto_approves_claims(self):
        self.assertEqual(len(self.template['claims']), 2)
        self.assertEqual(self.template['queue_sha256'], self.queue_sha)
        self.assertTrue(all(x['decision'] == 'unreviewed' for x in self.template['claims']))
        self.assertTrue(all(not any(x['checks'].values()) for x in self.template['claims']))
        result = self.evaluate(deepcopy(self.template))
        self.assertEqual(result['candidate_additions'], {})
        self.assertEqual(result['decision_counts']['unreviewed'], 2)

    def test_explicit_review_builds_unpublished_proposal_with_provenance(self):
        original = ed.digest(self.root / 'lib/guide-enrichment.json')
        decisions = deepcopy(self.template)
        for claim in decisions['claims']:
            self.ready(claim)
        result = self.evaluate(decisions)
        self.assertEqual(result['status'], 'unpublished_editorial_proposal_only')
        self.assertEqual(result['decision_counts']['approve_for_proposal'], 2)
        item = result['candidate_additions']['OG.0000001']
        self.assertEqual(item['searchAliases'], ['First Guide LLC'])
        self.assertEqual(item['advertisedWaters'], [{
            'name': 'Sandy River', 'sourceUrl': 'https://example.org/about',
            'sourceType': 'operator_site', 'observedOn': '2026-11-14'
        }])
        self.assertEqual(len(item['sourceLinks']), 1)
        self.assertEqual(original, ed.digest(self.root / 'lib/guide-enrichment.json'))
        self.assertNotIn('reviewer', str(item))

    def test_partial_approval_never_implies_rest_is_verified(self):
        decisions = deepcopy(self.template)
        self.ready(decisions['claims'][0])
        result = self.evaluate(decisions)
        self.assertEqual(result['decision_counts']['approve_for_proposal'], 1)
        self.assertEqual(result['decision_counts']['unreviewed'], 1)
        item = result['candidate_additions']['OG.0000001']
        self.assertEqual(len(item['searchAliases']) + len(item['advertisedWaters']), 1)

    def test_approval_requires_all_three_explicit_checks(self):
        for key in ed.CHECK_KEYS:
            decisions = deepcopy(self.template)
            self.ready(decisions['claims'][0])
            decisions['claims'][0]['checks'][key] = False
            with self.assertRaisesRegex(ValueError, 'three explicit human attestations'):
                self.evaluate(decisions)

    def test_bad_reviewer_date_note_and_source_cannot_approve(self):
        for field, value, phrase in [
            ('reviewer', '', 'named reviewer'),
            ('note', 'too short', 'substantive note'),
            ('reviewed_on', '2026-11-15', 'future'),
            ('reviewed_on', '2026-02-30', 'invalid'),
            ('selected_source_id', 'unmentioned', 'select a cited source'),
        ]:
            decisions = deepcopy(self.template)
            self.ready(decisions['claims'][0])
            decisions['claims'][0][field] = value
            with self.assertRaises(ValueError, msg=f'field={field}'):
                self.evaluate(decisions)

    def test_non_approval_cannot_carry_hidden_approval_check(self):
        for state in ('reject', 'needs_more_evidence'):
            decisions = deepcopy(self.template)
            claim = decisions['claims'][0]
            claim['decision'] = state
            claim['reviewer'] = 'Human reviewer'
            claim['reviewed_on'] = '2026-11-14'
            claim['note'] = 'Independently reviewed; source does not support the claim.'
            result = self.evaluate(decisions)
            self.assertEqual(result['candidate_additions'], {})
            self.assertEqual(result['decision_counts'][state], 1)
            claim['checks']['source_content'] = True
            with self.assertRaisesRegex(ValueError, 'held/rejected claims'):
                self.evaluate(decisions)

    def test_claim_and_queue_fingerprint_tampering_fails(self):
        for field, value in (('value', 'Rewritten River'), ('source_ids', ['forged'])):
            decisions = deepcopy(self.template)
            decisions['claims'][0][field] = value
            with self.assertRaisesRegex(ValueError, 'fields were modified'):
                self.evaluate(decisions)
        decisions = deepcopy(self.template)
        decisions['queue_sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'immutable template'):
            self.evaluate(decisions)

    def test_unknown_duplicate_missing_claims_fail_closed(self):
        for modify in (
            lambda x: x['claims'].pop(),
            lambda x: x['claims'].append(deepcopy(x['claims'][0])),
            lambda x: x['claims'][0].update(claim_sha256='x' * 64),
        ):
            decisions = deepcopy(self.template)
            modify(decisions)
            with self.assertRaises(ValueError):
                self.evaluate(decisions)

    def test_manual_hold_guides_never_enter_decision_template(self):
        holds = {'OG.0000001': [{'reason_code': 'identity_unresolved',
                                 'reason': 'Could not reconcile public name with directory'}]}
        queue = build_queue([self.batch_path], root=self.root, holds=holds, today=TODAY)
        template = ed.prepare_template(queue, 'a' * 64)
        self.assertEqual(template['claims'], [])
        self.assertEqual(queue['records'][0]['status'], 'manual_hold')

    def test_stale_source_batch_and_changed_baseline_rejected(self):
        self.batch_path.write_text(self.batch_path.read_text() + '\n')
        with self.assertRaisesRegex(ValueError, 'altered'):
            ed.load_queue(self.queue_path, root=self.root)
        self.batch_path.write_text(self.batch_path.read_text().rstrip())
        (self.root / 'lib/guide-enrichment.json').write_text('{"OG.0000001":{}}')
        with self.assertRaisesRegex(ValueError, 'baseline differs'):
            ed.load_queue(self.queue_path, root=self.root)

    def test_queue_must_be_private_and_output_restricts_symlinks(self):
        moved = self.root / 'queue-public.json'
        moved.write_text(json.dumps(self.queue))
        with self.assertRaisesRegex(ValueError, 'ignored research-drafts'):
            ed.load_queue(moved, root=self.root)
        from enrichment_review_queue import _private_output
        with self.assertRaisesRegex(ValueError, 'Outputs must remain'):
            _private_output(self.root / 'lib/public.json', self.root)
        (self.root / 'research-drafts/link').symlink_to(self.root / 'lib', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Outputs must remain'):
            _private_output(self.root / 'research-drafts/link/public.json', self.root)

    def test_reviewer_cannot_sign_off_on_future_source_observation(self):
        decisions = deepcopy(self.template)
        self.ready(decisions['claims'][0])
        decisions['claims'][0]['reviewed_on'] = '2026-11-13'
        with self.assertRaisesRegex(ValueError, 'predates'):
            self.evaluate(decisions)


if __name__ == '__main__':
    unittest.main()
