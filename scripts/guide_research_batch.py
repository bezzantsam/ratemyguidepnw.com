#!/usr/bin/env python3
"""Generate review-only Oregon guide research batches from the imported directory.

No network access, no verification, no changes to public profile files.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from enrichment_handoff import website_candidate

ROOT = Path(__file__).resolve().parents[1]
FORMAT = 'ratemyguidepnw-oregon-research-batch-v1'


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_exclusions(path: Path | None) -> set[str]:
    if path is None:
        return set()
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, list) or any(not isinstance(item, str) for item in data):
        raise ValueError('Exclusion file must be a JSON array of directory ID strings.')
    if len(set(data)) != len(data):
        raise ValueError('Exclusion file contains duplicate directory IDs.')
    return set(data)


def make_batch(root: Path = ROOT, *, limit: int = 15, after: str | None = None,
               excluded_ids: set[str] | None = None) -> dict:
    if not 1 <= limit <= 100:
        raise ValueError('Limit must be an integer from 1 to 100.')
    directory_path = root / 'lib/oregon-guides.json'
    enrichment_path = root / 'lib/guide-enrichment.json'
    directory = json.loads(directory_path.read_text(encoding='utf-8'))
    enrichment = json.loads(enrichment_path.read_text(encoding='utf-8'))
    ids = [r['registration'] for r in directory]
    if len(set(ids)) != len(ids):
        raise ValueError('Imported Oregon directory contains duplicate registration IDs.')
    known_ids = set(ids)
    positions = {ident: index for index, ident in enumerate(ids)}
    excluded_ids = excluded_ids or set()
    if not excluded_ids.issubset(known_ids):
        raise ValueError('Unknown excluded ID(s): ' + ', '.join(sorted(excluded_ids - known_ids)))
    if after is not None and after not in known_ids:
        raise ValueError(f'Unknown --after directory ID: {after}')
    start = positions[after] + 1 if after else 0
    candidates = []
    for record in directory:
        url = website_candidate(record.get('website'))
        if url and record['registration'] not in enrichment:
            candidates.append((record, url))
    eligible = [(record, url) for record, url in candidates
                if record['registration'] not in excluded_ids]
    selected = [(record, url) for record, url in eligible
                if positions[record['registration']] >= start][:limit]
    records = [{
        'directory_id': record['registration'],
        'imported_name': record['name'],
        'imported_business': record.get('business'),
        'candidate_website': url,
        'website_verified': False,
        'publication_status': 'research_only',
    } for record, url in selected]
    next_cursor = records[-1]['directory_id'] if records else after
    return {
        'format': FORMAT,
        'generated_at_utc': datetime.now(timezone.utc).isoformat(),
        'source_sha256': {
            'oregon_guides': sha256(directory_path),
            'guide_enrichment': sha256(enrichment_path),
        },
        'after': after,
        'next_after': next_cursor,
        'limit': limit,
        'counts': {
            'unenriched_website_candidates': len(candidates),
            'excluded_in_progress': len(candidates) - len(eligible),
            'eligible_from_cursor': len([1 for record, _ in eligible
                                         if positions[record['registration']] >= start]),
            'selected': len(records),
        },
        'records': records,
        'warning': 'Candidate URLs are syntax-checked only. No website, operator identity, advertised waterway, or license was verified.'
    }


def markdown(batch: dict) -> str:
    lines = [
        '# Oregon guide website research batch',
        '',
        batch['warning'],
        '',
        f"Source: imported Oregon directory. {batch['counts']['selected']} records selected. "
        f"Next cursor: \u0060{batch['next_after'] or 'none'}\u0060.",
        '',
        '| Directory ID | Imported guide | Imported business | Candidate website |',
        '|---|---|---|---|',
    ]
    def cell(value):
        return str(value or '').replace('|', '\\|').replace('\n', ' ')
    lines.extend(f"| {cell(r['directory_id'])} | {cell(r['imported_name'])} | "
                 f"{cell(r['imported_business'])} | {cell(r['candidate_website'])} |"
                 for r in batch['records'])
    lines += [
        '',
        'For each record, independently open the candidate URL and verify the operator identity, '
        'current website ownership, advertised fishing waterways and citations. Flag dead, expired, '
        'hijacked or mismatched websites; do not invent evidence or observation dates.',
        '',
        'Return an evidence table with source URLs and actual inspection dates, plus a '
        '\u0060schema_version: 1\u0060 / \u0060pending_review\u0060 handoff compatible with '
        '\u0060scripts/enrichment_handoff.py validate\u0060. Keep boats, crew and contacts in a '
        'separate human-review section, since the validator cannot accept those fields. '
        'Do not publish, merge identities or modify public data.',
        '',
    ]
    return '\n'.join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit', type=int, default=15)
    parser.add_argument('--after', help='Existing Oregon directory ID to continue after, even if already enriched')
    parser.add_argument('--exclude-file', type=Path, help='JSON array of IDs assigned elsewhere/in progress')
    parser.add_argument('--format', choices=('markdown', 'json'), default='markdown')
    parser.add_argument('--output', type=Path, help='Optional file under ignored research-drafts only')
    args = parser.parse_args()
    try:
        batch = make_batch(limit=args.limit, after=args.after,
                           excluded_ids=load_exclusions(args.exclude_file))
        rendered = markdown(batch) if args.format == 'markdown' else json.dumps(batch, indent=2, ensure_ascii=False) + '\n'
        if args.output:
            target = args.output.resolve()
            staging = (ROOT / 'research-drafts').resolve()
            if not target.is_relative_to(staging):
                raise ValueError('Outputs must stay under research-drafts; public data cannot be overwritten.')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(rendered, encoding='utf-8')
            print(json.dumps({'output': str(target), 'selected': len(batch['records']),
                              'next_after': batch['next_after']}))
        else:
            print(rendered, end='')
        return 0
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == '__main__':
    raise SystemExit(main())
