import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('batch13', ROOT / 'scripts/batch13_enrichment_proposal.py')
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


class Batch13ProposalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = read(batch.SOURCE)
        cls.registry = read(batch.REGISTRY)
        cls.public = read(batch.PUBLIC)

    def setUp(self):
        self.source = copy.deepcopy(self.source)
        self.registry = copy.deepcopy(self.registry)
        self.public = copy.deepcopy(self.public)

    def proposal(self):
        return batch.build_proposal(self.source, self.registry, self.public)

    def record(self, proposal, ident):
        return next(x for x in proposal['records'] if x['registration_id'] == ident)

    def source_record(self, ident):
        return next(x for x in self.source['records'] if x['registration_id'] == ident)

    def test_checkpoint_counts_attribution_and_reproducibility(self):
        self.assertEqual(hashlib.sha256(batch.SOURCE.read_bytes()).hexdigest(), 'da334c7ae8e3629691b50a88c7db6b149266e88993b28a5ea9e55efab2c82437')
        before = copy.deepcopy((self.source, self.registry, self.public))
        result = self.proposal()
        self.assertEqual(result['counts'], {'existing_facts': 7, 'proposed_additions': 56,
            'unsupported_fields': 92, 'conflicts': 0, 'withheld_records': 3, 'eligible_records': 17})
        self.assertEqual((self.source, self.registry, self.public), before)
        self.assertEqual(result, self.proposal())
        for row in result['records']:
            self.assertIs(row['publication_approved'], False)
            for category in ('existing_facts', 'proposed_additions', 'unsupported_fields'):
                for claim in row[category]:
                    self.assertIs(claim['publication_approved'], False)
                    self.assertTrue(claim['source']['url'].startswith('https://'))
                    self.assertEqual(claim['source']['reviewed_on'], '2026-11-15')
                    self.assertTrue(claim['source']['source_type'])
                    self.assertTrue(claim['source']['locator'])
                    self.assertTrue(claim['limitations'])
        subprocess.run([sys.executable, str(batch.ROOT / 'scripts/batch13_enrichment_proposal.py'), '--check'], cwd=ROOT, check=True, capture_output=True)

    def test_duplicate_additions_and_existing_enrichment(self):
        row = self.source_record('OG.0001116')
        row['facts'][0]['advertised_waters'].append('  DESCHUTES RIVER  ')
        result = self.proposal()
        self.assertEqual(sum(c['value'] == 'Deschutes River' for c in self.record(result, 'OG.0001116')['proposed_additions']), 1)
        self.public['OG.0001116'] = {'searchAliases': [], 'advertisedWaters': [{'name': 'deschutes river'}]}
        record = self.record(self.proposal(), 'OG.0001116')
        self.assertFalse(any(c['value'] == 'Deschutes River' for c in record['proposed_additions']))
        self.assertTrue(any(c['value'] == 'Deschutes River' for c in record['existing_facts']))

    def test_unknown_and_duplicate_ids_fail_closed(self):
        self.source['records'][0]['registration_id'] = 'OG.9999999'
        self.assertIn('Unknown directory ID', self.record(self.proposal(), 'OG.9999999')['withheld_reason'])
        duplicate = copy.deepcopy(self.source_record('OG.0001116'))
        self.source['records'].append(duplicate)
        records = [r for r in self.proposal()['records'] if r['registration_id'] == 'OG.0001116']
        self.assertEqual(len(records), 2)
        self.assertTrue(all('Duplicate source record ID' in r['withheld_reason'] and not r['proposed_additions'] for r in records))

    def test_conflicting_identity_and_exclusion_never_propose(self):
        self.source_record('OG.0000382')['imported_name'] = 'Different person'
        self.source_record('OG.0001116')['facts'][0]['advertised_waters'].append('Grindstone Lakes')
        result = self.proposal()
        self.assertTrue(self.record(result, 'OG.0000382')['conflicts'])
        self.assertTrue(self.record(result, 'OG.0000382')['withheld_reason'])
        burrell = self.record(result, 'OG.0001116')
        self.assertTrue(any(c['value'] == 'Grindstone Lakes' for c in burrell['conflicts']))
        self.assertFalse(any(c['value'] == 'Grindstone Lakes' for c in burrell['proposed_additions']))
        self.public['OG.0001116'] = {'searchAliases': [], 'advertisedWaters': [{'name': 'Grindstone Lakes'}]}
        self.assertTrue(any('Existing public' in c['reason'] for c in self.record(self.proposal(), 'OG.0001116')['conflicts']))

    def test_missing_attribution_or_required_exclusion_withholds_record(self):
        self.source['sources']['hawkins']['locator'] = ''
        self.assertIn('Missing source attribution', self.record(self.proposal(), 'OG.0000382')['withheld_reason'])
        self.source_record('OG.0001116')['exclusions'] = []
        self.assertIn('exclusion is missing', self.record(self.proposal(), 'OG.0001116')['withheld_reason'])
        self.source['sources']['hawkins']['url'] = 'https://user:password@example.test/'
        self.assertIn('invalid HTTPS', self.record(self.proposal(), 'OG.0000382')['withheld_reason'])

    def test_holds_and_source_scope_are_preserved(self):
        result = self.proposal()
        for ident in batch.HOLD_IDS:
            self.assertTrue(self.record(result, ident)['withheld_reason'])
            self.assertFalse(self.record(result, ident)['proposed_additions'])
        hawkins = self.record(result, 'OG.0000382')
        self.assertTrue(any(c['field'] == 'advertised_species' for c in hawkins['unsupported_fields']))
        self.assertTrue(all('scope' in c and 'source' in c for c in hawkins['proposed_additions'] + hawkins['unsupported_fields']))
        self.assertFalse(any('species' in c and 'water' in c for c in hawkins['proposed_additions']))
        self.assertEqual(self.record(result, 'OG.0001116')['exclusions'][0]['source']['url'], 'https://www.nbflyfish.com/grindstone-lakes')

    def test_approval_flags_cannot_be_set(self):
        self.source['policy']['publication_approved'] = True
        with self.assertRaises(ValueError): self.proposal()
        self.source['policy']['publication_approved'] = False
        self.source_record('OG.0001116')['publication_approved'] = True
        with self.assertRaises(ValueError): self.proposal()


if __name__ == '__main__': unittest.main()
