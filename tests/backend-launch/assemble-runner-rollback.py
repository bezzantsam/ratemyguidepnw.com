#!/usr/bin/env python3
"""Generate an emergency-disable body for a transaction-owning migration runner."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
lines = (root / 'supabase/review-candidates/emergency-disable.sql').read_text().splitlines(keepends=True)
if sum(line == 'BEGIN;\n' for line in lines) != 1 or sum(line == 'COMMIT;\n' for line in lines) != 1:
    raise SystemExit('Unexpected transaction wrappers')
sys.stdout.write(''.join(line for line in lines if line not in ('BEGIN;\n', 'COMMIT;\n')))
