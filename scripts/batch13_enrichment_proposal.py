#!/usr/bin/env python3
"""Produce an offline, unpublished review proposal; never modify public data."""
import argparse
from collections import Counter
from datetime import date
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/research/BATCH13_SOURCE_REVIEW_20261115.json'
REGISTRY = ROOT / 'lib/oregon-guides.json'
PUBLIC = ROOT / 'lib/guide-enrichment.json'
PATCH = ROOT / 'docs/research/BATCH13_MVP_CANDIDATE_PATCH.json'
REPORT = ROOT / 'docs/research/BATCH13_MVP_REVIEW_REPORT.md'
HOLD_IDS = {
    'OG.0000782': 'Historical listing only; no current permit verification.',
    'OG.0001224': 'Operator source retrieval was limited; direct recheck required.',
    'OG.0001881': 'Daniel Chambers and RiverStone individual association unresolved.',
}
BURRELL = 'OG.0001116'
SUPPORTED = {'display_names': 'searchAliases', 'advertised_waters': 'advertisedWaters'}


def norm(value):
    return ' '.join(value.casefold().split())


def valid_url(value):
    try:
        parsed = urlsplit(value)
        return (parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.username
                and not parsed.password and not any(c.isspace() for c in value))
    except (TypeError, ValueError):
        return False


def evidence(source_id, sources, reviewed_on):
    source = sources.get(source_id)
    if not isinstance(source, dict) or not valid_url(source.get('url')):
        raise ValueError('Missing or invalid HTTPS source URL for ' + str(source_id))
    for key in ('source_type', 'method', 'locator'):
        if not isinstance(source.get(key), str) or not source[key].strip():
            raise ValueError('Missing source attribution ' + key + ' for ' + str(source_id))
    try:
        date.fromisoformat(reviewed_on)
    except (ValueError, TypeError):
        raise ValueError('Missing or invalid review date') from None
    return {'source_id': source_id, 'url': source['url'], 'source_type': source['source_type'],
            'retrieval_method': source['method'], 'locator': source['locator'],
            'source_content_date': source.get('content_date'), 'reviewed_on': reviewed_on}


def build_proposal(source, registry, public):
    """Classify source facts without mutating inputs or authorizing publication."""
    if source.get('schema_version') != 1 or source.get('policy', {}).get('publication_approved') is not False:
        raise ValueError('Snapshot must remain explicitly unapproved')
    for flag in ('owner_claims_verified', 'current_credentials_verified', 'reviews_copied'):
        if source['policy'].get(flag) is not False:
            raise ValueError('Snapshot safety flag must remain false: ' + flag)
    sources, reviewed = source['sources'], source['reviewed_on']
    if not isinstance(source.get('records'), list):
        raise ValueError('Missing records')
    ids = Counter(row.get('registration_id') for row in source['records'])
    directory = {row['registration']: row for row in registry}
    if len(directory) != len(registry):
        raise ValueError('Duplicate registry IDs')
    result = {'schema_version': 1, 'source_checkpoint': '68ccf8c850af6b161ba46ca9659363a73b6eb493',
              'reviewed_on': reviewed, 'publication_approved': False, 'records': [],
              'limitations': ['Review proposal only; no publication authorization or live database mapping.',
                              'Business offerings do not establish individual expertise or species-water-method combinations.',
                              'Review date is not an original publication date or proof of a direct capture.',
                              'Conflicts cover exact directory identity mismatches and explicit exclusions; semantic contradictions require editorial review.']}
    for row in sorted(source['records'], key=lambda item: item['registration_id']):
        ident = row['registration_id']
        record = {'registration_id': ident, 'name': row['imported_name'], 'review_status': row['review_status'],
                  'publication_approved': False, 'before': {'directory_name': directory.get(ident, {}).get('name'),
                  'directory_business': directory.get(ident, {}).get('business'), 'public_enrichment': public.get(ident)},
                  'identity': row['identity'],
                  'limitations': row['limitations'], 'exclusions': [dict(x) for x in row['exclusions']],
                  'failed_or_limited_fetches': row['failed_or_limited_fetches'],
                  'existing_facts': [], 'proposed_additions': [], 'unsupported_fields': [], 'conflicts': [],
                  'withheld_reason': None}
        result['records'].append(record)
        errors = []
        if row.get('publication_approved') is not False or row.get('current_credentials_verified') is not False or row.get('identity', {}).get('legal_identity_verified') is not False:
            raise ValueError('Record safety flags must remain false: ' + ident)
        if ids[ident] != 1: errors.append('Duplicate source record ID')
        if ident not in directory: errors.append('Unknown directory ID')
        elif (norm(row['imported_name']) != norm(directory[ident]['name']) or
              norm(row.get('imported_business') or '') != norm(directory[ident].get('business') or '')):
            errors.append('Directory name or business conflicts with reviewed snapshot')
            record['conflicts'].append({'field': 'identity', 'value': row['imported_name'], 'reason': errors[-1]})
        if ident in HOLD_IDS: errors.append(HOLD_IDS[ident])
        if row['review_status'] != 'source_supported_pending_editorial' and ident not in HOLD_IDS:
            errors.append('Source review status is not supported for proposal')
        if not row.get('limitations') or not row.get('identity', {}).get('assessment') or not row['identity'].get('source_ids'):
            errors.append('Missing identity attribution or limitations')
        try:
            identity_sources = [evidence(sid, sources, reviewed) for sid in row['identity'].get('source_ids', [])]
            for fact in row['facts']:
                evidence(fact.get('source_id'), sources, reviewed)
                if fact.get('scope') not in ('operator_advertises', 'industry_lists', 'historical_listing'):
                    raise ValueError('Missing or unsupported fact scope')
            for exclusion in record['exclusions']:
                exclusion['source'] = evidence(exclusion.get('source_id'), sources, reviewed)
                if not exclusion.get('reason'): raise ValueError('Missing exclusion reason')
            record['identity_sources'] = identity_sources
        except (ValueError, KeyError) as exc:
            errors.append(str(exc))
        if ident == BURRELL and not any(x.get('field') == 'advertised_waters' and norm(x.get('value', '')) == 'grindstone lakes' and x.get('reason') for x in row['exclusions']):
            errors.append('Required Grindstone Lakes exclusion is missing')
        if errors:
            record['withheld_reason'] = '; '.join(errors)
            continue
        existing = public.get(ident, {})
        seen = {}
        for group in row['facts']:
            attribution = evidence(group['source_id'], sources, reviewed)
            for field, values in group.items():
                if field in ('source_id', 'scope'): continue
                if not isinstance(values, list) or any(not isinstance(v, str) or not v.strip() for v in values):
                    raise ValueError('Invalid fact values for ' + ident + ': ' + field)
                for value in values:
                    key = (field, norm(value))
                    excluded = next((x for x in row['exclusions'] if x.get('field') == field and norm(x.get('value', '')) == norm(value)), None)
                    claim = {'field': field, 'value': value, 'scope': group['scope'],
                             'source': attribution, 'limitations': row['limitations'], 'publication_approved': False}
                    if excluded:
                        claim['reason'] = 'Contradicts explicit exclusion: ' + excluded['reason']
                        claim['exclusion_source'] = evidence(excluded['source_id'], sources, reviewed)
                        record['conflicts'].append(claim)
                        continue
                    if key in seen:
                        # Duplicate facts do not become duplicate additions. Retain distinct source evidence.
                        if (attribution != seen[key]['source'] or group['scope'] != seen[key]['scope']):
                            extra = {'source': attribution, 'scope': group['scope']}
                            if extra not in seen[key]['additional_sources']:
                                seen[key]['additional_sources'].append(extra)
                        continue
                    claim['additional_sources'] = []
                    seen[key] = claim
                    registry_value = directory[ident]['name'] if field == 'display_names' else directory[ident].get('business') if field == 'business_names' else None
                    current = existing.get('searchAliases', []) if field == 'display_names' else [w['name'] for w in existing.get('advertisedWaters', [])] if field == 'advertised_waters' else []
                    if (registry_value and norm(value) == norm(registry_value)) or any(norm(value) == norm(x) for x in current):
                        claim['baseline'] = 'directory registry' if registry_value and norm(value) == norm(registry_value) else 'public enrichment'
                        record['existing_facts'].append(claim)
                    elif field in SUPPORTED:
                        claim['target_field'] = SUPPORTED[field]
                        claim['target_note'] = ('Source-advertised water, not proof of individual expertise; source type requires editorial mapping.' if field == 'advertised_waters' else 'Source-listed name; identity and alias need editorial approval.')
                        record['proposed_additions'].append(claim)
                    else:
                        claim['reason'] = 'No equivalent field in the current MVP enrichment schema.'
                        record['unsupported_fields'].append(claim)
        # Existing public facts that violate a current explicit exclusion are conflicts.
        for exclusion in row['exclusions']:
            current = existing.get('advertisedWaters', []) if exclusion.get('field') == 'advertised_waters' else []
            if any(norm(w['name']) == norm(exclusion['value']) for w in current):
                record['conflicts'].append({'field': exclusion['field'], 'value': exclusion['value'],
                    'reason': 'Existing public enrichment contradicts explicit exclusion: ' + exclusion['reason'],
                    'source': evidence(exclusion['source_id'], sources, reviewed), 'publication_approved': False})
    result['counts'] = {key: sum(len(r[key]) for r in result['records']) for key in ('existing_facts', 'proposed_additions', 'unsupported_fields', 'conflicts')}
    result['counts']['withheld_records'] = sum(r['withheld_reason'] is not None for r in result['records'])
    result['counts']['eligible_records'] = len(result['records']) - result['counts']['withheld_records']
    return result


def render_report(proposal):
    counts = proposal['counts']
    lines = ['# Batch 13 MVP enrichment proposal', '',
      'Review-only snapshot; all publication approvals are false. Existing facts include matching registry names/businesses and public enrichment; additions are limited to MVP alias and water fields. Unsupported facts remain attributed for later schema review. Full source and held fact evidence: `BATCH13_SOURCE_REVIEW_20261115.json`.', '',
      'Business offerings describe the source, not individual expertise; lists do not assert species, water and method combinations. A review date is not a publication date or a direct capture guarantee. Conflict detection covers directory identity mismatches and explicit exclusions; it does not detect every semantic contradiction.', '',
      f"Counts: {counts['eligible_records']} eligible records; {counts['withheld_records']} withheld records; {counts['existing_facts']} existing facts; {counts['proposed_additions']} proposed additions; {counts['unsupported_fields']} unsupported facts; {counts['conflicts']} conflicts.", '']
    for r in proposal['records']:
        lines += [f"## {r['registration_id']} — {r['name']}", '', f"Status: {r['review_status']}; publication approved: false."]
        lines.append('Before: directory name ' + str(r['before']['directory_name']) + '; business ' + str(r['before']['directory_business']) + '; public enrichment ' + ('present' if r['before']['public_enrichment'] is not None else 'absent') + '.')
        if r['withheld_reason']:
            lines += ['Withheld: ' + r['withheld_reason'], '']
            continue
        for label, key in [('Already present','existing_facts'), ('Proposed additions','proposed_additions'), ('Unsupported fields','unsupported_fields'), ('Conflicts','conflicts')]:
            lines.append(f'{label}:')
            if not r[key]: lines.append('- None.')
            for claim in r[key]:
                src=claim.get('source', {})
                suffix = f" — {src.get('url', 'directory comparison')} (reviewed {src.get('reviewed_on', proposal['reviewed_on'])}; {src.get('source_type', 'identity')}; {claim.get('scope', 'conflict')})"
                lines.append(f"- {claim['field']}: {claim['value']}" + suffix + (f"; {claim['reason']}" if claim.get('reason') else ''))
        for exclusion in r['exclusions']:
            lines.append(f"- Exclusion: {exclusion['field']} — {exclusion['value']}: {exclusion['reason']} — {exclusion['source']['url']} (reviewed {exclusion['source']['reviewed_on']}).")
        for note in r['limitations']: lines.append('- Limitation: ' + note)
        lines.append('')
    return '\n'.join(lines).rstrip()+'\n'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='check committed review artifacts are current')
    args=parser.parse_args()
    def read(path): return json.loads(path.read_text(encoding='utf-8'))
    proposal=build_proposal(read(SOURCE),read(REGISTRY),read(PUBLIC))
    proposal['input_sha256']={path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (SOURCE,REGISTRY,PUBLIC)}
    outputs={PATCH:json.dumps(proposal,indent=2,ensure_ascii=False)+'\n',REPORT:render_report(proposal)}
    if args.check:
        for path,text in outputs.items():
            if not path.exists() or path.read_text(encoding='utf-8') != text: raise SystemExit('Outdated proposal: '+str(path))
        print('Proposal artifacts match input snapshots; public enrichment was not modified.')
    else:
        for path,text in outputs.items(): path.write_text(text,encoding='utf-8')
        print(json.dumps(proposal['counts'],sort_keys=True))

if __name__ == '__main__': main()
