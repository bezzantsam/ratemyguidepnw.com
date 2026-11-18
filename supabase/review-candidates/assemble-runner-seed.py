#!/usr/bin/env python3
"""Generate a runner-managed seed body; do not execute against a live project."""
from pathlib import Path
import sys

lines = Path(__file__).with_name('oregon-mapping-seed.sql').read_text().splitlines(keepends=True)
if sum(line == 'BEGIN;\n' for line in lines) != 1 or sum(line == 'COMMIT;\n' for line in lines) != 1:
    raise SystemExit('Unexpected transaction wrappers')
if "SET LOCAL lock_timeout = '3s';\n" not in lines or 'LOCK TABLE public.guides, rmg_private.guide_identity_map IN SHARE ROW EXCLUSIVE MODE;\n' not in lines:
    raise SystemExit('Required transaction-scoped safeguards missing')
sys.stdout.write(''.join(line for line in lines if line not in ('BEGIN;\n', 'COMMIT;\n')))
