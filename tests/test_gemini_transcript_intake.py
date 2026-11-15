"""Synthetic transcript ingestion tests: no network, real guides, approval, or publishing."""
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
spec = importlib.util.spec_from_file_location('transcript_intake', ROOT / 'scripts/gemini_transcript_intake.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
TODAY = date(2026, 11, 14)


class TranscriptIntakeTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        (self.root / 'lib').mkdir()
        (self.root / 'research-drafts').mkdir()
        (self.root / 'lib/oregon-guides.json').write_text(json.dumps([
            {'registration': 'OG.0000002', 'name': 'Guide B', 'website': 'https://b.example'},
            {'registration': 'OG.0000001', 'name': 'Guide A', 'website': 'https://a.example'},
            {'registration': 'OG.0000003', 'name': 'Guide C', 'website': 'https://c.example'}
        ]))
        (self.root / 'lib/washington-raw.json').write_text('[]')
        (self.root / 'lib/washington-stable-ids.json').write_text('{}')
        (self.root / 'lib/guide-enrichment.json').write_text('{}')
        self.assignment = {'schema_version': 1, 'batch_id': 'synthetic-01',
                           'directory_ids': ['OG.0000002', 'OG.0000001', 'OG.0000003']}
        self.holds = {'OG.0000003': [{'reason_code': 'operator_review_required',
                                    'reason': 'No verified source yet'}]}

    def row(self, id='OG.0000002', claim='Sandy River', sid='a'):
        return {'directory_id': id, 'publication_status': 'pending_review',
                'sources': [{'id': sid, 'url': 'https://example.org/about',
                             'source_type': 'operator_site', 'observed_on': '2026-11-14'}],
                'aliases': [], 'waterways': [{'value': claim, 'source_ids': [sid]}]}

    def batch(self, *rows):
        return {'schema_version': 1, 'records': list(rows)}

    def transcript(self, *objects):
        return 'Conversation with Gemini\n\nNot a JSON handoff.\n' + ''.join(
            'JSON\n' + json.dumps(o, indent=2) + '\nNarrative text after object.\n'
            for o in objects)

    def run_intake(self, text, *, assignment=None, holds=None):
        return m.intake(text, assigned=assignment or self.assignment,
                        holds=self.holds if holds is None else holds, root=self.root, today=TODAY)

    def test_exact_batch_selected_from_mixed_previous_and_example_documents(self):
        previous = self.batch(self.row('OG.0000003'))
        example = self.batch(self.row('OG.0000002'))
        expected = self.batch(self.row('OG.0000002'),
                              self.row('OG.0000001', 'Rogue River', sid='b'))
        claims, report = self.run_intake(self.transcript(previous, example, expected))
        self.assertEqual(claims, expected)
        self.assertEqual(report['counts']['assigned'], 3)
        self.assertEqual(report['counts']['pending_review'], 2)
        self.assertEqual(report['counts']['manual_holds'], 1)
        self.assertEqual(report['counts']['waterway_claims'], 2)
        self.assertEqual(report['held_directory_ids'], ['OG.0000003'])
        self.assertEqual(report['source_span']['start_line'] > 1, True)
        self.assertEqual(len(report['source_span']['span_sha256']), 64)
        self.assertIn('No independent source-content', report['warning'])
        self.assertEqual(claims['records'][0]['publication_status'], 'pending_review')

    def test_incomplete_candidate_or_missing_holds_is_not_published(self):
        only_one = self.transcript(self.batch(self.row()))
        with self.assertRaisesRegex(ValueError, 'found 0'):
            self.run_intake(only_one)
        with self.assertRaisesRegex(ValueError, 'found 0'):
            self.run_intake(self.transcript(self.batch(self.row(), self.row('OG.0000001'))), holds={})

    def test_two_matching_revisions_are_ambiguous_and_rejected(self):
        one = self.batch(self.row(), self.row('OG.0000001'))
        two = self.batch(self.row(claim='Clackamas River'), self.row('OG.0000001'))
        with self.assertRaisesRegex(ValueError, 'found 2'):
            self.run_intake(self.transcript(one, two))

    def test_claim_source_mismatch_fails_existing_validator(self):
        bad = self.row()
        bad['waterways'][0]['source_ids'] = ['unreferenced']
        with self.assertRaisesRegex(ValueError, 'failed repository validation'):
            self.run_intake(self.transcript(self.batch(bad, self.row('OG.0000001'))))

    def test_hold_overlap_fails_closed(self):
        data = self.transcript(self.batch(self.row(), self.row('OG.0000001'), self.row('OG.0000003')))
        with self.assertRaisesRegex(ValueError, 'found 0'):
            self.run_intake(data)

    def test_invalid_publication_status_or_credential_field_fails(self):
        for change in ('status', 'extra'):
            item = self.row()
            if change == 'status':
                item['publication_status'] = 'approved'
            else:
                item['licenseStatus'] = 'current'
            with self.assertRaisesRegex(ValueError, 'failed repository validation'):
                self.run_intake(self.transcript(self.batch(item, self.row('OG.0000001'))))

    def test_date_in_future_rejected_by_existing_validator(self):
        r = self.row()
        r['sources'][0]['observed_on'] = '2031-01-01'
        with self.assertRaisesRegex(ValueError, 'failed repository validation'):
            self.run_intake(self.transcript(self.batch(r, self.row('OG.0000001'))))

    def test_assignment_order_unknown_and_duplicates_are_rejected(self):
        path = self.root / 'research-drafts/assignment.json'
        path.write_text(json.dumps(self.assignment))
        self.assertEqual(m.load_assignment(path, root=self.root), self.assignment)
        for ids in (['OG.0000001','OG.0000002'], ['OG.0000002','OG.9999999'],
                    ['OG.0000002','OG.0000002']):
            wrong = copy.deepcopy(self.assignment)
            wrong['directory_ids'] = ids
            path.write_text(json.dumps(wrong))
            with self.assertRaises(ValueError):
                m.load_assignment(path, root=self.root)

    def test_never_extracts_nested_json_or_unrelated_schema(self):
        full = self.batch(self.row(), self.row('OG.0000001'))
        corrupt = {'schema_version': '2026-11-14.v2', 'records': full['records']}
        self.assertEqual(list(m.json_roots('header\n  '+json.dumps(full))), [])
        with self.assertRaisesRegex(ValueError, 'found 0'):
            self.run_intake(self.transcript(corrupt))

    def test_transcript_provenance_changes_when_source_text_changes(self):
        d = self.batch(self.row(), self.row('OG.0000001'))
        _, first = self.run_intake(self.transcript(d))
        updated = copy.deepcopy(d)
        updated['records'][0]['waterways'][0]['value'] = 'Columbia River'
        _, second = self.run_intake(self.transcript(updated))
        self.assertNotEqual(first['source_span']['span_sha256'], second['source_span']['span_sha256'])

    def test_private_path_rejects_tracked_files_and_symlink_escapes(self):
        private = self.root / 'research-drafts'
        p = private / 'input.json'
        p.write_text('{}')
        self.assertEqual(m._private_input(p, self.root), p.resolve())
        with self.assertRaisesRegex(ValueError, 'Outputs must remain'):
            m._private_input(self.root / 'lib/guide-enrichment.json', self.root)
        (private / 'escape').symlink_to(self.root / 'lib', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Outputs must remain'):
            m._private_input(private / 'escape/guide-enrichment.json', self.root)
        with self.assertRaisesRegex(ValueError, 'missing'):
            m._private_input(private / 'missing.json', self.root)

    def test_unknown_guide_cannot_be_substituted_for_assigned_guide(self):
        doc = self.batch(self.row('OG.0000002'), self.row('OG.0000005'))
        with self.assertRaisesRegex(ValueError, 'found 0'):
            self.run_intake(self.transcript(doc))


if __name__ == '__main__':
    unittest.main()
