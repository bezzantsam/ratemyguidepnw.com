#!/usr/bin/env python3
"""Review-only editorial signoff records for imported guide claims.

This tool NEVER edits the public guide directory, publishes a profile, verifies a
license, contacts a guide, or treats a research agent's evidence as verified.
Human-attested claim decisions produce an offline PROPOSAL for separate review.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path

from enrichment_handoff import digest, read
from enrichment_review_queue import FORMAT as QUEUE_FORMAT, _private_output

ROOT = Path(__file__).resolve().parents[1]
FORMAT = 'ratemyguidepnw-editorial-claim-decisions-v1'
PROPOSAL_FORMAT = 'ratemyguidepnw-unpublished-claim-proposal-v1'
REVIEW_DECISIONS = {'unreviewed', 'needs_more_evidence', 'reject', 'approve_for_proposal'}
CHECK_KEYS = {'source_content', 'operator_identity', 'publication_rights'}
CLAIM_KEYS = {'claim_sha256', 'directory_id', 'kind', 'value', 'source_ids',
              'decision', 'selected_source_id', 'reviewer', 'reviewed_on', 'note', 'checks'}


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                      allow_nan=False).encode('utf-8')


def claim_hash(ident: str, kind: str, claim: dict, sources_by_id: dict) -> str:
    """Bind a decision to content and original evidence, not just a URL or alias."""
    references = sorted((sources_by_id[sid]['url'], sources_by_id[sid]['source_type'],
                         sources_by_id[sid]['observed_on']) for sid in claim['source_ids'])
    return hashlib.sha256(canonical({
        'directory_id': ident, 'kind': kind, 'value': claim['value'],
        'sources': references,
    })).hexdigest()


def load_queue(path: Path, *, root: Path = ROOT) -> tuple[dict, str]:
    """Verify baseline and every input batch digest before trusting a queue snapshot."""
    path = Path(path).resolve()
    staging = (Path(root) / 'research-drafts').resolve()
    if not path.is_relative_to(staging):
        raise ValueError('Review queues must be loaded from ignored research-drafts.')
    queue = read(path)
    if (not isinstance(queue, dict) or queue.get('format') != QUEUE_FORMAT
            or queue.get('mode') != 'offline_pending_human_review_only'
            or not isinstance(queue.get('records'), list)
            or not isinstance(queue.get('source_batches'), list)
            or not queue['source_batches']):
        raise ValueError('Expected a versioned offline review queue.')
    baseline = digest(Path(root) / 'lib/guide-enrichment.json')
    if queue.get('baseline_sha256') != baseline:
        raise ValueError('Review queue baseline differs from current enrichment; rebuild queue.')
    seen = set()
    for item in queue['source_batches']:
        if not isinstance(item, dict) or not isinstance(item.get('filename'), str):
            raise ValueError('Malformed source-batch reference.')
        name = item['filename']
        if Path(name).name != name or name in seen or name in ('.', '..'):
            raise ValueError('Unsafe or duplicate research batch filename.')
        seen.add(name)
        source = (path.parent / name).resolve()
        if not source.is_relative_to(staging) or not source.is_file() or digest(source) != item.get('sha256'):
            raise ValueError(f'Source batch missing, moved, or altered: {name}')
    return queue, digest(path)


def prepare_template(queue: dict, queue_digest: str) -> dict:
    """All mutable claim decisions start UNREVIEWED; no agent-created approvals."""
    claims = []
    for row in queue['records']:
        if row.get('status') != 'pending_human_source_review':
            continue
        ident = row['directory_id']
        refs = {s['id']: s for s in row['sources']}
        for field, kind in (('aliases', 'alias'), ('waterways', 'waterway')):
            for claim in row['proposed_additions'][field]:
                if not all(sid in refs for sid in claim['source_ids']):
                    raise ValueError(f'{ident}: proposed claim has no source reference')
                claims.append({
                    'claim_sha256': claim_hash(ident, kind, claim, refs),
                    'directory_id': ident, 'kind': kind, 'value': claim['value'],
                    'source_ids': claim['source_ids'],
                    'decision': 'unreviewed', 'selected_source_id': None,
                    'reviewer': None, 'reviewed_on': None, 'note': '',
                    'checks': {'source_content': False, 'operator_identity': False,
                               'publication_rights': False},
                })
    claims.sort(key=lambda x: (x['directory_id'], x['kind'], x['value'].casefold()))
    hashes = [row['claim_sha256'] for row in claims]
    if len(hashes) != len(set(hashes)):
        raise ValueError('The queue contains duplicate content-identical claims.')
    return {
        'format': FORMAT, 'mode': 'human_attestation_required',
        'queue_sha256': queue_digest, 'baseline_sha256': queue['baseline_sha256'],
        'claims': claims,
        'warning': 'Do not mark a claim approved without independently checking its exact source and operator. Nothing here publishes.',
    }


def evaluate_decisions(queue: dict, template: dict, submitted: dict, *, today: date | None = None) -> dict:
    """Reject stale, changed, incomplete or unauthenticated approvals. Make no writes."""
    today = today or datetime.now(timezone.utc).date()
    if (not isinstance(submitted, dict) or set(submitted) != set(template)
            or any(submitted[k] != template[k] for k in template if k != 'claims')
            or not isinstance(submitted['claims'], list)):
        raise ValueError('Decision file does not match its immutable template and queue fingerprint.')
    expected = {row['claim_sha256']: row for row in template['claims']}
    if len(expected) != len(submitted['claims']):
        raise ValueError('Decision file is missing, duplicating, or adding claims.')
    queue_by_id = {row['directory_id']: row for row in queue['records']
                   if row['status'] == 'pending_human_source_review'}
    reviewed = set()
    approvals = {}
    counts = {v: 0 for v in sorted(REVIEW_DECISIONS)}
    for row in submitted['claims']:
        if not isinstance(row, dict) or set(row) != CLAIM_KEYS:
            raise ValueError('Each decision must have the exact review-claim keys.')
        cid = row['claim_sha256']
        if cid not in expected or cid in reviewed:
            raise ValueError('Unknown or duplicate claim fingerprint.')
        reviewed.add(cid)
        original = expected[cid]
        for key in ('claim_sha256', 'directory_id', 'kind', 'value', 'source_ids'):
            if row[key] != original[key]:
                raise ValueError(f'{cid}: original claim/evidence fields were modified.')
        state = row['decision']
        if state not in REVIEW_DECISIONS:
            raise ValueError(f'{cid}: unsupported editorial decision.')
        checks = row['checks']
        if (not isinstance(checks, dict) or set(checks) != CHECK_KEYS
                or any(type(v) is not bool for v in checks.values())):
            raise ValueError(f'{cid}: three explicit boolean reviewer checks required.')
        if state == 'unreviewed':
            if any(row[k] != original[k] for k in
                   ('selected_source_id', 'reviewer', 'reviewed_on', 'note', 'checks')):
                raise ValueError(f'{cid}: unreviewed claims cannot carry a signoff.')
            counts[state] += 1
            continue
        if (not isinstance(row['reviewer'], str) or len(row['reviewer'].strip()) < 2
                or not isinstance(row['note'], str) or len(row['note'].strip()) < 15):
            raise ValueError(f'{cid}: a named reviewer and substantive note are required.')
        try:
            reviewed_on = date.fromisoformat(row['reviewed_on'])
            if reviewed_on > today:
                raise ValueError()
        except (TypeError, ValueError):
            raise ValueError(f'{cid}: review date invalid or in the future.') from None
        if state != 'approve_for_proposal':
            if row['selected_source_id'] is not None or any(checks.values()):
                raise ValueError(f'{cid}: held/rejected claims cannot carry an approval check or selected source.')
        else:
            if not all(checks.values()):
                raise ValueError(f'{cid}: all three explicit human attestations are required.')
            if row['selected_source_id'] not in row['source_ids']:
                raise ValueError(f'{cid}: approval must select a cited source ID.')
            qrow = queue_by_id.get(row['directory_id'])
            if qrow is None:
                raise ValueError(f'{cid}: held, missing or invalid guide cannot be approved.')
            source = next((s for s in qrow['sources'] if s['id'] == row['selected_source_id']), None)
            if source is None or not source['url'].startswith('https://'):
                raise ValueError(f'{cid}: approved source must be verified-format HTTPS evidence.')
            if date.fromisoformat(source['observed_on']) > reviewed_on:
                raise ValueError(f'{cid}: review date predates the original evidence observation.')
            item = approvals.setdefault(row['directory_id'], {'searchAliases': [], 'advertisedWaters': [], 'sourceLinks': []})
            if row['kind'] == 'alias':
                item['searchAliases'].append(row['value'])
            else:
                item['advertisedWaters'].append({
                    'name': row['value'], 'sourceUrl': source['url'],
                    'sourceType': source['source_type'], 'observedOn': source['observed_on'],
                })
            link = {'label': 'Operator website' if source['source_type'] == 'operator_site'
                    else 'Third-party directory', 'url': source['url'],
                    'sourceType': source['source_type'], 'observedOn': source['observed_on']}
            if link not in item['sourceLinks']:
                item['sourceLinks'].append(link)
        counts[state] += 1
    return {'format': PROPOSAL_FORMAT, 'status': 'unpublished_editorial_proposal_only',
            'queue_sha256': template['queue_sha256'],
            'baseline_sha256': template['baseline_sha256'],
            'decision_counts': counts, 'candidate_additions': approvals,
            'warning': 'Human attestations are recorded, not independently proved by software. This is NOT a publication command or approval to deploy.'}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('template', 'evaluate'))
    parser.add_argument('--queue', type=Path, required=True)
    parser.add_argument('--decisions', type=Path, help='Required for evaluate; generated template edited by reviewer')
    parser.add_argument('--out', type=Path, required=True, help='New file under ignored research-drafts/')
    args = parser.parse_args(argv)
    try:
        target = _private_output(args.out, ROOT)
        if target.exists():
            raise ValueError('Output file exists; choose a new name.')
        queue, source_hash = load_queue(args.queue)
        template = prepare_template(queue, source_hash)
        if args.command == 'evaluate':
            if args.decisions is None:
                raise ValueError('evaluate requires --decisions.')
            submitted = read(args.decisions)
            result = evaluate_decisions(queue, template, submitted)
        else:
            if args.decisions is not None:
                raise ValueError('template does not accept --decisions.')
            result = template
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('x', encoding='utf-8') as handle:
            json.dump(result, handle, indent=2, ensure_ascii=False)
            handle.write('\n')
        print(json.dumps({'output': str(target), 'claims': len(template['claims']),
                          'candidate_guides': len(result.get('candidate_additions', {}))}))
        return 0
    except (ValueError, OSError, TypeError, KeyError, json.JSONDecodeError) as exc:
        parser.error(str(exc))


if __name__ == '__main__':
    raise SystemExit(main())
