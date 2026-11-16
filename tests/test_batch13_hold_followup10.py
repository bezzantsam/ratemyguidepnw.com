"""Offline boundary tests for an additive source recheck; not source-truth verification."""
from copy import deepcopy
from datetime import date
import hashlib
import ipaddress
import json
from pathlib import Path
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
BASE_PATH = 'docs/research/BATCH13_REMAINING41_SOURCE_REVIEW_20261115.json'
ADD_PATH = 'docs/research/BATCH13_HOLD_FOLLOWUP10_20261115.json'
BASE_COMMIT = '5345d06473e0f8a508b5cc134b27399ca392cf68'
BASE_SHA256 = '78ffa2ea837d5481bcb002080107ec7a153ef03ccb6fb3e6145628b4c026c3ec'
BASE_BLOB = '746b89885f3c5a2750c3d18d09cf9916e173be54'
SELECTED = ['OG.0002727', 'OG.0002817', 'OG.0003060', 'OG.0003609', 'OG.0003633',
            'OG.0003701', 'OG.0003817', 'OG.0003836', 'OG.0003837', 'OG.0003960']
FALSE_FLAGS = ('publication_approved', 'baseline_hold_removal_approved',
               'owner_claims_verified', 'current_credentials_verified',
               'raw_source_bytes_archived', 'private_contacts_copied', 'reviews_or_ratings_copied')
RECORD_FLAGS = ('baseline_hold_removal_approved', 'publication_approved',
                'legal_identity_verified', 'current_credentials_verified')
# Provenance classifications observed in this pass, not assumptions based on a domain.
SOURCE_KINDS = {
 'winchester': ('tourism_directory', 'parsed_page'),
 'mckenzie': ('industry_directory', 'parsed_page'),
 'quint-marketplace': ('marketplace', 'parsed_page'),
 'wsga': ('industry_directory', 'parsed_page'),
 'twisted-operator': ('operator_site', 'parsed_page'),
 'twisted-event': ('event_organizer', 'parsed_page'),
 'aluminati': ('operator_site', 'parsed_page'),
 'hermanos': ('operator_site', 'parsed_page'),
 'kingfisher-index': ('operator_site', 'indexed_page_text'),
 'two-oceans-page': ('operator_site', 'parsed_page'),
 'two-oceans-index': ('operator_site', 'indexed_page_text'),
 'west-coast-index': ('business_directory', 'indexed_page_text'),
 'onlyfins-marketplace': ('marketplace', 'parsed_page'),
 'onlyfins-index': ('marketplace', 'indexed_page_text'),
 'bewild-about': ('operator_site', 'parsed_page'),
 'bewild-marketplace': ('marketplace', 'parsed_page'),
 'bewild-faq': ('operator_site', 'parsed_page'),
}
STATUSES = {
 'hold_reconfirmed', 'identity_lead_hold_retained', 'new_operator_evidence_pending_review',
 'possible_unlinked_namesake_hold_retained', 'retrieval_limited_hold_retained',
 'source_representation_conflict_hold_retained',
}
OUTCOMES = {'tool_unavailable', 'timeout', 'cache_miss', 'unexpected_status',
            'parsed_page_via_association_link'}


def require(value, message):
    if not value:
        raise ValueError(message)


def public_url(value):
    require(isinstance(value, str) and not any(c.isspace() for c in value), 'Invalid URL')
    u = urlsplit(value)
    h = (u.hostname or '').lower()
    require(u.scheme == 'https' and '.' in h and not u.username and not u.password,
            'URL must be public HTTPS without credentials')
    require(h not in {'localhost', 'localhost.localdomain'} and
            not h.endswith(('.local', '.internal', '.localhost')), 'Private hostname')
    try:
        ipaddress.ip_address(h)
    except ValueError:
        pass
    else:
        raise ValueError('Literal IP is not an evidence domain')


def validate(document, baseline_bytes):
    require(hashlib.sha256(baseline_bytes).hexdigest() == BASE_SHA256, 'Baseline SHA-256 changed')
    git_blob = hashlib.sha1(b'blob ' + str(len(baseline_bytes)).encode() + b'\0' + baseline_bytes).hexdigest()
    require(git_blob == BASE_BLOB, 'Baseline Git blob changed')
    require(document['baseline'] == {'commit': BASE_COMMIT, 'path': BASE_PATH,
            'sha256': BASE_SHA256, 'git_blob_sha': BASE_BLOB}, 'Baseline reference changed')
    require(document['schema_version'] == 1 and document['batch_id'] == 'batch13-hold-followup10-20261115',
            'Unexpected addendum')
    require(document['status'] == 'addendum_pending_review_only', 'Addendum must remain pending')
    reviewed = date.fromisoformat(document['reviewed_on'])
    require(reviewed == date(2026, 11, 15), 'Review date changed')
    for flag in FALSE_FLAGS:
        require(document['policy'].get(flag) is False, 'Policy flag escalated: ' + flag)
    original = {r['registration_id']: r for r in json.loads(baseline_bytes)['records']}
    sources = document['sources']
    require(set(sources) == set(SOURCE_KINDS), 'Source observation set changed')
    source_fields = {'url', 'source_type', 'method', 'reviewed_on', 'source_content_date',
                     'locator', 'observation', 'raw_bytes_archived'}
    for sid, s in sources.items():
        require(set(s) == source_fields, 'Unexpected source fields')
        public_url(s['url'])
        require((s['source_type'], s['method']) == SOURCE_KINDS[sid], 'Source provenance changed')
        require(s['reviewed_on'] == document['reviewed_on'], 'Source review date mismatch')
        require(s['source_content_date'] is None, 'Unestablished source publication date')
        require(s['raw_bytes_archived'] is False, 'Raw-source capture not established')
        require(all(isinstance(s[k], str) and s[k].strip() for k in ('locator', 'observation')),
                'Missing evidence description')
    records = document['records']
    require([r['registration_id'] for r in records] == SELECTED, 'Wrong or duplicate recheck IDs')
    used = set()
    row_fields = {'registration_id', 'imported_name', 'imported_business', 'registry_website',
                  'baseline_review_status', 'followup_status', 'source_ids', 'finding',
                  'next_evidence_needed', 'candidate_facts', 'retrieval_attempts', *RECORD_FLAGS}
    candidate_keys = []
    for r in records:
        require(set(r) == row_fields, 'Unexpected record fields')
        b = original[r['registration_id']]
        for k in ('imported_name', 'imported_business', 'registry_website'):
            require(r[k] == b[k], 'Imported identity changed: ' + k)
        require(r['baseline_review_status'] == b['review_status'] and b['facts'] == [],
                'Baseline hold lost')
        for flag in RECORD_FLAGS:
            require(r.get(flag) is False, 'Record approval escalated: ' + flag)
        require(r['followup_status'] in STATUSES, 'Unknown followup status')
        require(all(isinstance(r[k], str) and r[k].strip() for k in ('finding', 'next_evidence_needed')),
                'Missing finding or next evidence')
        refs = r['source_ids']
        require(isinstance(refs, list) and len(refs) == len(set(refs)) and set(refs) <= set(sources),
                'Bad source references')
        used.update(refs)
        require(isinstance(r['candidate_facts'], list), 'Invalid fact list')
        for fact in r['candidate_facts']:
            require(set(fact) == {'kind', 'value', 'source_id', 'evidence_scope', 'editorial_status',
                                 'publication_approved', 'blocked_by_baseline_hold'}, 'Unexpected fact fields')
            require(fact['source_id'] in refs, 'Fact has unrelated source')
            src = sources[fact['source_id']]
            require((src['source_type'], src['method']) == ('operator_site', 'parsed_page'),
                    'Candidate requires parsed operator evidence')
            require(fact['editorial_status'] == 'pending' and fact['publication_approved'] is False
                    and fact['blocked_by_baseline_hold'] is True, 'Fact bypasses hold')
            require(fact['evidence_scope'] == 'operator_advertises', 'Personal expertise not established')
            candidate_keys.append((r['registration_id'], fact['kind'], fact['value'], fact['source_id']))
        require(isinstance(r['retrieval_attempts'], list), 'Invalid attempts')
        for a in r['retrieval_attempts']:
            require(set(a) == {'url', 'outcome'} and a['outcome'] in OUTCOMES, 'Unestablished fetch outcome')
            public_url(a['url'])
        require(bool(refs or r['retrieval_attempts']), 'No documented recheck')
    require(used == set(sources), 'Unreferenced source')
    require(candidate_keys == [('OG.0003060', 'species', 'Salmon', 'twisted-operator'),
                               ('OG.0003060', 'species', 'Steelhead', 'twisted-operator')],
            'Candidate facts differ from inspected operator offering')
    by_id = {r['registration_id']: r for r in records}
    require({'wsga', 'twisted-operator'} <= set(by_id['OG.0003060']['source_ids']), 'Missing association chain')
    require(sources['twisted-operator']['url'] == 'https://twistedwaters-gs.com/', 'Operator domain changed')
    require(sources['two-oceans-page']['url'] == sources['two-oceans-index']['url'] ==
            'https://2oceansguideservice.com/', 'Conflicting representations lost')
    require(by_id['OG.0003817']['followup_status'] == 'source_representation_conflict_hold_retained',
            'Representation conflict silently resolved')
    result = {'rechecked_records': len(records),
              'new_operator_evidence_records': sum(bool(r['candidate_facts']) for r in records),
              'followup_candidate_facts': len(candidate_keys), 'baseline_holds_removed': 0, 'published_records': 0,
              'source_observations': len(sources), 'unique_source_urls': len({s['url'] for s in sources.values()}),
              'records_with_parsed_evidence': sum(any(sources[s]['method'] == 'parsed_page' for s in r['source_ids']) for r in records)}
    require(document['summary'] == result, 'Summary counts differ from evidence')
    return result


class HoldFollowupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = (ROOT / BASE_PATH).read_bytes()
        cls.data = json.loads((ROOT / ADD_PATH).read_text(encoding='utf-8'))

    def mutate_rejected(self, change):
        data = deepcopy(self.data)
        change(data)
        with self.assertRaises((ValueError, KeyError, TypeError)):
            validate(data, self.baseline)

    def test_actual_addendum_and_no_input_mutation(self):
        before = deepcopy(self.data)
        result = validate(self.data, self.baseline)
        self.assertEqual(result['rechecked_records'], 10)
        self.assertEqual(result['followup_candidate_facts'], 2)
        self.assertEqual(result['baseline_holds_removed'], 0)
        self.assertEqual(self.data, before)

    def test_baseline_bytes_are_pinned(self):
        with self.assertRaises(ValueError): validate(self.data, self.baseline + b'\n')

    def test_baseline_reference_is_pinned(self):
        self.mutate_rejected(lambda d: d['baseline'].update(commit='0' * 40))

    def test_duplicate_or_unknown_record(self):
        self.mutate_rejected(lambda d: d['records'].__setitem__(0, deepcopy(d['records'][1])))
        self.mutate_rejected(lambda d: d['records'][0].update(registration_id='OG.9999999'))

    def test_imported_names_and_domains_are_not_corrected(self):
        for field in ('imported_name', 'imported_business', 'registry_website'):
            with self.subTest(field=field):
                self.mutate_rejected(lambda d, field=field: d['records'][0].update({field: 'replacement'}))

    def test_boolean_strings_cannot_approve(self):
        for flag in FALSE_FLAGS:
            for value in (True, 'false', 0, None):
                with self.subTest(flag=flag, value=value):
                    self.mutate_rejected(lambda d, flag=flag, value=value: d['policy'].update({flag: value}))

    def test_record_approval_and_hold_removal_blocked(self):
        for flag in RECORD_FLAGS:
            self.mutate_rejected(lambda d, flag=flag: d['records'][2].update({flag: True}))

    def test_candidate_remains_pending_and_blocked(self):
        for change in ({'publication_approved': True}, {'blocked_by_baseline_hold': False},
                       {'editorial_status': 'approved'}, {'evidence_scope': 'personal_expertise'}):
            self.mutate_rejected(lambda d, change=change: d['records'][2]['candidate_facts'][0].update(change))

    def test_no_seminar_trip_or_biographical_water(self):
        self.mutate_rejected(lambda d: d['records'][2]['candidate_facts'][0].update(value='Walleye'))
        self.mutate_rejected(lambda d: d['records'][2]['candidate_facts'][0].update(kind='waterway', value='Puget Sound'))
        self.mutate_rejected(lambda d: d['records'][2]['candidate_facts'][0].update(source_id='twisted-event'))

    def test_no_added_relationship_or_booking_fields(self):
        for key in ('relationship', 'booking_url', 'credential', 'phone'):
            self.mutate_rejected(lambda d, key=key: d['records'][2]['candidate_facts'][0].update({key: 'not established'}))

    def test_namesake_and_alias_leads_cannot_become_facts(self):
        for index in (1, 3, 7, 8, 9):
            self.mutate_rejected(lambda d, index=index: d['records'][index]['candidate_facts'].append(
                deepcopy(d['records'][2]['candidate_facts'][0])))

    def test_indexed_and_marketplace_provenance_not_upgraded(self):
        for sid in ('kingfisher-index', 'onlyfins-index', 'west-coast-index', 'two-oceans-index'):
            self.mutate_rejected(lambda d, sid=sid: d['sources'][sid].update(method='parsed_page'))
        self.mutate_rejected(lambda d: d['sources']['quint-marketplace'].update(source_type='operator_site'))

    def test_source_pointer_and_association_chain(self):
        self.mutate_rejected(lambda d: d['records'][2]['source_ids'].remove('wsga'))
        self.mutate_rejected(lambda d: d['records'][2]['candidate_facts'][0].update(source_id='made-up'))

    def test_publication_time_and_capture_not_invented(self):
        self.mutate_rejected(lambda d: d['sources']['twisted-operator'].update(source_content_date='2026-11-15'))
        self.mutate_rejected(lambda d: d['sources']['twisted-operator'].update(raw_bytes_archived=True))

    def test_source_urls_not_private_or_credentialed(self):
        for url in ('http://example.com/', 'https://name:secret@example.com/', 'https://127.0.0.1/',
                    'https://metadata.internal/', 'https://localhost.localdomain/', 'https://example.com/a b'):
            self.mutate_rejected(lambda d, url=url: d['sources']['winchester'].update(url=url))

    def test_failed_fetch_never_means_closed(self):
        self.mutate_rejected(lambda d: d['records'][0]['retrieval_attempts'][0].update(outcome='business_closed'))

    def test_conflicting_representations_retained(self):
        self.mutate_rejected(lambda d: d['sources']['two-oceans-index'].update(url='https://other-example.com/'))
        self.mutate_rejected(lambda d: d['records'][6].update(followup_status='hold_reconfirmed'))

    def test_summary_not_inflated(self):
        self.mutate_rejected(lambda d: d['summary'].update(published_records=10))
        self.mutate_rejected(lambda d: d['summary'].update(unique_source_urls=17))

    def test_every_hold_has_actionable_evidence_requirement(self):
        self.mutate_rejected(lambda d: d['records'][4].update(next_evidence_needed=''))

    def test_duplicate_candidate_facts_are_rejected(self):
        self.mutate_rejected(lambda d: d['records'][2]['candidate_facts'].append(
            deepcopy(d['records'][2]['candidate_facts'][0])))


if __name__ == '__main__':
    unittest.main()
