"""Offline checks of final-batch evidence and review-only population conversion."""
import copy
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import batch13_remaining41 as batch

REVIEW = json.loads(batch.REVIEW.read_text())
SELECTION_BYTES = batch.SELECTION.read_bytes()
SELECTION = json.loads(SELECTION_BYTES)
# Deliberately a synthetic registry fixture made from the pinned selection.
# Real 1,027-row registry and prior-file lineage are checked by the CLI in CI.
REGISTRY_FIXTURE = [dict(registration=r['registration_id'], name=r['imported_name'],
    business=r['imported_business'] or None, website=r['registry_website'])
    for r in SELECTION['selected_registry_records']]


def row(review, ident):
    return next(r for r in review['records'] if r['registration_id'] == ident)


class Remaining41Tests(unittest.TestCase):
    def rejects(self, mutate, pattern=None):
        edited = copy.deepcopy(REVIEW)
        mutate(edited)
        with self.assertRaisesRegex(ValueError, pattern or '.'):
            batch.validate(edited, SELECTION_BYTES, REGISTRY_FIXTURE)

    def test_exact_coverage_and_classification(self):
        report = batch.validate(REVIEW, SELECTION_BYTES, REGISTRY_FIXTURE)
        self.assertEqual((report['checked_records'], report['cumulative_checked'], report['remaining_unchecked']), (41, 111, 0))
        self.assertEqual((report['source_pages'], report['candidate_fact_groups'], report['explicit_relationships']), (42, 16, 34))
        self.assertEqual(report['counts_by_status']['source_supported_pending_editorial'], 15)
        self.assertEqual(sum(s['method'] == 'indexed_page_text' for s in REVIEW['sources'].values()), 3)

    def test_unknown_registry_id(self):
        registry = copy.deepcopy(REGISTRY_FIXTURE)
        registry[0]['registration'] = 'OG.9999999'
        with self.assertRaisesRegex(ValueError, 'Unknown directory identity'):
            batch.validate(REVIEW, SELECTION_BYTES, registry)

    def test_swapped_name(self):
        self.rejects(lambda d: d['records'][0].update(imported_name='Different person'), 'Imported identity changed')

    def test_changed_business(self):
        self.rejects(lambda d: d['records'][0].update(imported_business='Different business'), 'Imported identity changed')

    def test_registry_url_not_silently_corrected(self):
        self.rejects(lambda d: row(d, 'OG.0003643').update(registry_website='jackcreekguidedadventures.com'), 'Imported identity changed')

    def test_duplicate_record(self):
        self.rejects(lambda d: d['records'].__setitem__(1, copy.deepcopy(d['records'][0])), 'Review IDs')

    def test_selection_checksum(self):
        self.rejects(lambda d: d['selection_snapshot'].update(sha256='0'*64), 'Selection checksum')

    def test_global_approval_cannot_escalate(self):
        self.rejects(lambda d: d['policy'].update(publication_approved=True), 'Research flag')

    def test_per_record_approval_cannot_escalate(self):
        for value in (True, 'false', 0, None):
            with self.subTest(value=value):
                self.rejects(lambda d: d['records'][0].update(publication_approved=value), 'Record approval')

    def test_no_credential_escalation(self):
        self.rejects(lambda d: d['records'][0].update(current_credentials_verified=True), 'Record approval')

    def test_no_legal_identity_escalation(self):
        self.rejects(lambda d: d['records'][0]['identity'].update(legal_identity_verified=True), 'Record approval')

    def test_held_observations_never_become_facts(self):
        self.rejects(lambda d: row(d, 'OG.0003154')['facts'].append(copy.deepcopy(row(d, 'OG.0002734')['facts'][0])), 'Held record')

    def test_hold_promotion_rejected(self):
        def change(d):
            target = row(d, 'OG.0003361')
            target.update(review_status=batch.core.SUPPORTED, facts=[copy.deepcopy(row(d, 'OG.0002734')['facts'][0])])
            d['scope']['counts_by_status'][batch.core.SUPPORTED] += 1
            d['scope']['counts_by_status']['name_variant_hold'] -= 1
        self.rejects(change, 'Frozen editorial holds')

    def test_unknown_source_pointer(self):
        self.rejects(lambda d: row(d, 'OG.0002734')['facts'][0].update(source_id='invented'), 'Unknown source')

    def test_directory_not_operator_fact(self):
        self.rejects(lambda d: row(d, 'OG.0002734')['facts'][0].update(source_id='wade-directory'), 'operator evidence')

    def test_indexed_content_not_candidate_fact(self):
        self.rejects(lambda d: d['sources']['rivertrek'].update(method='indexed_page_text'), 'Indexed-only')

    def test_indexed_identity_cannot_support_candidate(self):
        self.rejects(lambda d: d['sources']['wade-directory'].update(method='indexed_page_text'), 'Supported identity')

    def test_unsafe_source_urls(self):
        for value in ('http://example.com/', 'javascript:alert(1)', 'https://user:pass@example.com/',
                      'https://localhost/', 'https://127.0.0.1/', 'https://host.internal/'):
            with self.subTest(value=value):
                self.rejects(lambda d: d['sources']['rivertrek'].update(url=value))

    def test_future_content_date(self):
        self.rejects(lambda d: d['sources']['rivertrek'].update(content_date='2027-01-01'), 'Future source')

    def test_invented_retrieval_outcome(self):
        self.rejects(lambda d: row(d, 'OG.0002938')['failed_or_limited_fetches'][0].update(result='business_closed'), 'retrieval outcome')

    def test_cross_source_relationship(self):
        self.rejects(lambda d: row(d, 'OG.0003383')['facts'][0]['explicit_relationships'].append({'waterway':'Invented River','species':'Striped Bass'}), 'crosses source')

    def test_crossed_known_trip_pair(self):
        self.rejects(lambda d: row(d, 'OG.0003383')['facts'][0]['explicit_relationships'][0].update(species='Chinook Salmon'), 'Ryan trip')

    def test_broad_salmon_not_expanded(self):
        self.rejects(lambda d: row(d, 'OG.0003823')['facts'][0]['advertised_species'].append('Chinook Salmon'), 'Broad salmon')

    def test_book_topics_not_guide_expertise(self):
        self.rejects(lambda d: row(d, 'OG.0003697')['facts'][0]['advertised_species'].append('Trout'), 'Book topics')

    def test_no_unsupported_fields(self):
        self.rejects(lambda d: row(d, 'OG.0002734')['facts'][0].update(verified_license=True), 'Unexpected candidate')

    def test_counts_must_be_measured(self):
        self.rejects(lambda d: d['scope'].update(remaining_unchecked=1), 'Reported counts')

    def test_converter_counts_and_no_holds_in_output(self):
        result = batch.build(REVIEW, SELECTION_BYTES, REGISTRY_FIXTURE)
        self.assertEqual(result['counts'], dict(supported_records=15, held_records=26, attributes=117,
            standalone_attributes=83, relationship_attributes=34, pending_waters=29,
            distinct_standalone_attributes=83, distinct_guide_waters=28))
        for item in result['attributes'] + result['pending_waters']:
            self.assertNotIn(item['guide_id'], batch.HOLD_IDS)
            self.assertIs(item['publication_approved'], False)
            self.assertEqual(item['editorial_status'], 'pending')
            self.assertEqual(item['source']['source_type'], 'operator_site')
            self.assertEqual(item['source']['retrieval_method'], 'parsed_page')
            self.assertTrue(item['source']['locator'])
            self.assertTrue(item['identity_evidence']['sources'])

    def test_repeated_conversion_is_deterministic_and_preserves_inputs(self):
        before = copy.deepcopy(REVIEW)
        first = batch.artifacts(batch.build(REVIEW, SELECTION_BYTES, REGISTRY_FIXTURE))
        second = batch.artifacts(batch.build(REVIEW, SELECTION_BYTES, REGISTRY_FIXTURE))
        self.assertEqual(first, second)
        self.assertEqual(before, REVIEW)
        data = list(csv.DictReader(io.StringIO(first['POPULATION.csv'])))
        self.assertEqual(len(data), 146)
        self.assertTrue(all(x['publication_approved']=='false' for x in data))

    def test_csv_formula_sanitization(self):
        result = batch.build(REVIEW, SELECTION_BYTES, REGISTRY_FIXTURE)
        result['attributes'][0]['value'] = '=1+1'
        result['attributes'][0]['directory_name'] = '@example'
        entries = list(csv.DictReader(io.StringIO(batch.artifacts(result)['POPULATION.csv'])))
        self.assertEqual(entries[0]['value'], "'=1+1")
        self.assertEqual(entries[0]['directory_name'], "'@example")

    def test_identity_hold_reasons_are_preserved_in_bundle(self):
        result = batch.build(REVIEW, SELECTION_BYTES, REGISTRY_FIXTURE)
        held = {r['guide_id']: r for r in result['holds']}
        self.assertIn('Matt Ellington', held['OG.0004090']['reason'])
        self.assertIn('Bryan Myers', held['OG.0003154']['reason'])
        self.assertIn('name_variant_hold', held['OG.0003361']['review_status'])
        self.assertEqual(len(held), 26)


if __name__ == '__main__':
    unittest.main()
