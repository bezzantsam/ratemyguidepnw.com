#!/usr/bin/env python3
"""Compose the review-only production candidate; this does not create migration history."""
from pathlib import Path
root=Path(__file__).resolve().parents[2]
base=root/'supabase/review-candidates'
names=['01-authorization-lockdown.sql','02-launch-api.sql','04-review-revisions.sql','05-storage-via-claim-visibility.sql']
parts=['-- REVIEW CANDIDATE ONLY: generated from 01, 02, 04 and 05.','-- 03 targets storage.objects and is intentionally excluded.','BEGIN;']
for name in names:
    lines=(base/name).read_text().splitlines()
    starts=[i for i,v in enumerate(lines) if v=='BEGIN;']
    ends=[i for i,v in enumerate(lines) if v=='COMMIT;']
    if len(starts)!=1 or len(ends)!=1 or starts[0]>=ends[0]:
        raise SystemExit(f'Unexpected transaction boundaries: {name}')
    parts.extend(['',f'-- Source: {name}',*lines[:starts[0]],*lines[starts[0]+1:ends[0]],*lines[ends[0]+1:]])
parts.extend(['','COMMIT;',''])
print('\n'.join(parts),end='')
