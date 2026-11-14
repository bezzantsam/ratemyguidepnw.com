#!/usr/bin/env python3
"""Offline coverage audit and proposed-enrichment validation. Never publishes."""
import argparse
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def website_candidate(value):
    if not isinstance(value, str) or not value.strip() or '@' in value:
        return None
    value = value.strip()
    try:
        parsed = urlsplit(value if '://' in value else 'https://' + value)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or '.' not in parsed.hostname:
            return None
        if any(c.isspace() for c in parsed.netloc) or parsed.username or parsed.password:
            return None
        if not re.fullmatch(r'[a-z0-9.-]+', parsed.hostname, re.I):
            return None
        return parsed.geturl()
    except ValueError:
        return None


def load_directory(root=ROOT):
    oregon = read(root / 'lib/oregon-guides.json')
    washington = read(root / 'lib/washington-raw.json')
    ids = read(root / 'lib/washington-stable-ids.json')
    enrichment = read(root / 'lib/guide-enrichment.json')
    known = {r['registration'] for r in oregon} | set(ids.values())
    return oregon, washington, enrichment, known


def inventory(root=ROOT):
    oregon, washington, enrichment, _ = load_directory(root)
    candidates = [dict(directory_id=r['registration'], imported_name=r['name'],
                       business=r.get('business'), candidate_url=website_candidate(r.get('website')),
                       has_enrichment=r['registration'] in enrichment) for r in oregon
                  if website_candidate(r.get('website'))]
    dated = lambda r: bool(r.get('sourceLinks'))
    return {
        'schema_version': 1, 'scope': 'Repository snapshot, not live database or verified website inventory',
        'as_of': datetime.now(timezone.utc).date().isoformat(),
        'counts': {
            'oregon_imported_records': len(oregon), 'washington_raw_records': len(washington),
            'oregon_nonempty_website_fields': sum(bool(r.get('website')) for r in oregon),
            'oregon_website_candidates': len(candidates),
            'website_candidates_without_enrichment': sum(not r['has_enrichment'] for r in candidates),
            'enriched_profiles': len(enrichment),
            'profiles_with_waterways': sum(bool(r['advertisedWaters']) for r in enrichment.values()),
            'waterway_claims': sum(len(r['advertisedWaters']) for r in enrichment.values()),
            'profiles_with_dated_business_sources': sum(dated(r) for r in enrichment.values()),
            'waterway_claims_missing_observation_date': sum(not w.get('observedOn') for r in enrichment.values() for w in r['advertisedWaters']),
        },
        'source_hashes': {name: digest(root / 'lib' / name) for name in
                          ['oregon-guides.json', 'washington-raw.json', 'guide-enrichment.json']},
        'website_candidates': candidates,
        'limitations': ['Candidate URLs have not been contacted or checked for ownership.',
                       'Raw state counts are not a count of unique people.',
                       'Enrichment does not imply completeness, active credentials, or publication.',
                       'Historical scrape-page totals are unavailable; do not invent a cumulative count.'],
    }


def validate_handoff(payload, root=ROOT, today=None):
    today = today or datetime.now(timezone.utc).date()
    _, _, enrichment, known = load_directory(root)
    if not isinstance(payload, dict) or set(payload) != {'schema_version', 'records'} or payload['schema_version'] != 1:
        raise ValueError('Expected schema_version 1 and records only.')
    records = payload['records']
    if not isinstance(records, list) or not 1 <= len(records) <= 100:
        raise ValueError('A handoff must contain 1 to 100 records.')
    seen, results = set(), []
    for record in records:
        errors = []
        if not isinstance(record, dict):
            results.append({'directory_id': None, 'errors': ['Record must be an object.']})
            continue
        allowed = {'directory_id', 'publication_status', 'sources', 'aliases', 'waterways'}
        if set(record) - allowed:
            errors.append('Unsupported fields: ' + ', '.join(sorted(set(record) - allowed)))
        ident = record.get('directory_id')
        if not isinstance(ident, str) or ident not in known:
            errors.append('Existing directory ID required; unmatched entities need separate identity review.')
        elif ident in seen:
            errors.append('Duplicate directory ID in this batch.')
        if isinstance(ident, str):
            seen.add(ident)
        if record.get('publication_status') != 'pending_review':
            errors.append('Publication status must remain pending_review.')
        sources = record.get('sources', [])
        source_ids = set()
        if not isinstance(sources, list) or not 1 <= len(sources) <= 30:
            errors.append('Provide 1 to 30 claim sources.')
            sources = []
        for source in sources:
            if not isinstance(source, dict) or set(source) != {'id', 'url', 'source_type', 'observed_on'}:
                errors.append('Each source needs id, url, source_type and observed_on only.')
                continue
            sid = source['id']
            if not isinstance(sid, str) or not sid.strip() or sid in source_ids:
                errors.append('Source IDs must be nonempty and unique within a record.')
            else:
                source_ids.add(sid)
            url = source['url']
            if not isinstance(url, str) or website_candidate(url) != url or not url.startswith('https://'):
                errors.append('Source URLs must be complete HTTPS URLs without embedded credentials.')
            if source['source_type'] not in ('operator_site', 'third_party_directory'):
                errors.append('Unsupported source type for public advertised enrichment.')
            try:
                observed = date.fromisoformat(source['observed_on'])
                if observed > today:
                    raise ValueError()
            except (TypeError, ValueError):
                errors.append('Observation date must be a real ISO date, not in the future.')
        proposed = {}
        for field in ('aliases', 'waterways'):
            claims = record.get(field, [])
            if not isinstance(claims, list) or len(claims) > 40:
                errors.append(field + ' must be a list with at most 40 claims.')
                claims = []
            names = set()
            for claim in claims:
                if not isinstance(claim, dict) or set(claim) != {'value', 'source_ids'}:
                    errors.append(field + ': each claim needs value and source_ids only.')
                    continue
                value, refs = claim['value'], claim['source_ids']
                if not isinstance(value, str) or not value.strip() or len(value) > 160:
                    errors.append(field + ': claim value must be 1 to 160 characters.')
                elif value.strip().casefold() in names:
                    errors.append(field + ': duplicate claim.')
                else:
                    names.add(value.strip().casefold())
                if not isinstance(refs, list) or not refs or any(not isinstance(ref, str) or ref not in source_ids for ref in refs):
                    errors.append(field + ': every claim must reference a supplied source.')
            proposed[field] = claims
        if not proposed.get('aliases') and not proposed.get('waterways'):
            errors.append('No profile claims supplied.')
        current = enrichment.get(ident, {}) if isinstance(ident, str) else {}
        existing_aliases = {v.casefold() for v in current.get('searchAliases', [])}
        existing_waters = {v['name'].casefold() for v in current.get('advertisedWaters', [])}
        additions = {field: [c for c in proposed[field] if isinstance(c, dict) and isinstance(c.get('value'), str)
                            and c['value'].strip().casefold() not in existing]
                     for field, existing in [('aliases', existing_aliases), ('waterways', existing_waters)]}
        results.append({'directory_id': ident, 'errors': errors,
                        'status': 'invalid' if errors else 'pending_human_source_review',
                        'existing_enrichment': current, 'proposed_additions': additions,
                        'sources': sources, 'publication_status': 'pending_review'})
    return {'schema_version': 1, 'mode': 'offline_review_only',
            'valid': all(not row['errors'] for row in results), 'records': results,
            'baseline_sha256': digest(root / 'lib/guide-enrichment.json'),
            'warning': 'Schema validation does not verify source contents or identities. No records were published.'}



def normalize_gemini(payload, root=ROOT, today=None):
    """Convert Gemini's nested source shape into a review-only PR #82 handoff.

    Reject or hold evidence gaps; never change HTTP to HTTPS or claim website verification.
    """
    today = today or datetime.now(timezone.utc).date()
    if (not isinstance(payload, dict) or set(payload) != {'schema_version', 'records'}
            or payload['schema_version'] != 1 or not isinstance(payload['records'], list)
            or not 1 <= len(payload['records']) <= 100):
        raise ValueError('Expected schema_version 1 and 1 to 100 records.')
    accepted, holds, seen_ids = [], [], set()
    for item in payload['records']:
        identity = item.get('directory_id') if isinstance(item, dict) else None
        errors = []
        if not isinstance(item, dict) or set(item) != {'directory_id', 'publication_status', 'aliases', 'waterways'}:
            errors.append('Gemini record must contain exactly directory_id, publication_status, aliases, waterways.')
        if not isinstance(identity, str) or not identity:
            errors.append('Missing directory ID.')
        elif identity in seen_ids:
            errors.append('Duplicate directory ID in batch.')
        if isinstance(identity, str):
            seen_ids.add(identity)
        if isinstance(item, dict) and item.get('publication_status') != 'pending_review':
            errors.append('Publication status must be pending_review.')
        sources, lookup, converted = [], {}, {'aliases': [], 'waterways': []}
        if not errors:
            for field, oldkey in [('aliases', 'alias'), ('waterways', 'waterway')]:
                claims = item[field]
                if not isinstance(claims, list) or len(claims) > 40:
                    errors.append(field + ': expected a list of at most 40 claims.')
                    continue
                for claim in claims:
                    if (not isinstance(claim, dict) or set(claim) != {oldkey, 'source'}
                            or not isinstance(claim[oldkey], str) or not claim[oldkey].strip()
                            or len(claim[oldkey]) > 160):
                        errors.append(field + ': malformed claim.')
                        continue
                    source = claim['source']
                    if (not isinstance(source, dict) or set(source) != {'url', 'source_type', 'observed_on'}
                            or not isinstance(source['url'], str)
                            or not source['url'].startswith('https://')
                            or website_candidate(source['url']) != source['url']
                            or source['source_type'] not in ('operator_site', 'third_party_directory')):
                        errors.append(field + ': source must have a validated HTTPS URL and supported type; HTTP is held, not silently upgraded.')
                        continue
                    try:
                        observed = date.fromisoformat(source['observed_on'])
                        if observed > today:
                            raise ValueError()
                    except (TypeError, ValueError):
                        errors.append(field + ': source observation date is invalid or future.')
                        continue
                    key = (source['url'], source['source_type'], source['observed_on'])
                    if key not in lookup:
                        source_id = 's' + str(len(lookup) + 1).zfill(2)
                        lookup[key] = source_id
                        sources.append({'id': source_id, **source})
                    converted[field].append({'value': claim[oldkey], 'source_ids': [lookup[key]]})
            if not converted['aliases'] and not converted['waterways']:
                errors.append('At least one supported claim is required.')
        record = {'directory_id': identity, 'publication_status': 'pending_review',
                  'sources': sources, **converted}
        if not errors:
            checked = validate_handoff({'schema_version': 1, 'records': [record]}, root=root, today=today)
            errors = checked['records'][0]['errors']
        if errors:
            holds.append({'directory_id': identity, 'errors': errors})
        else:
            accepted.append(record)
    return {'schema_version': 1, 'records': accepted}, {
        'mode': 'manual_research_review_required', 'source_record_count': len(payload['records']),
        'accepted_for_schema_review': len(accepted), 'held': holds,
        'warning': 'Converted source references are NOT independently verified. No public profile was modified.'
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['inventory', 'validate', 'normalize-gemini'])
    parser.add_argument('--input', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--holds', type=Path, help='Review-only JSON file for held Gemini rows')
    args = parser.parse_args()
    try:
        if args.command in ('validate', 'normalize-gemini') and not args.input:
            raise ValueError('--input is required for validate')
        if args.command == 'inventory':
            result = inventory()
        elif args.command == 'validate':
            result = validate_handoff(read(args.input))
        else:
            if not args.holds or not args.output:
                raise ValueError('normalize-gemini requires both --output and --holds in research-drafts.')
            result, held = normalize_gemini(read(args.input))
            holding = args.holds.resolve()
            staging = (ROOT / 'research-drafts').resolve()
            if not holding.is_relative_to(staging):
                raise ValueError('Held rows must stay under research-drafts.')
            holding.parent.mkdir(parents=True, exist_ok=True)
            holding.write_text(json.dumps(held, indent=2, ensure_ascii=False) + '\n')
        output = json.dumps(result, indent=2, ensure_ascii=False) + '\n'
        if args.output:
            target = args.output.resolve()
            staging = (ROOT / 'research-drafts').resolve()
            if not target.is_relative_to(staging):
                raise ValueError('Outputs must stay under research-drafts; public source files cannot be overwritten.')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(output)
            print(json.dumps({'output': str(target), 'counts': result.get('counts'), 'valid': result.get('valid')}))
        else:
            print(output)
        return 0 if result.get('valid', True) else 1
    except (ValueError, OSError) as error:
        parser.error(str(error))


if __name__ == '__main__':
    raise SystemExit(main())
