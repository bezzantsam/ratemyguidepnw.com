#!/usr/bin/env python3
"""Check the next ten records against the pinned 60-record review checkpoint."""
import hashlib
import json
from pathlib import Path

import batch13_next10_review as previous

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'docs/research/BATCH13_NEXT10B_SOURCE_REVIEW_20261115.json'
SELECTION = ROOT / 'docs/research/BATCH13_NEXT10B_SELECTION_20261115.json'
PRIOR_SELECTION = ROOT / 'docs/research/BATCH13_NEXT10_SELECTION_20261115.json'
PRIOR_REVIEW = ROOT / 'docs/research/BATCH13_NEXT10_SOURCE_REVIEW_20261115.json'
STATUSES = previous.STATUSES | {'identity_review_hold', 'historical_source_hold'}


def validate(review, selection_bytes, registry):
    selection = json.loads(selection_bytes)
    for path in (PRIOR_SELECTION, PRIOR_REVIEW):
        previous.require(selection['prior_review_files'].get(path.name) == hashlib.sha256(path.read_bytes()).hexdigest(),
                         'Prior review checkpoint changed')
    old_selection = json.loads(PRIOR_SELECTION.read_text())
    old_review = json.loads(PRIOR_REVIEW.read_text())
    previous.validate(old_review, PRIOR_SELECTION.read_bytes(), registry)
    prior_ids = sorted(set(old_selection['previously_checked_registration_ids']) |
                       {row['registration_id'] for row in old_review['records']})
    previous.require(selection['previously_checked_registration_ids'] == prior_ids, 'Prior 60 IDs changed')
    for key in ('manifest_registration_ids', 'source_commit', 'source_files'):
        previous.require(selection[key] == old_selection[key], 'Original manifest lineage changed')
    previous.require(selection['prior_review_commit'] == '60afe401f035639ec4c2cec46143bbaffe80ee7f',
                     'Prior checkpoint commit changed')
    result = previous.validate(review, selection_bytes, registry, selection_path=SELECTION,
        expected_prior_count=60, source_types={'operator_site', 'industry_directory', 'historical_restored_site'},
        statuses=STATUSES, fetch_results={'tool_unavailable', 'http_403', 'http_404'})
    # Archived copies and external directories may explain an identity/hold, never supply current offerings.
    for row in review['records']:
        if row['review_status'] == 'historical_source_hold':
            previous.require(any(review['sources'][sid]['source_type'] == 'historical_restored_site'
                                 for sid in row['identity']['source_ids']), 'Historical hold lacks archive evidence')
    return result


if __name__ == '__main__':
    print(json.dumps(validate(json.loads(REVIEW.read_text()), SELECTION.read_bytes(),
                             json.loads(previous.REGISTRY.read_text())), indent=2, sort_keys=True))
