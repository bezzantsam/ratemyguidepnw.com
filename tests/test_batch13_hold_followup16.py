"""Offline evidence-boundary tests; these do not certify source truth or identity."""
import copy
import hashlib
import ipaddress
import json
from pathlib import Path
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'docs/research'
ADDENDUM = RESEARCH / 'BATCH13_HOLD_FOLLOWUP16_20261116.json'
BASE = RESEARCH / 'BATCH13_REMAINING41_SOURCE_REVIEW_20261115.json'
PRIOR = RESEARCH / 'BATCH13_HOLD_FOLLOWUP10_20261115.json'
BASE_HASH = '78ffa2ea837d5481bcb002080107ec7a153ef03ccb6fb3e6145628b4c026c3ec'
PRIOR_HASH = 'd29d9258ff1a91217a8654c437fe90d812c33216665a48156baa4f0544f7beab'
FALSE_FLAGS = ('baseline_hold_removal_approved', 'publication_approved',
               'legal_identity_verified', 'current_credentials_verified')
RECOVERED = {'OG.0003191', 'OG.0003468', 'OG.0003540'}
FACTS = {
 'OG.0003191': {'species': {'Steelhead', 'Rainbow Trout', 'Brown Trout', 'Cutthroat Trout', 'Klamath redband'}, 'method': {'Fly fishing'}, 'trip_type': {'Half-day fishing', 'Full-day fishing'}},
 'OG.0003468': {'species': {'Tuna'}},
 'OG.0003540': {'species': {'Chinook Salmon', 'Coho Salmon', 'Kokanee', 'Sturgeon', 'Rockfish', 'Lingcod', 'Dungeness Crab'}, 'method': {'Anchored bait-wrapped plugs', 'Trolling spinners', 'Trolling bait'}, 'trip_type': {'Ocean crabbing combination trip', 'Bottom-fishing trip'}},
}
WATERS = {'OG.0003191': {'Rogue River', 'Williamson River', 'Wood River'},
          'OG.0003540': {'Columbia River', 'Buoy 10', 'Wind River'}}
RELATIONS = {'OG.0003191': {('Rogue River', 'Steelhead')},
             'OG.0003540': {('Columbia River', 'Chinook Salmon'), ('Columbia River', 'Coho Salmon'), ('Columbia River', 'Dungeness Crab')}}
STATUSES = {'third_party_category_evidence', 'identity_hold_reconfirmed',
 'operator_page_recovered_identity_pending', 'category_scope_refined',
 'association_lead_only', 'indexed_evidence_only', 'source_unavailable',
 'alternate_operator_name_conflict'}

def require(condition, message):
    if not condition:
        raise ValueError(message)

def public_url(url):
    require(isinstance(url, str), 'URL must be text')
    p = urlsplit(url)
    host = p.hostname or ''
    require(p.scheme == 'https' and '.' in host and not p.username and not p.password,
            'Public HTTPS source required')
    require(host not in {'localhost', 'localhost.localdomain'} and
            not host.endswith(('.local', '.internal', '.localhost')), 'Local source refused')
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return
    raise ValueError('Literal IP source refused')

def validate(data, base_bytes, prior_bytes):
    require(hashlib.sha256(base_bytes).hexdigest() == BASE_HASH, 'Baseline bytes changed')
    require(hashlib.sha256(prior_bytes).hexdigest() == PRIOR_HASH, 'Earlier follow-up changed')
    require(data['baseline'] == {
        'commit': '5345d06473e0f8a508b5cc134b27399ca392cf68',
        'path': 'docs/research/BATCH13_REMAINING41_SOURCE_REVIEW_20261115.json',
        'git_blob_sha': '746b89885f3c5a2750c3d18d09cf9916e173be54', 'sha256': BASE_HASH}, 'Baseline lineage changed')
    require(data['prior_followup'] == {
        'commit': '8a9500f2c8cb9b85020a1cdd86dd8a784ea5461b',
        'path': 'docs/research/BATCH13_HOLD_FOLLOWUP10_20261115.json',
        'sha256': PRIOR_HASH}, 'Prior lineage changed')
    require(data['schema_version'] == 1 and data['status'] == 'additive_hold_evidence_not_for_publication', 'Wrong contract')
    require(data['reviewed_on'] == '2026-11-16', 'Wrong review date')
    base = {r['registration_id']: r for r in json.loads(base_bytes)['records']}
    prior_ids = {r['registration_id'] for r in json.loads(prior_bytes)['records']}
    holds = {i for i, r in base.items() if r['review_status'] != 'source_supported_pending_editorial'}
    ids = [r['registration_id'] for r in data['records']]
    require(len(ids) == len(set(ids)) == 16 and set(ids) == holds - prior_ids, 'Wrong or duplicate selection')
    require(len(prior_ids | set(ids)) == 26, 'Held-record coverage does not reconcile')
    for flag in FALSE_FLAGS + ('owner_claims_verified', 'raw_source_bytes_archived', 'private_contacts_copied', 'reviews_or_ratings_copied'):
        require(data['policy'][flag] is False, 'Unsafe policy flag: ' + flag)
    sources = data['sources']
    for s in sources.values():
        public_url(s['url'])
        require(s['source_type'] in {'operator_site', 'industry_directory', 'business_directory'}, 'Source type')
        require(s['method'] in {'parsed_page', 'indexed_page_text'}, 'Retrieval method')
        require(s['reviewed_on'] == data['reviewed_on'] and s['source_content_date'] is None and s['raw_bytes_archived'] is False, 'Unsupported source timing/archive claim')
        require(bool(s['locator']) and bool(s['observation']), 'Missing source context')
    used = set()
    for r in data['records']:
        i = r['registration_id']
        for key in ('imported_name', 'imported_business', 'registry_website'):
            require(r[key] == base[i][key], 'Identity or registry string changed')
        require(r['baseline_review_status'] == base[i]['review_status'], 'Hold history changed')
        require(r['followup_status'] in STATUSES, 'Unknown follow-up status')
        for flag in FALSE_FLAGS:
            require(r[flag] is False, 'Record approval or verification claimed')
        require(set(r['source_ids']) <= sources.keys() and len(r['source_ids']) == len(set(r['source_ids'])), 'Source link missing or duplicated')
        used.update(r['source_ids'])
        require(bool(r['finding']) and bool(r['next_evidence_needed']), 'Missing review handoff')
        for attempt in r['retrieval_attempts']:
            public_url(attempt['url'])
            require(attempt['outcome'] in {'parsed_page', 'tool_unavailable', 'cache_miss', 'http_502', 'no_readable_text'}, 'Unsupported retrieval result')
        facts, waters, relations = r['candidate_facts'], r['candidate_waterways'], r['explicit_relationships']
        for x in facts + waters + relations:
            require(x['source_id'] in r['source_ids'], 'Wrong record source')
            s = sources[x['source_id']]
            require(s['method'] == 'parsed_page' and s['source_type'] == 'operator_site', 'Non-primary or indexed candidate')
            require(x['evidence_scope'] == 'operator_advertises' and x['editorial_status'] == 'pending', 'Wrong evidence or editorial scope')
            require(x['publication_approved'] is False and x['blocked_by_baseline_hold'] is True, 'Hold bypass')
        observed = [(x['kind'], x['value']) for x in facts]
        expected = {(kind, value) for kind, values in FACTS.get(i, {}).items() for value in values}
        require(len(observed) == len(set(observed)) and set(observed) == expected, 'Unsupported, missing or duplicate fact')
        observed_w = [x['value'] for x in waters]
        require(len(observed_w) == len(set(observed_w)) and set(observed_w) == WATERS.get(i, set()), 'Unsupported water')
        observed_r = [(x['waterway'], x['species']) for x in relations]
        require(len(observed_r) == len(set(observed_r)) and set(observed_r) == RELATIONS.get(i, set()), 'Inferred or missing relationship')
        for x in relations:
            require(x['waterway'] in set(observed_w) and ('species', x['species']) in expected, 'Missing relationship component')
    require(used == sources.keys(), 'Unused source observations')
    recovered = {r['registration_id'] for r in data['records'] if r['followup_status'] == 'operator_page_recovered_identity_pending'}
    require(recovered == RECOVERED, 'Recovery count altered')
    paired = [s for s in sources.values() if s['url'] == 'https://www.windingwatersrafting.com/fish-five-plus']
    require(len(paired) == 2 and {s['method'] for s in paired} == {'parsed_page', 'indexed_page_text'}, 'Conflicting source representations collapsed')
    result = {
        'rechecked_records': len(ids), 'new_readable_operator_records': len(recovered),
        'followup_candidate_facts': sum(len(r['candidate_facts']) for r in data['records']),
        'candidate_waterways': sum(len(r['candidate_waterways']) for r in data['records']),
        'explicit_relationships': sum(len(r['explicit_relationships']) for r in data['records']),
        'source_observations': len(sources), 'unique_source_urls': len({s['url'] for s in sources.values()}),
        'records_with_parsed_evidence': sum(any(sources[s]['method'] == 'parsed_page' for s in r['source_ids']) for r in data['records']),
        'baseline_holds_removed': 0, 'published_records': 0,
        'final41_holds_rechecked_across_two_passes': len(prior_ids | set(ids)), 'manifest_records': 111}
    require(data['summary'] == result, 'Counts not reconciled')
    return result

class Followup16Tests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(ADDENDUM.read_text())
        self.base = BASE.read_bytes()
        self.prior = PRIOR.read_bytes()
    def row(self, i):
        return next(r for r in self.data['records'] if r['registration_id'] == i)
    def rejected(self):
        with self.assertRaises((ValueError, KeyError, TypeError)):
            validate(self.data, self.base, self.prior)
    def test_valid_real_pinned_inputs(self):
        self.assertEqual(validate(self.data, self.base, self.prior)['followup_candidate_facts'], 21)
    def test_baseline_bytes_cannot_change(self):
        self.base += b' '; self.rejected()
    def test_prior_followup_bytes_cannot_change(self):
        self.prior += b' '; self.rejected()
    def test_no_duplicate_or_added_guide(self):
        self.data['records'].append(copy.deepcopy(self.data['records'][0])); self.rejected()
    def test_registry_string_is_not_normalized(self):
        self.row('OG.0003288')['imported_business'] += ' '; self.rejected()
    def test_hold_history_cannot_be_rewritten(self):
        self.row('OG.0003191')['baseline_review_status'] = 'approved'; self.rejected()
    def test_policy_cannot_approve(self):
        self.data['policy']['publication_approved'] = True; self.rejected()
    def test_record_cannot_clear_hold(self):
        self.row('OG.0003540')['baseline_hold_removal_approved'] = True; self.rejected()
    def test_string_false_is_not_false(self):
        self.row('OG.0003468')['publication_approved'] = 'false'; self.rejected()
    def test_candidate_stays_blocked(self):
        self.row('OG.0003191')['candidate_facts'][0]['blocked_by_baseline_hold'] = False; self.rejected()
    def test_indexed_candidates_rejected(self):
        self.data['sources']['tone']['method'] = 'indexed_page_text'; self.rejected()
    def test_third_party_candidates_rejected(self):
        self.data['sources']['tone']['source_type'] = 'industry_directory'; self.rejected()
    def test_different_person_is_not_substituted(self):
        self.row('OG.0003868')['imported_name'] = 'Tyler Vaughn'; self.rejected()
    def test_unallocated_source_reference_rejected(self):
        self.row('OG.0003468')['candidate_facts'][0]['source_id'] = 'missing'; self.rejected()
    def test_personal_expertise_not_inferred(self):
        self.row('OG.0003540')['candidate_facts'][0]['evidence_scope'] = 'individual_expertise'; self.rejected()
    def test_tuna_is_not_albacore(self):
        self.row('OG.0003468')['candidate_facts'][0]['value'] = 'Albacore'; self.rejected()
    def test_no_species_water_cross_product(self):
        self.row('OG.0003191')['explicit_relationships'][0]['species'] = 'Brown Trout'; self.rejected()
    def test_shuttle_does_not_establish_fishing(self):
        self.row('OG.0003538')['candidate_facts'] = [copy.deepcopy(self.row('OG.0003191')['candidate_facts'][0])]; self.rejected()
    def test_unsafe_source_url_rejected(self):
        self.data['sources']['tone']['url'] = 'javascript:alert(1)'; self.rejected()
    def test_private_source_url_rejected(self):
        self.data['sources']['tone']['url'] = 'https://127.0.0.1/source'; self.rejected()
    def test_counts_are_recomputed(self):
        self.data['summary']['published_records'] = 16; self.rejected()
    def test_winding_representations_preserved(self):
        self.data['sources']['winding-index']['method'] = 'parsed_page'; self.rejected()
    def test_source_review_is_not_publication_date(self):
        self.data['sources']['tone']['source_content_date'] = '2026-11-16'; self.rejected()
    def test_candidate_water_cannot_be_more_specific(self):
        self.row('OG.0003540')['candidate_waterways'][2]['value'] = 'Drano Lake'; self.rejected()

if __name__ == '__main__':
    unittest.main()
