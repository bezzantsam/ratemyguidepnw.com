#!/usr/bin/env python3
"""Generate a runner-managed additive reporting migration body."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
lines = (root / 'supabase/review-candidates/06-review-reporting.sql').read_text().splitlines(keepends=True)
if sum(line == 'BEGIN;\n' for line in lines) != 1 or sum(line == 'COMMIT;\n' for line in lines) != 1:
    raise SystemExit('Unexpected outer transaction wrappers')
sys.stdout.write(''.join(line for line in lines if line not in ('BEGIN;\n','COMMIT;\n')))
