#!/usr/bin/env python3
"""Validate a research-only source review. This command never writes public data."""
from collections import Counter
from datetime import date
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SELECTION = ROOT / 'docs/research/BATCH13_NEXT10_SELECTION_20261115.json'
REVIEW = ROOT / 'docs/research/BATCH13_NEXT10_SOURCE_REVIEW_20261115.json'
REGISTRY = ROOT / 'lib/oregon-guides.json'
SUPPORTED = 'source_supported_pending_editorial'
STATUSES = {SUPPORTED, 'category_review_hold', 'name_variant_hold', 'retrieval_limited'}
IMPORT_FIELDS = {'registration_id': 'registration', 'imported_name': 'name',
                 'imported_business': 'business', 'registry_website': 'website'}
ATTRIBUTES = ('advertised_waters', 'advertised_species', 'advertised_methods', 'advertised_trip_types')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def strings(values):
    require(isinstance(values, list) and all(isinstance(v, str) and v.strip() for v in values),
            'Expected a list of nonempty strings')
    require(len(values) == len({v.strip().casefold() for v in values}), 'Duplicate list value')


def https_url(value):
    require(isinstance(value, str) and not any(c.isspace() for c in value), 'Invalid source URL')
    parsed = urlsplit(value)
    require(parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password,
            'Source URL must be HTTPS without credentials')


def validate(review, selection_bytes, registry):
    """Check identity, provenance, hold boundaries and totals; not semantic truth."""
    selection = json.loads(selection_bytes)
    require(review['schema_version'] == selection['schema_version'] == 1, 'Unsupported schema')
    require(review['status'] == 'source_review_staged_not_for_publication', 'Review must remain staged')
    require(review['selection_snapshot'] == {
        'path': str(SELECTION.relative_to(ROOT)),
        'sha256': hashlib.sha256(selection_bytes).hexdigest()}, 'Selection checksum mismatch')
    manifest = selection['manifest_registration_ids']
    prior = selection['previously_checked_registration_ids']
    strings(manifest)
    strings(prior)
    require(len(manifest) == 111 and len(prior) == 50 and set(prior) <= set(manifest),
            'Invalid prior review universe')
    selected = selection['selected_registry_records']
    expected_ids = sorted(set(manifest) - set(prior))[:10]
    require([r['registration_id'] for r in selected] == expected_ids, 'Selection overlaps or skips unchecked IDs')
    records = review['records']
    require([r['registration_id'] for r in records] == expected_ids, 'Review IDs differ from selection')
    directory = {r['registration']: r for r in registry}
    require(len(directory) == len(registry), 'Duplicate registry identity')
    for flag in ('publication_approved', 'owner_claims_verified', 'current_credentials_verified',
                 'reviews_copied', 'source_bytes_archived'):
        require(review['policy'].get(flag) is False, 'Research flag must remain false: ' + flag)
    reviewed_on = date.fromisoformat(review['reviewed_on'])
    sources = review['sources']
    for source in sources.values():
        https_url(source['url'])
        require(source['source_type'] == 'operator_site' and source['method'] == 'parsed_page',
                'Unexpected source provenance')
        require(isinstance(source['locator'], str) and source['locator'].strip(), 'Missing source locator')
        require(date.fromisoformat(source['reviewed_on']) == reviewed_on, 'Inconsistent source review date')
        if source['content_date'] is not None:
            require(date.fromisoformat(source['content_date']) <= reviewed_on, 'Future source content date')
    used_sources = set()

    def use_source(source_id):
        require(source_id in sources, 'Unknown source: ' + str(source_id))
        used_sources.add(source_id)

    for row, original in zip(records, selected):
        ident = row['registration_id']
        require(ident in directory, 'Unknown directory identity')
        for field, registry_field in IMPORT_FIELDS.items():
            registry_value = directory[ident].get(registry_field)
            # The upstream manifest represents the registry's null business as an empty string.
            if registry_value is None and registry_field == 'business':
                registry_value = ''
            require(row[field] == original[field] == registry_value,
                    'Imported identity changed: ' + ident + ' ' + field)
        require(row['review_status'] in STATUSES, 'Unknown review status')
        require(row.get('publication_approved') is False and row.get('current_credentials_verified') is False
                and row['identity'].get('legal_identity_verified') is False, 'Record approval must remain false')
        require(isinstance(row['identity']['assessment'], str) and row['identity']['assessment'].strip(),
                'Missing identity assessment')
        strings(row['limitations'])
        require(bool(row['limitations']), 'Missing limitations')
        strings(row['identity']['source_ids'])
        for sid in row['identity']['source_ids']:
            use_source(sid)
        if row['review_status'] == SUPPORTED:
            require(bool(row['identity']['source_ids']) and bool(row['facts']), 'Supported record lacks evidence')
        else:
            require(row['facts'] == [], 'Held record cannot contain candidate facts')
        for fact in row['facts']:
            require(set(fact) == {'source_id', 'scope', 'explicit_relationships', *ATTRIBUTES},
                    'Unexpected candidate field')
            use_source(fact['source_id'])
            require(fact['scope'] == 'operator_advertises', 'Unsupported fact scope')
            for field in ATTRIBUTES:
                strings(fact[field])
            require(any(fact[field] for field in ATTRIBUTES), 'Empty candidate fact')
            require(isinstance(fact['explicit_relationships'], list), 'Invalid relationships')
            seen = set()
            for relation in fact['explicit_relationships']:
                require({'waterway', 'species'} <= set(relation) <= {'waterway', 'species', 'method'},
                        'Unexpected relationship fields')
                for key, field in (('waterway', 'advertised_waters'), ('species', 'advertised_species'),
                                   ('method', 'advertised_methods')):
                    if key in relation:
                        require(relation[key] in fact[field], 'Relationship crosses source fact boundaries')
                key = tuple(sorted(relation.items()))
                require(key not in seen, 'Duplicate relationship')
                seen.add(key)
        for held in row['held_observations']:
            require(set(held) == {'source_id', 'note'} and isinstance(held['note'], str) and held['note'].strip(),
                    'Held observations must remain narrative notes')
            use_source(held['source_id'])
        for attempt in row['failed_or_limited_fetches']:
            https_url(attempt['url'])
            require(attempt['result'] == 'tool_unavailable', 'Unsubstantiated retrieval outcome')
        if row['review_status'] == 'retrieval_limited':
            require(not row['identity']['source_ids'] and not row['held_observations']
                    and bool(row['failed_or_limited_fetches']), 'Invalid retrieval-limited record')
        else:
            require(bool(row['identity']['source_ids']), 'Missing readable identity evidence')
    require(used_sources == set(sources), 'Unused source catalog entry')
    readable = sum(bool(r['identity']['source_ids']) for r in records)
    scope = {'checked_records': len(records), 'previously_checked': len(prior),
             'cumulative_checked': len(prior) + len(records), 'original_candidates': len(manifest),
             'remaining_unchecked': len(manifest) - len(prior) - len(records),
             'records_with_readable_source_evidence': readable,
             'records_without_readable_source_evidence': len(records) - readable,
             'counts_by_status': dict(Counter(r['review_status'] for r in records))}
    require(review['scope'] == scope, 'Reported counts do not match reviewed records')
    return {**scope, 'source_pages': len(sources),
            'candidate_fact_groups': sum(len(r['facts']) for r in records),
            'explicit_relationships': sum(len(f['explicit_relationships']) for r in records for f in r['facts']),
            'publication_approved': False}


if __name__ == '__main__':
    print(json.dumps(validate(json.loads(REVIEW.read_text()), SELECTION.read_bytes(),
                             json.loads(REGISTRY.read_text())), indent=2, sort_keys=True))
