#!/usr/bin/env python3
"""Assemble one runner-managed launch or emergency-disable transaction body."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[2] / 'supabase/review-candidates'
groups = {
    'launch': ('launch-migration-body.sql', 'review-reporting-migration-body.sql', 'review-month-recovery-migration-body.sql'),
    'disable': ('emergency-disable-migration-body.sql', 'disable-review-reporting.sql', 'disable-review-v26.sql'),
}
if len(sys.argv) != 2 or sys.argv[1] not in groups:
    raise SystemExit('Usage: assemble-final-launch.py launch|disable')
chunks = ['-- Generated transaction-runner body; do not add embedded BEGIN/COMMIT.\n']
for name in groups[sys.argv[1]]:
    text = (root / name).read_text()
    if not text.endswith('\n') or re.search(r'(?im)^\s*(BEGIN|COMMIT|ROLLBACK)\s*;\s*$', text):
        raise SystemExit('Unexpected transaction control or missing final newline: ' + name)
    chunks.extend(['\n-- BEGIN SOURCE: '+name+'\n', text, '-- END SOURCE: '+name+'\n'])
sys.stdout.write(''.join(chunks))
