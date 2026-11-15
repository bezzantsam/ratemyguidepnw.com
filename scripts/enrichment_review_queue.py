#!/usr/bin/env python3
"""Offline, fail-closed research intake queue. Never publishes guide profiles.

Intake is NOT source verification: even structurally valid entries always remain
pending human verification. Batches with the same directory ID are held, not merged.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from enrichment_handoff import digest, load_directory, read, validate_handoff

ROOT = Path(__file__).resolve().parents[1]
FORMAT = 'ratemyguidepnw-enrichment-review-queue-v1'
HOLD_CODES = {'website_security_unverified', 'identity_unresolved', 'not_fishing',
              'source_unreachable', 'operator_review_required', 'other_manual_review'}


def load_holds(path: Path | None, root: Path = ROOT) -> dict[str, list[dict]]:
    if path is None:
        return {}
    payload = read(path)
    if not isinstance(payload, dict) or set(payload) != {'schema_version', 'holds'} or payload['schema_version'] != 1:
        raise ValueError('Hold file must contain schema_version=1 and holds only.')
    if not isinstance(payload['holds'], list) or len(payload['holds']) > 500:
        raise ValueError('holds must be a list with at most 500 entries.')
    _, _, _, known = load_directory(root)
    out = defaultdict(list)
    for item in payload['holds']:
        if not isinstance(item, dict) or set(item) != {'directory_id', 'reason_code', 'reason'}:
            raise ValueError('Each hold needs directory_id, reason_code, reason only.')
        ident, code, reason = item['directory_id'], item['reason_code'], item['reason']
        if not isinstance(ident, str) or ident not in known:
            raise ValueError(f'Unknown held directory ID: {ident!r}')
        if not isinstance(code, str) or code not in HOLD_CODES:
            raise ValueError(f'{ident}: unsupported hold reason_code.')
        if not isinstance(reason, str) or not reason.strip() or len(reason) > 500:
            raise ValueError(f'{ident}: reason must contain 1-500 characters.')
        value = {'reason_code': code, 'reason': reason.strip()}
        if value in out[ident]:
            raise ValueError(f'{ident}: duplicate hold entry.')
        out[ident].append(value)
    return dict(out)


def _evidence_fingerprint(row: dict) -> str:
    """Compare evidence semantically, independent of local arbitrary source IDs/order."""
    by_id = {s['id']: (s['url'], s['source_type'], s['observed_on']) for s in row['sources']}
    claims = []
    for kind in ('aliases', 'waterways'):
        for claim in row[kind]:
            refs = sorted({by_id[sid] for sid in claim['source_ids']})
            claims.append([kind, claim['value'].strip().casefold(), refs])
    stable = json.dumps(sorted(claims, key=lambda c: (c[0], c[1], str(c[2]))),
                        ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(stable.encode('utf-8')).hexdigest()


def build_queue(batch_paths: list[Path], *, root: Path = ROOT, holds: dict[str, list[dict]] | None = None,
                today=None, expected_baseline_sha256: str | None = None) -> dict:
    """Return a single review manifest, with no mutations to source data."""
    if not batch_paths:
        raise ValueError('Supply at least one research batch.')
    if len(batch_paths) > 100:
        raise ValueError('At most 100 batch files may be reviewed at once.')
    normalized_paths = [Path(p).resolve() for p in batch_paths]
    if len(normalized_paths) != len(set(normalized_paths)):
        raise ValueError('A batch file was provided more than once.')
    if len({path.name for path in normalized_paths}) != len(normalized_paths):
        raise ValueError('Batch basenames must be unique for unambiguous review provenance.')
    root = Path(root)
    baseline = digest(root / 'lib/guide-enrichment.json')
    if expected_baseline_sha256 is not None and baseline != expected_baseline_sha256:
        raise ValueError('Enrichment baseline SHA-256 has changed; generate a new review.')
    _, _, _, known = load_directory(root)
    holds = holds or {}
    if not set(holds).issubset(known):
        raise ValueError('Holds contain unknown directory IDs.')
    by_id: dict[str, list[dict]] = defaultdict(list)
    inputs = []
    for path in normalized_paths:
        payload = read(path)
        # validate_handoff reports row-level failures without writing to the directory.
        validation = validate_handoff(payload, root=root, today=today)
        inputs.append({'filename': path.name, 'sha256': digest(path), 'valid': validation['valid'],
                       'records': len(validation['records'])})
        for index, result in enumerate(validation['records']):
            if not isinstance(payload['records'][index], dict):
                raise ValueError(f'{path.name}: non-object record {index} must be fixed in the source batch.')
            source = payload['records'][index]
            ident = result['directory_id']
            if not isinstance(ident, str) or not ident:
                raise ValueError(f'{path.name}: a record has no directory ID.')
            fingerprint = _evidence_fingerprint(source) if not result['errors'] else None
            by_id[ident].append({'batch_file': path.name, 'row_index': index, 'evidence_sha256': fingerprint,
                                 'validation': result})
    records = []
    all_ids = sorted(set(by_id) | set(holds))
    for ident in all_ids:
        submissions = by_id.get(ident, [])
        problems = []
        invalid = any(s['validation']['errors'] for s in submissions)
        if invalid:
            problems.append('invalid_schema')
        if len(submissions) > 1:
            fps = {s['evidence_sha256'] for s in submissions}
            problems.append('duplicate_submission' if len(fps) == 1 else 'conflicting_submissions')
        if holds.get(ident):
            problems.append('manual_hold')
        if not submissions:
            status = 'manual_hold_no_claims'
        elif invalid:
            status = 'invalid_schema'
        elif len(submissions) > 1:
            status = 'conflicting_submissions' if 'conflicting_submissions' in problems else 'duplicate_submission'
        elif holds.get(ident):
            status = 'manual_hold'
        else:
            status = 'pending_human_source_review'
        first = submissions[0]['validation'] if submissions else None
        records.append({'directory_id': ident, 'status': status, 'reasons': problems,
                        'manual_holds': holds.get(ident, []),
                        'submissions': [{'batch_file': s['batch_file'], 'row_index': s['row_index'],
                                         'evidence_sha256': s['evidence_sha256'],
                                         'validation_errors': s['validation']['errors']} for s in submissions],
                        'proposed_additions': first['proposed_additions'] if first and status == 'pending_human_source_review' else None,
                        'sources': first['sources'] if first and status == 'pending_human_source_review' else None})
    totals = {status: sum(row['status'] == status for row in records)
              for status in ('pending_human_source_review', 'manual_hold', 'manual_hold_no_claims',
                             'invalid_schema', 'duplicate_submission', 'conflicting_submissions')}
    return {'format': FORMAT, 'mode': 'offline_pending_human_review_only',
            'baseline_sha256': baseline, 'source_batches': inputs, 'counts': {'unique_directory_ids': len(records), **totals},
            'records': records,
            'warning': 'No source contents verified, no publication approval, no directory or database writes. Recheck all sources manually.'}


def _private_output(path: Path, root: Path) -> Path:
    safe_root = (Path(root) / 'research-drafts').resolve()
    target = Path(path).resolve()
    if not target.is_relative_to(safe_root):
        raise ValueError('Outputs must remain inside ignored research-drafts; public files cannot be overwritten.')
    return target


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', type=Path, action='append', required=True,
                        help='Validated-format handoff JSON; repeat for separate research batches')
    parser.add_argument('--hold-file', type=Path, help='Optional manually maintained JSON security/identity hold list')
    parser.add_argument('--out', type=Path, required=True, help='NEW report inside ignored research-drafts/')
    parser.add_argument('--baseline-sha256', help='Fail closed if the current guide enrichment SHA changed')
    args = parser.parse_args(argv)
    try:
        target = _private_output(args.out, ROOT)
        # Exclusive create: never replace or re-open an existing report.
        if target.exists():
            raise ValueError('Output report already exists; choose a new filename.')
        report = build_queue(args.batch, root=ROOT, holds=load_holds(args.hold_file),
                             today=datetime.now(timezone.utc).date(),
                             expected_baseline_sha256=args.baseline_sha256)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('x', encoding='utf-8') as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
        print(json.dumps({'output': str(target), 'counts': report['counts'],
                          'batch_count': len(report['source_batches'])}))
        # Invalid/overlapping claims require remediation and should fail CI if used there.
        return 2 if any(report['counts'][k] for k in ('invalid_schema', 'duplicate_submission', 'conflicting_submissions')) else 0
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        parser.error(str(exc))


if __name__ == '__main__':
    raise SystemExit(main())
