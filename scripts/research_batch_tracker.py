#!/usr/bin/env python3
"""Offline Oregon guide assignment ledger. Tracks prompts and handoffs; never publishes."""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path

from enrichment_handoff import digest, load_directory, read, validate_handoff, inventory
from enrichment_review_queue import _private_output, load_holds
from guide_research_batch import FORMAT as BATCH_FORMAT, make_batch, markdown

ROOT = Path(__file__).resolve().parents[1]
FORMAT = 'ratemyguidepnw-oregon-assignment-ledger-v1'
STATES = {'assigned', 'returned_for_schema_review'}


def _sha(v):
    return isinstance(v, str) and len(v) == 64 and all(c in '0123456789abcdef' for c in v)


def directory_ids(root=ROOT):
    rows, _, _, _ = load_directory(root)
    ids = [r['registration'] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError('Imported directory contains duplicate IDs.')
    return ids


def empty(root=ROOT):
    return {'format': FORMAT, 'directory_sha256': digest(root / 'lib/oregon-guides.json'),
            'revision': 0, 'parent_sha256': None, 'batches': [],
            'warning': 'Assignment status only. Not evidence of a verified guide, valid license, or publication.'}


def load(path=None, root=ROOT):
    if path is None:
        return empty(root)
    source = Path(path).resolve()
    if not source.is_relative_to((root / 'research-drafts').resolve()):
        raise ValueError('Tracker must stay in ignored research-drafts.')
    obj = read(source)
    if not isinstance(obj, dict) or set(obj) != set(empty(root)) or obj['format'] != FORMAT:
        raise ValueError('Invalid assignment tracker contract.')
    if obj['directory_sha256'] != digest(root / 'lib/oregon-guides.json'):
        raise ValueError('Directory changed; reconcile the registration snapshot first.')
    if not isinstance(obj['revision'], int) or obj['revision'] < len(obj['batches']):
        raise ValueError('Invalid tracker revision.')
    if obj['revision'] > 0 and not _sha(obj['parent_sha256']):
        raise ValueError('Missing version-chain parent digest.')
    known, assigned, batches = set(directory_ids(root)), set(), set()
    positions = {x: i for i, x in enumerate(directory_ids(root))}
    for b in obj['batches']:
        if not isinstance(b, dict) or set(b) != {
            'batch_id', 'directory_ids', 'after', 'next_after', 'assigned_on', 'source',
            'manifest_sha256', 'state', 'handoff_sha256', 'held_directory_ids', 'claim_records'}:
            raise ValueError('Malformed tracked batch.')
        ident, ids = b['batch_id'], b['directory_ids']
        if not isinstance(ident, str) or not ident.strip() or ident in batches:
            raise ValueError('Duplicate or invalid tracked batch name.')
        if (not isinstance(ids, list) or not 1 <= len(ids) <= 100
                or len(ids) != len(set(ids)) or not set(ids).issubset(known)
                or assigned.intersection(ids) or ids != sorted(ids, key=lambda x: positions[x])):
            raise ValueError('Unknown, out-of-order or duplicate assignments.')
        if b['next_after'] != ids[-1] or (b['after'] is not None and (
                b['after'] not in positions or positions[b['after']] >= positions[ids[0]])):
            raise ValueError('Assignment cursor inconsistent with directory order.')
        if b['source'] not in ('historical_prompt', 'validated_manifest'):
            raise ValueError('Unknown assignment provenance.')
        if (b['source'] == 'historical_prompt' and b['manifest_sha256'] is not None) or (
                b['source'] == 'validated_manifest' and not _sha(b['manifest_sha256'])):
            raise ValueError('Invalid manifest evidence for the assignment source.')
        if b['state'] not in STATES:
            raise ValueError('Invalid assignment state.')
        if b['state'] == 'assigned' and (
                b['handoff_sha256'] is not None or b['held_directory_ids'] or b['claim_records'] != 0):
            raise ValueError('Unreturned assignment carries return evidence.')
        if b['state'] == 'returned_for_schema_review' and not _sha(b['handoff_sha256']):
            raise ValueError('Returned batch lacks source handoff fingerprint.')
        if not isinstance(b['held_directory_ids'], list) or not set(b['held_directory_ids']).issubset(ids):
            raise ValueError('Hold outside tracked assignment.')
        if not isinstance(b['claim_records'], int) or b['claim_records'] < 0:
            raise ValueError('Invalid research claim count.')
        try:
            observed = date.fromisoformat(b['assigned_on'])
            if observed > datetime.now(timezone.utc).date():
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError('Assignment date must be a real date, not in the future.') from None
        batches.add(ident)
        assigned.update(ids)
    return obj


def version(old, previous_path=None):
    obj = json.loads(json.dumps(old))
    obj['revision'] += 1
    obj['parent_sha256'] = digest(previous_path) if previous_path else hashlib.sha256(
        json.dumps(old, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return obj


def assign(old, *, batch_id, ids, after, assigned_on, source='historical_prompt',
           manifest_sha256=None, root=ROOT, previous_path=None):
    positions = {x: i for i, x in enumerate(directory_ids(root))}
    existing = {x for b in old['batches'] for x in b['directory_ids']}
    if not isinstance(batch_id, str) or not batch_id.strip() or batch_id in {b['batch_id'] for b in old['batches']}:
        raise ValueError('A distinct nonempty batch ID is required.')
    if (not ids or len(ids) > 100 or len(set(ids)) != len(ids) or
            any(x not in positions or x in existing for x in ids)):
        raise ValueError('Unknown, repeated or already assigned directory ID.')
    if ids != sorted(ids, key=lambda x: positions[x]):
        raise ValueError('Guide IDs must follow imported directory order, not numeric order.')
    if after is not None and (after not in positions or positions[after] >= positions[ids[0]]):
        raise ValueError('--after must precede the selected guides in the imported directory.')
    try:
        d = date.fromisoformat(assigned_on)
        if d > datetime.now(timezone.utc).date():
            raise ValueError()
    except (ValueError, TypeError):
        raise ValueError('Invalid or future assignment date.') from None
    if source not in ('historical_prompt', 'validated_manifest') or (
            source == 'historical_prompt' and manifest_sha256 is not None) or (
            source == 'validated_manifest' and not _sha(manifest_sha256)):
        raise ValueError('Manifest evidence is inconsistent with assignment source.')
    obj = version(old, previous_path)
    obj['batches'].append({
        'batch_id': batch_id, 'directory_ids': ids, 'after': after, 'next_after': ids[-1],
        'assigned_on': assigned_on, 'source': source, 'manifest_sha256': manifest_sha256,
        'state': 'assigned', 'handoff_sha256': None, 'held_directory_ids': [], 'claim_records': 0})
    return obj


def reserve(old, manifest_path, batch_id, assigned_on, root=ROOT, previous_path=None):
    manifest = read(manifest_path)
    if (not isinstance(manifest, dict) or manifest.get('format') != BATCH_FORMAT or
            not isinstance(manifest.get('records'), list) or not manifest['records'] or
            manifest.get('source_sha256', {}).get('oregon_guides') != digest(root / 'lib/oregon-guides.json') or
            manifest['source_sha256'].get('guide_enrichment') != digest(root / 'lib/guide-enrichment.json')):
        raise ValueError('Invalid or stale research manifest.')
    assigned = {x for b in old['batches'] for x in b['directory_ids']}
    expected = make_batch(root=root, after=manifest['after'], limit=manifest['limit'], excluded_ids=assigned)
    if (manifest['records'] != expected['records'] or
            manifest['next_after'] != expected['next_after'] or
            manifest['counts']['selected'] != len(manifest['records'])):
        raise ValueError('Manifest is not the current eligible, unassigned selection.')
    return assign(old, batch_id=batch_id, ids=[r['directory_id'] for r in manifest['records']],
                  after=manifest['after'], assigned_on=assigned_on, source='validated_manifest',
                  manifest_sha256=digest(manifest_path), root=root, previous_path=previous_path)


def returned(old, *, batch_id, handoff_path, holds_path, root=ROOT, previous_path=None, today=None):
    candidates = [b for b in old['batches'] if b['batch_id'] == batch_id]
    if len(candidates) != 1 or candidates[0]['state'] != 'assigned':
        raise ValueError('Batch must exist and still be assigned.')
    payload = read(handoff_path)
    if payload == {'schema_version': 1, 'records': []}:
        valid_ids, claim_records = set(), 0
    else:
        result = validate_handoff(payload, root=root, today=today)
        if not result['valid']:
            raise ValueError('The proposed claim handoff failed strict schema validation.')
        valid_ids = {r['directory_id'] for r in result['records']}
        claim_records = len(result['records'])
    holds = load_holds(holds_path, root=root)
    expected, held = set(candidates[0]['directory_ids']), set(holds)
    if valid_ids & held or valid_ids | held != expected:
        raise ValueError('Each assigned guide must be accounted for once as a claim or an explicit manual hold.')
    obj = version(old, previous_path)
    for b in obj['batches']:
        if b['batch_id'] == batch_id:
            b.update(state='returned_for_schema_review', handoff_sha256=digest(handoff_path),
                     held_directory_ids=sorted(held), claim_records=claim_records)
            break
    return obj


def next_batch(old, *, root=ROOT, limit=15, after=None):
    assigned = {x for b in old['batches'] for x in b['directory_ids']}
    if after is None and old['batches']:
        positions = {x: i for i, x in enumerate(directory_ids(root))}
        after = max((b['next_after'] for b in old['batches']), key=lambda x: positions[x])
    return make_batch(root=root, after=after, limit=limit, excluded_ids=assigned)


def status(old, *, root=ROOT):
    assigned = {x for b in old['batches'] for x in b['directory_ids']}
    returned_ids = {x for b in old['batches'] if b['state'] == 'returned_for_schema_review'
                    for x in b['directory_ids']}
    held = {x for b in old['batches'] for x in b['held_directory_ids']}
    candidates = inventory(root)['website_candidates']
    upcoming = next_batch(old, root=root)
    return {
        'format': 'ratemyguidepnw-research-assignment-status-v1',
        'batches_recorded': len(old['batches']), 'guides_assigned': len(assigned),
        'guides_returned_for_schema_review': len(returned_ids),
        'guides_assigned_not_returned': len(assigned - returned_ids),
        'guides_on_manual_hold': len(held),
        'remaining_unassigned_website_candidates': sum(
            c['directory_id'] not in assigned and not c['has_enrichment'] for c in candidates),
        'next_after': upcoming['after'],
        'next_batch_ids': [r['directory_id'] for r in upcoming['records']],
        'warning': 'Tracked means assigned, not verified, licensed or published.'}


def write_new(out, data, root=ROOT, as_markdown=False):
    path = _private_output(out, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as f:
        f.write(markdown(data) if as_markdown else json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    return path


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=('init', 'record', 'reserve', 'return', 'next', 'status'))
    p.add_argument('--ledger', type=Path)
    p.add_argument('--out', type=Path)
    p.add_argument('--batch-id')
    p.add_argument('--ids', help='Comma-separated existing registration IDs from a prior prompt')
    p.add_argument('--after')
    p.add_argument('--assigned-on', default=datetime.now(timezone.utc).date().isoformat())
    p.add_argument('--manifest', type=Path)
    p.add_argument('--handoff', type=Path)
    p.add_argument('--holds', type=Path)
    p.add_argument('--limit', type=int, default=15)
    p.add_argument('--format', choices=('json', 'markdown'), default='json')
    a = p.parse_args(argv)
    try:
        if a.command == 'init':
            if a.ledger:
                raise ValueError('init cannot use --ledger.')
            obj = empty()
        else:
            obj = load(a.ledger)
        if a.command in ('init', 'record', 'reserve', 'return') and not a.out:
            raise ValueError('State-changing operations require a new --out file.')
        if a.command == 'record':
            if not a.ids or not a.batch_id:
                raise ValueError('record needs --ids and --batch-id.')
            obj = assign(obj, batch_id=a.batch_id, ids=[v.strip() for v in a.ids.split(',')],
                         after=a.after, assigned_on=a.assigned_on, previous_path=a.ledger)
        elif a.command == 'reserve':
            if not a.manifest or not a.batch_id:
                raise ValueError('reserve needs --manifest and --batch-id.')
            obj = reserve(obj, a.manifest, a.batch_id, a.assigned_on, previous_path=a.ledger)
        elif a.command == 'return':
            if not a.ledger or not a.batch_id or not a.handoff or not a.holds:
                raise ValueError('return needs --ledger, --batch-id, --handoff, --holds.')
            obj = returned(obj, batch_id=a.batch_id, handoff_path=a.handoff,
                           holds_path=a.holds, previous_path=a.ledger)
        elif a.command == 'next':
            obj = next_batch(obj, limit=a.limit, after=a.after)
        elif a.command == 'status':
            obj = status(obj)
        if a.out:
            target = write_new(a.out, obj, as_markdown=a.command == 'next' and a.format == 'markdown')
            print(json.dumps({'written': str(target), 'command': a.command}))
        else:
            print(markdown(obj) if a.command == 'next' and a.format == 'markdown'
                  else json.dumps(obj, indent=2, ensure_ascii=False))
        return 0
    except (ValueError, OSError, TypeError, KeyError, json.JSONDecodeError) as exc:
        p.error(str(exc))


if __name__ == '__main__':
    raise SystemExit(main())
