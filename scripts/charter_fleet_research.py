#!/usr/bin/env python3
"""Normalize researched charter fleets for PRIVATE editorial review, never publication.

Separates outfitter, vessel, captain and crew relationships. A crew name
repeated across several boats is treated as a fleet-roster claim, NOT as
proof of an assignment aboard every boat.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

from enrichment_handoff import digest, read
from enrichment_review_queue import _private_output

ROOT = Path(__file__).resolve().parents[1]
FORMAT = 'ratemyguidepnw-private-charter-research-v1'
ALLOWED_TYPES = {'saltwater_charter_outfitter', 'saltwater_six_pack_charter'}


def _text(value, label):
    if not isinstance(value, str) or not value.strip() or len(value) > 600:
        raise ValueError(f'{label} must be nonempty text of at most 600 characters.')
    return value.strip()


def _source_url(value, label):
    url = _text(value, label)
    try:
        parsed = urlsplit(url)
    except ValueError:
        raise ValueError(f'{label} must be a complete HTTPS source URL.') from None
    if (parsed.scheme != 'https' or not parsed.hostname or '.' not in parsed.hostname
            or parsed.username or parsed.password or any(c.isspace() for c in parsed.netloc)):
        raise ValueError(f'{label} must be a complete HTTPS source URL without credentials.')
    return url


def _date(value, today):
    try:
        checked = date.fromisoformat(value)
        if checked > today:
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError('Source observation date is invalid or in the future.') from None
    return checked.isoformat()


def _research_id(fleet_key, name):
    # An internal research key, NOT an Oregon directory ID or evidence of person identity.
    value = f'{fleet_key}\x00{name.casefold().strip()}'.encode('utf-8')
    return 'research-person-' + hashlib.sha256(value).hexdigest()[:18]


def _people(people, fleet_key, field, vessel_name):
    if not isinstance(people, list):
        raise ValueError(f'{vessel_name}: {field} must be a list.')
    results = []
    seen = set()
    for item in people:
        if not isinstance(item, dict) or not isinstance(item.get('name'), str):
            raise ValueError(f'{vessel_name}: {field} entry must have a name.')
        name = _text(item['name'], f'{vessel_name} {field} name')
        role = _text(item.get('role'), f'{vessel_name} {field} role')
        identity = _research_id(fleet_key, name)
        if identity in seen:
            raise ValueError(f'{vessel_name}: repeated person in {field}.')
        seen.add(identity)
        results.append({'research_person_id': identity, 'name': name, 'source_role': role,
                        'identity_verified': False, 'credential_status': 'unknown'})
    return results


def normalize(report, *, today=None):
    """Review-only normalization of Gemini's 2026-11-13.v2 fleet section."""
    today = today or datetime.now(timezone.utc).date()
    if (not isinstance(report, dict) or
            not isinstance(report.get('saltwater_charter_fleets'), dict) or
            not report['saltwater_charter_fleets']):
        raise ValueError('Report lacks saltwater_charter_fleets object.')
    if report.get('schema_version') != '2026-11-13.v2':
        raise ValueError('Expected the known Gemini handoff version; do not silently reinterpret other schemas.')
    _date(report.get('date_checked'), today)
    fleets = []
    all_ids = set()
    for key, fleet in report['saltwater_charter_fleets'].items():
        if not isinstance(key, str) or not key.strip() or not isinstance(fleet, dict):
            raise ValueError('Malformed fleet entry.')
        if fleet.get('entity_type') not in ALLOWED_TYPES:
            raise ValueError(f'{key}: only saltwater charter fleets belong here.')
        # Never infer a directory identity from a business/boat name.
        if fleet.get('directory_id') is not None:
            raise ValueError(f'{key}: source claims a matched public ID; review mapping separately.')
        name = _text(fleet.get('public_name'), f'{key} name')
        boats = fleet.get('vessels')
        if not isinstance(boats, list) or not boats:
            raise ValueError(f'{key}: expected one or more explicitly described vessels.')
        if len(boats) > 100:
            raise ValueError(f'{key}: fleet too large.')
        boat_names = set()
        records = []
        for vessel in boats:
            if not isinstance(vessel, dict):
                raise ValueError(f'{key}: malformed vessel.')
            title = _text(vessel.get('vessel_name'), f'{key} vessel name')
            if title.casefold() in boat_names:
                raise ValueError(f'{key}: duplicate vessel name {title}.')
            boat_names.add(title.casefold())
            source_url = _source_url(vessel.get('source_url'), f'{key}/{title} citation')
            observed = _date(vessel.get('date_checked'), today)
            captains = _people(vessel.get('captains'), key, 'captains', title)
            if not captains:
                raise ValueError(f'{key}/{title}: a proposed vessel needs a named captain for this handoff.')
            crew = _people(vessel.get('deckhands', []), key, 'deckhands', title)
            if set(x['research_person_id'] for x in crew) & set(x['research_person_id'] for x in captains):
                raise ValueError(f'{key}/{title}: same person cannot be listed as both crew and captain in this source.')
            for person in captains + crew:
                all_ids.add(person['research_person_id'])
            records.append({
                'vessel_name': title, 'specs_as_reported': vessel.get('vessel_specs')
                    if isinstance(vessel.get('vessel_specs'), str) else None,
                'current_hull_verified': False,
                'captains_reported': captains, 'crew_reported': crew,
                'evidence': {'url': source_url, 'reported_checked_on': observed,
                             'actual_source_contents_rechecked': False},
                'publication_status': 'pending_review',
            })
        # A source that repeats the same deckhand roster under multiple boats
        # identifies the outfitter crew, not necessarily each vessel's actual crew.
        occurrences = Counter(p['research_person_id']
                              for vessel in records for p in vessel['crew_reported'])
        shared = {pid for pid, n in occurrences.items() if n > 1}
        fleet_roster = {}
        for vessel in records:
            assigned = []
            for crew in vessel['crew_reported']:
                if crew['research_person_id'] in shared:
                    fleet_roster[crew['research_person_id']] = {
                        **crew, 'relationship': 'outfitter_roster_only',
                        'individual_vessel_assignment_confirmed': False,
                    }
                else:
                    assigned.append({**crew, 'relationship': 'reported_vessel_crew',
                                     'individual_vessel_assignment_confirmed': False})
            vessel['crew_reported'] = assigned
        fleets.append({
            'research_fleet_key': key, 'public_directory_id': None,
            'outfitter_name_as_reported': name,
            'entity_type': fleet['entity_type'],
            'publication_status': 'pending_review',
            'vessels': records,
            'outfitter_roster_only': sorted(fleet_roster.values(), key=lambda x: x['name'].casefold()),
            'unresolved': fleet.get('conflicts_and_unresolved')
                if isinstance(fleet.get('conflicts_and_unresolved'), list) else [],
            'website_or_license_verified_by_importer': False,
        })
    return {
        'format': FORMAT, 'mode': 'offline_unverified_source_review',
        'origin_schema_version': report['schema_version'],
        'source_date_checked_claim': report['date_checked'],
        'counts': {
            'fleets': len(fleets),
            'vessels': sum(len(f['vessels']) for f in fleets),
            'distinct_research_person_keys': len(all_ids),
            'fleet_only_crew_relationships': sum(len(f['outfitter_roster_only']) for f in fleets),
        },
        'fleets': fleets,
        'warning': 'All vessel, captain, crew and source facts are REPORTED, not independently verified. No directory IDs, credentials, ratings, reviews or public profiles are created.',
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True,
                        help='Gemini v2 source JSON saved locally under ignored research-drafts/')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        source = _private_output(args.input, ROOT)
        dest = _private_output(args.out, ROOT)
        if not source.is_file() or source == dest:
            raise ValueError('Input must be an existing separate private research file.')
        if dest.exists():
            raise ValueError('Output already exists; no overwrites allowed.')
        if source.stat().st_size > 5_000_000:
            raise ValueError('Source too large.')
        output = normalize(read(source))
        output['source_sha256'] = digest(source)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open('x', encoding='utf-8') as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
            f.write('\n')
        print(json.dumps({'output': str(dest), 'counts': output['counts']}))
        return 0
    except (ValueError, KeyError, OSError, TypeError, json.JSONDecodeError) as exc:
        parser.error(str(exc))


if __name__ == '__main__':
    raise SystemExit(main())
