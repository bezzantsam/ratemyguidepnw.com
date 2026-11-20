"""Bind a privately verified Washington identity to an exact existing catalog version."""
import argparse
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

from .wa_review_intake import (
    REPO, HOLD_COUNT, RECEIPTS, Hold, day, digest, exact_fields, file_bytes, normalized,
    read_json, require, text,
)

COLLISIONS = ('current_review_mappings', 'cross_jurisdiction_identity', 'listing_continuity')
HEX = re.compile(r'[0-9a-f]{64}')


def source_key(row):
    def part(value):
        return ' '.join(unicodedata.normalize('NFKC', (value or '').strip()).lower().split())

    return json.dumps([part(row[field]) for field in ('name', 'business', 'source')],
                      ensure_ascii=False, separators=(',', ':'))


def version(source_id, raw, allocations):
    """Compute the version from the exact public ID and its one complete source row."""
    require(isinstance(source_id, str) and re.fullmatch(r'wa-[0-9]{3,9}', source_id), 'listing_id')
    keys = [key for key, value in allocations.items() if value == source_id]
    require(len(keys) == 1, 'listing_not_uniquely_allocated')
    key = keys[0]
    rows = [row for row in raw if source_key(row) == key]
    require(len(rows) == 1, 'listing_source_not_unique')
    payload = json.dumps({'source_id': source_id, 'source_key': key, 'record': rows[0]},
                         ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    return {'source_id': source_id, 'source_key_sha256': digest(key.encode()),
            'listing_sha256': digest(payload)}


def read_catalog(source_id):
    lib = REPO / 'lib'
    raw = file_bytes(lib / 'washington-raw.json', 'repository_catalog')
    ids = file_bytes(lib / 'washington-stable-ids.json', 'repository_catalog')
    oregon = file_bytes(lib / 'oregon-guides.json', 'repository_catalog')
    allocations = read_json(ids, 'repository_catalog')
    require(len(allocations) == HOLD_COUNT and len(set(allocations.values())) == HOLD_COUNT,
            'historical_hold_baseline_changed')
    return version(source_id, read_json(raw, 'repository_catalog'), allocations), {
        'washington_raw': digest(raw), 'washington_ids': digest(ids), 'oregon_registry': digest(oregon)
    }


def validate_packet(folder, as_of):
    raw_packet = file_bytes(folder / 'packet.json', 'packet_file')
    packet = read_json(raw_packet, 'packet_json')
    require(exact_fields(packet, 'schema', 'listing', 'catalog_sha256', 'identity_fingerprint',
                         'issuer', 'owner_review', 'receipt_sha256')
            and packet['schema'] == 'wa-listed-review-intake/v1', 'listed_packet_fields')
    listing = packet['listing']
    require(exact_fields(listing, 'source_id', 'source_key_sha256', 'listing_sha256'), 'listing_fields')
    expected_listing, expected_catalog = read_catalog(listing['source_id'])
    require(packet['catalog_sha256'] == expected_catalog, 'catalog_changed')
    require(listing == expected_listing, 'listing_version_changed')
    fingerprint = packet['identity_fingerprint']
    require(isinstance(fingerprint, str) and HEX.fullmatch(fingerprint), 'identity_fingerprint')

    issuer = packet['issuer']
    require(exact_fields(issuer, 'authority', 'record_kind', 'confirmed_on')
            and issuer['authority'] == 'WDFW'
            and issuer['record_kind'] in ('issuer_identity_confirmation', 'credential_record'),
            'issuer_confirmation')
    confirmed = day(issuer['confirmed_on'], 'issuer_confirmation')
    require(confirmed <= as_of, 'issuer_confirmation')

    owner = packet['owner_review']
    require(exact_fields(owner, 'reviewer', 'checked_on', 'collision_counts', 'basis')
            and text(owner['reviewer']) and owner['basis'] == 'issuer_and_operator_for_exact_listing',
            'owner_review')
    checked = day(owner['checked_on'], 'owner_review')
    require(confirmed <= checked <= as_of, 'owner_review')
    counts = owner['collision_counts']
    require(exact_fields(counts, *COLLISIONS)
            and all(type(counts[scope]) is int and counts[scope] == 0 for scope in COLLISIONS),
            'collision_not_cleared')

    hashes = packet['receipt_sha256']
    require(exact_fields(hashes, *RECEIPTS), 'receipt_manifest')
    for name in RECEIPTS:
        require(hashes[name] == digest(file_bytes(folder / name, 'receipt_file')), 'receipt_digest')

    packet_sha256 = digest(raw_packet)
    decision = read_json(file_bytes(folder / 'decision.json', 'decision_file'), 'decision_json')
    require(exact_fields(decision, 'reviewer', 'checked_on', 'packet_sha256', 'decision')
            and text(decision['reviewer']) and normalized(decision['reviewer']) != normalized(owner['reviewer'])
            and decision['decision'] == 'eligible_for_listed_identity_proof'
            and decision['packet_sha256'] == packet_sha256, 'independent_review')
    require(checked <= day(decision['checked_on'], 'independent_review') <= as_of, 'independent_review')
    return {'status': 'structurally_complete_for_listed_identity_proof',
            'packet_sha256': packet_sha256, 'historical_holds': HOLD_COUNT}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('version').add_argument('source_id')
    commands.add_parser('preflight').add_argument('packet_directory', type=Path)
    args = parser.parse_args()
    try:
        if args.command == 'version':
            listing, catalog = read_catalog(args.source_id)
            result = {'listing': listing, 'catalog_sha256': catalog}
        else:
            result = validate_packet(args.packet_directory, date.today())
    except Hold as exc:
        print(json.dumps({'status': 'held', 'reason': str(exc)}), file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    sys.exit(main())
