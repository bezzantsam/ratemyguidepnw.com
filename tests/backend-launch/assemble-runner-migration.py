#!/usr/bin/env python3
"""Generate the runner-managed body from the separately reviewed transaction."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
data = (root / 'supabase/review-candidates/launch-combined.sql').read_text()
lines = data.splitlines(keepends=True)
if sum(line == 'BEGIN;\n' for line in lines) != 1 or sum(line == 'COMMIT;\n' for line in lines) != 1:
    raise SystemExit('Unexpected transaction wrappers')
sys.stdout.write(''.join(line for line in lines if line not in ('BEGIN;\n', 'COMMIT;\n')))
