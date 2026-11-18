#!/usr/bin/env python3
"""Generate the transaction-runner body for the v2.6 additive candidate."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
lines=(root/'supabase/review-candidates/07-review-month-and-recovery.sql').read_text().splitlines(keepends=True)
if sum(x=='BEGIN;\n' for x in lines)!=1 or sum(x=='COMMIT;\n' for x in lines)!=1:
    raise SystemExit('Unexpected transaction wrappers')
sys.stdout.write(''.join(x for x in lines if x not in ('BEGIN;\n','COMMIT;\n')))
