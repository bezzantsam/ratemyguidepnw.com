#!/usr/bin/env python3
"""Extract exactly one assigned, complete Gemini claim handoff from a conversation.

Never verifies websites, licenses, identities or publishes data. A transcript
may contain instructions, examples, previous batches and unrelated JSON.
A batch is eligible only if its claims PLUS explicit manual holds cover
every assigned guide ID exactly once, without overlaps.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

from enrichment_handoff import digest, load_directory, read, validate_handoff
from enrichment_review_queue import _private_output, load_holds

ROOT = Path(__file__).resolve().parents[1]
FORMAT = 'ratemyguidepnw-gemini-transcript-intake-v1'
START = re.compile(r'(?m)^\{[ \t]*(?:\r?\n|$)')
MAX_TRANSCRIPT_BYTES = 5_000_000


def load_assignment(path: Path, *, root: Path = ROOT) -> dict:
    """Exact assignment provenance; directory IDs must follow source import order."""
    item = read(path)
    if (not isinstance(item, dict) or set(item) != {'schema_version', 'batch_id', 'directory_ids'}
            or type(item['schema_version']) is not int or item['schema_version'] != 1):
        raise ValueError('Assignment needs schema_version=1, batch_id, directory_ids only.')
    if not isinstance(item['batch_id'], str) or not item['batch_id'].strip():
        raise ValueError('Assignment batch_id must be nonempty.')
    ids = item['directory_ids']
    imported, _, _, known = load_directory(root)
    positions = {r['registration']: index for index, r in enumerate(imported)}
    if (not isinstance(ids, list) or not 1 <= len(ids) <= 100 or
            any(not isinstance(v, str) or v not in known or v not in positions for v in ids) or
            len(ids) != len(set(ids)) or ids != sorted(ids, key=positions.__getitem__)):
        raise ValueError('Assigned IDs must be unique existing Oregon IDs in imported order.')
    return item


def json_roots(transcript: str):
    """Parse only standalone top-level JSON objects, never guessed substring fragments."""
    parser = json.JSONDecoder()
    for match in START.finditer(transcript):
        try:
            item, consumed = parser.raw_decode(transcript, match.start())
        except (ValueError, TypeError):
            continue
        if isinstance(item, dict):
            yield {
                'document': item,
                'start_line': transcript.count('\n', 0, match.start()) + 1,
                'end_line': transcript.count('\n', 0, match.start() + consumed) + 1,
                'span_sha256': hashlib.sha256(transcript[match.start():match.start() + consumed].encode('utf-8')).hexdigest(),
            }


def intake(text: str, *, assigned: dict, holds: dict, root: Path = ROOT, today=None) -> tuple[dict, dict]:
    expected = set(assigned['directory_ids'])
    held = set(holds)
    if not held.issubset(expected):
        raise ValueError('Manual hold list includes guides outside the assigned batch.')
    eligible = []
    for root_item in json_roots(text):
        doc = root_item['document']
        if (set(doc) != {'schema_version', 'records'} or
                type(doc['schema_version']) is not int or doc['schema_version'] != 1 or
                not isinstance(doc['records'], list) or not 1 <= len(doc['records']) <= 100):
            continue
        if any(not isinstance(r, dict) or not isinstance(r.get('directory_id'), str) for r in doc['records']):
            continue
        ids = [r['directory_id'] for r in doc['records']]
        if len(ids) != len(set(ids)) or set(ids) & held or set(ids) | held != expected:
            continue
        eligible.append(root_item)

    if len(eligible) != 1:
        raise ValueError(f'Expected exactly one complete assigned handoff; found {len(eligible)}. '
                         'The transcript may contain examples, multiple revisions or missing holds; resolve manually.')

    chosen = eligible[0]
    payload = chosen['document']
    validation = validate_handoff(payload, root=root, today=today)
    if not validation['valid']:
        problems = [{'directory_id': r['directory_id'], 'errors': r['errors']}
                    for r in validation['records'] if r['errors']]
        raise ValueError('Full-coverage handoff failed repository validation: ' +
                         json.dumps(problems, ensure_ascii=False))
    rows = [r['directory_id'] for r in payload['records']]
    report = {
        'format': FORMAT, 'mode': 'offline_intake_only',
        'batch_id': assigned['batch_id'],
        'directory_ids': assigned['directory_ids'],
        'pending_review_directory_ids': rows,
        'held_directory_ids': [v for v in assigned['directory_ids'] if v in held],
        'source_span': {key: chosen[key] for key in ('start_line', 'end_line', 'span_sha256')},
        'counts': {
            'assigned': len(expected), 'pending_review': len(rows), 'manual_holds': len(held),
            'source_references': sum(len(row['sources']) for row in payload['records']),
            'alias_claims': sum(len(row['aliases']) for row in payload['records']),
            'waterway_claims': sum(len(row['waterways']) for row in payload['records']),
        },
        'warning': 'Structural validation only. No independent source-content, identity, license, or website verification. No publication.',
    }
    return payload, report


def _private_input(path: Path, root: Path) -> Path:
    target = _private_output(path, root)
    if not target.is_file():
        raise ValueError('Input file is missing from ignored research-drafts.')
    return target


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--transcript', type=Path, required=True)
    parser.add_argument('--assignment', type=Path, required=True)
    parser.add_argument('--holds', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        transcript_path = _private_input(args.transcript, ROOT)
        assignment_path = _private_input(args.assignment, ROOT)
        holds_path = _private_input(args.holds, ROOT)
        target = _private_output(args.out, ROOT)
        receipt_path = _private_output(args.receipt, ROOT)
        if (target == receipt_path or target in (transcript_path, assignment_path, holds_path) or
                receipt_path in (transcript_path, assignment_path, holds_path)):
            raise ValueError('Input, output and receipt paths must all be distinct.')
        if target.exists() or receipt_path.exists():
            raise ValueError('Output or receipt already exists; intake never overwrites files.')
        if transcript_path.stat().st_size > MAX_TRANSCRIPT_BYTES:
            raise ValueError('Transcript too large; split it into smaller research exports.')
        assignment = load_assignment(assignment_path)
        holds = load_holds(holds_path)
        payload, report = intake(transcript_path.read_text(encoding='utf-8'),
                                 assigned=assignment, holds=holds, today=datetime.now(timezone.utc).date())
        report['input_sha256'] = {
            'transcript': digest(transcript_path), 'assignment': digest(assignment_path),
            'holds': digest(holds_path),
        }
        output_text = json.dumps(payload, indent=2, ensure_ascii=False) + '\n'
        report['handoff_sha256'] = hashlib.sha256(output_text.encode('utf-8')).hexdigest()
        target.parent.mkdir(parents=True, exist_ok=True)
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        with target.open('x', encoding='utf-8') as f:
            f.write(output_text)
        try:
            with receipt_path.open('x', encoding='utf-8') as f:
                json.dump(report, f, indent=2, ensure_ascii=False)
                f.write('\n')
        except (OSError, ValueError):
            target.unlink(missing_ok=True)
            raise
        print(json.dumps({'handoff': str(target), 'receipt': str(receipt_path),
                          'counts': report['counts']}))
        return 0
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        parser.error(str(exc))


if __name__ == '__main__':
    raise SystemExit(main())
