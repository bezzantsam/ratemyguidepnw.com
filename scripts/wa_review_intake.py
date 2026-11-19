#!/usr/bin/env python3
"""Offline preflight for a single prospective Washington review pilot."""
import argparse
import hashlib
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
RECEIPTS = ('issuer-proof', 'operator-confirmation', 'collision-report')
COLLISION_SCOPES = ('archived_guides', 'current_guides', 'identity_map')
HOLD_COUNT = 158


class Hold(ValueError):
    """A non-sensitive reason why the intake cannot advance."""


def require(condition, code):
    if not condition:
        raise Hold(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def normalized(value):
    value = unicodedata.normalize('NFKD', value).casefold()
    return ''.join(char for char in value if char.isalnum())


def text(value):
    return isinstance(value, str) and 0 < len(value) <= 256 and bool(normalized(value))


def exact_fields(value, *fields):
    return isinstance(value, dict) and value.keys() == set(fields)


def read_json(blob, code):
    def unique_pairs(pairs):
        value = dict(pairs)
        require(len(value) == len(pairs), code)
        return value

    try:
        return json.loads(blob, object_pairs_hook=unique_pairs)
    except (UnicodeError, json.JSONDecodeError):
        raise Hold(code) from None


def file_bytes(path, code):
    try:
        require(path.is_file() and not path.is_symlink(), code)
        data = path.read_bytes()
    except OSError:
        raise Hold(code) from None
    require(bool(data), code)
    return data


def day(value, code):
    try:
        parsed = date.fromisoformat(value)
        require(value == parsed.isoformat(), code)
        return parsed
    except (ValueError, TypeError):
        raise Hold(code) from None


def valid_candidate(candidate, washington, oregon, stable_ids):
    fields = ('source_id', 'legal_name', 'business', 'credential_id', 'credential_type')
    require(exact_fields(candidate, *fields) and all(text(candidate[field]) for field in fields),
            'candidate_fields')
    source_id = candidate['source_id']
    require(re.fullmatch(r'wa-[0-9]{3,9}', source_id), 'new_source_id')
    number = int(source_id[3:])
    last_existing = max(len(washington), *(int(value[3:]) for value in stable_ids.values()))
    require(source_id == f'wa-{number:03d}' and number > last_existing, 'new_source_id')
    name, business = (normalized(candidate[field]) for field in ('legal_name', 'business'))
    # A name or business match can stop a new allocation. It cannot establish an identity.
    require(not any(normalized(row['name']) == name or normalized(row.get('business') or '') == business
                    for row in [*washington, *oregon]),
            'possible_existing_identity')


def validate_packet(folder, as_of):
    lib = REPO / 'lib'
    wa_raw = file_bytes(lib / 'washington-raw.json', 'repository_catalog')
    wa_ids = file_bytes(lib / 'washington-stable-ids.json', 'repository_catalog')
    or_raw = file_bytes(lib / 'oregon-guides.json', 'repository_catalog')
    washington = read_json(wa_raw, 'repository_catalog')
    stable_ids = read_json(wa_ids, 'repository_catalog')
    oregon = read_json(or_raw, 'repository_catalog')
    require(len(stable_ids) == HOLD_COUNT and len(set(stable_ids.values())) == HOLD_COUNT,
            'historical_hold_baseline_changed')

    packet_bytes = file_bytes(folder / 'packet.json', 'packet_file')
    packet = read_json(packet_bytes, 'packet_json')
    require(exact_fields(packet, 'schema', 'candidate', 'catalog_sha256', 'issuer', 'owner_review',
                         'receipt_sha256') and packet['schema'] == 'wa-review-intake/v1',
            'packet_fields')
    require(packet['catalog_sha256'] == {
        'washington_raw': digest(wa_raw),
        'washington_ids': digest(wa_ids),
        'oregon_registry': digest(or_raw),
    }, 'catalog_changed')
    candidate = packet['candidate']
    valid_candidate(candidate, washington, oregon, stable_ids)

    issuer = packet['issuer']
    require(exact_fields(issuer, 'authority', 'status', 'confirmed_on', 'valid_through')
            and issuer['authority'] == 'WDFW' and issuer['status'] == 'active', 'issuer_confirmation')
    confirmed = day(issuer['confirmed_on'], 'issuer_confirmation')
    expiry = day(issuer['valid_through'], 'issuer_confirmation')
    require(confirmed <= as_of <= expiry, 'issuer_confirmation')

    owner = packet['owner_review']
    require(exact_fields(owner, 'reviewer', 'checked_on', 'collision_counts') and text(owner['reviewer']),
            'owner_review')
    checked = day(owner['checked_on'], 'owner_review')
    require(confirmed <= checked <= as_of, 'owner_review')
    counts = owner['collision_counts']
    require(exact_fields(counts, *COLLISION_SCOPES)
            and all(type(counts[scope]) is int and counts[scope] == 0 for scope in COLLISION_SCOPES),
            'collision_not_cleared')

    hashes = packet['receipt_sha256']
    require(exact_fields(hashes, *RECEIPTS), 'receipt_manifest')
    for filename in RECEIPTS:
        require(hashes[filename] == digest(file_bytes(folder / filename, 'receipt_file')),
                'receipt_digest')

    decision = read_json(file_bytes(folder / 'decision.json', 'decision_file'), 'decision_json')
    require(exact_fields(decision, 'reviewer', 'checked_on', 'packet_sha256', 'decision')
            and text(decision['reviewer']) and decision['decision'] == 'eligible_for_pilot_design'
            and normalized(decision['reviewer']) != normalized(owner['reviewer'])
            and decision['packet_sha256'] == digest(packet_bytes),
            'independent_review')
    require(checked <= day(decision['checked_on'], 'independent_review') <= as_of, 'independent_review')
    return {'status': 'structurally_complete_for_pilot_design', 'packet_sha256': digest(packet_bytes),
            'historical_holds': HOLD_COUNT}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packet_directory', type=Path, help='Private directory containing the intake bundle')
    args = parser.parse_args()
    try:
        result = validate_packet(args.packet_directory, date.today())
    except Hold as exc:
        print(json.dumps({'status': 'held', 'reason': str(exc)}), file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    sys.exit(main())
