#!/usr/bin/env python3
"""Extend the frozen Batch 13 proposal without authorizing or publishing it."""
import argparse
import hashlib
import json
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from batch13_enrichment_proposal import HOLD_IDS

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/research/BATCH13_MVP_CANDIDATE_PATCH.json'
OUTPUT = ROOT / 'docs/research/BATCH13_EXTENDED_PROPOSAL.json'
FIELDS = {'advertised_species': 'species', 'advertised_methods': 'method',
          'advertised_trip_types': 'trip_type', 'business_names': 'business_name',
          'display_names': 'person_name'}


def build(base):
    if base.get('publication_approved') is not False:
        raise ValueError('Baseline must remain unpublished')
    result = {'schema_version': 1, 'base_sha256': hashlib.sha256(BASE.read_bytes()).hexdigest(),
              'publication_approved': False, 'attributes': [], 'unrepresentable': [], 'holds': [], 'exclusions': [],
              'limitations': ['Lists are independent; no species-method-waterway relationships are inferred.',
                              'Business offerings are not evidence of an individual guide’s expertise.',
                              'Review dates are not source publication dates or current availability checks.']}
    for record in base['records']:
        if record.get('publication_approved') is not False:
            raise ValueError('Record approval must remain false')
        if record.get('withheld_reason') or record['registration_id'] in HOLD_IDS:
            result['holds'].append({'guide_id': record['registration_id'], 'reason': record.get('withheld_reason') or HOLD_IDS[record['registration_id']],
                                    'editorial_status': 'pending', 'publication_approved': False})
            continue
        if record.get('review_status') != 'source_supported_pending_editorial' or not record.get('identity_sources'):
            raise ValueError('Record lacks supported identity evidence')
        if record['registration_id'] == 'OG.0001116' and not any(x.get('value') == 'Grindstone Lakes' and x.get('reason') for x in record.get('exclusions', [])):
            raise ValueError('Grindstone exclusion is required')
        for exclusion in record.get('exclusions', []):
            result['exclusions'].append({'guide_id': record['registration_id'], **exclusion, 'editorial_status': 'pending', 'publication_approved': False})
        for claim in record['unsupported_fields'] + record['proposed_additions']:
            # Waters already exist in the frozen MVP proposal, so do not duplicate them here.
            if claim['field'] == 'advertised_waters': continue
            if claim.get('publication_approved') is not False:
                raise ValueError('Claim approval must remain false')
            source=claim.get('source') or {}
            try:
                parsed=urlsplit(source.get('url',''))
                valid_date=date.fromisoformat(source.get('reviewed_on','')).isoformat()==source.get('reviewed_on')
            except (ValueError, TypeError):
                raise ValueError('Invalid source or review date') from None
            if (parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or not valid_date or
                not source.get('source_id') or not source.get('source_type') or not source.get('locator') or
                not claim.get('limitations') or claim.get('scope') not in ('operator_advertises','industry_lists')):
                raise ValueError('Missing attribution, scope or limitation')
            item = {'guide_id': record['registration_id'], 'kind': FIELDS.get(claim['field']),
                    'original_field': claim['field'], 'value': claim['value'], 'source': claim['source'],
                    'additional_sources': claim['additional_sources'], 'evidence_scope': claim['scope'],
                    'identity_sources': record['identity_sources'], 'limitations': claim['limitations'],
                    'editorial_status': 'pending', 'publication_approved': False}
            relation=claim.get('relationship')
            if relation is not None:
                if (not isinstance(relation,dict) or relation.get('source_id') != source['source_id'] or
                    any(key not in ('source_id','species','method','waterway') for key in relation) or
                    len(relation)<3 or any(not isinstance(v,str) or not v.strip() for v in relation.values())):
                    raise ValueError('Relationship requires explicit attribution and at least two fields')
                item['relationship']={k:v for k,v in relation.items() if k!='source_id'}
            (result['attributes'] if item['kind'] else result['unrepresentable']).append(item)
    result['counts'] = {'newly_representable': sum(1 for x in result['attributes'] if x['original_field'] != 'display_names'),
                        'existing_proposed_names': sum(1 for x in result['attributes'] if x['original_field'] == 'display_names'),
                        'unrepresentable': len(result['unrepresentable']), 'withheld_records': len(result['holds'])}
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args=parser.parse_args()
    result=build(json.loads(BASE.read_text(encoding='utf-8')))
    content=json.dumps(result,indent=2,ensure_ascii=False)+'\n'
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != content:
            raise SystemExit('Extended proposal is stale')
        print('Extended proposal matches frozen baseline.')
    else:
        OUTPUT.write_text(content,encoding='utf-8')
        print(json.dumps(result['counts'],sort_keys=True))

if __name__ == '__main__': main()
