#!/usr/bin/env python3
"""Wrap the pinned reviewed seed in one procedural statement for CLI review."""
import hashlib
from pathlib import Path
import sys

source = Path(__file__).with_name('oregon-mapping-seed-migration-body.sql').read_bytes()
if hashlib.sha256(source).hexdigest() != '04f88b0df9e2e87856063b8e93595a6ba98c1dd2ac8c13212bf483d87818838b':
    raise SystemExit('Unexpected source seed body')
text = source.decode('utf-8')
if text.count('DO $$BEGIN\n') != 2 or text.count('END $$;\n') != 2 or '$rmg_oregon_seed$' in text:
    raise SystemExit('Unexpected source seed procedural boundaries')
text = text.replace('DO $$BEGIN\n', 'BEGIN\n').replace('END $$;\n', 'END;\n')
sys.stdout.write('-- REVIEW CANDIDATE: single-statement CLI seed; requires runner/history validation.\nDO $rmg_oregon_seed$\nBEGIN\n' + text + 'END;\n$rmg_oregon_seed$;\n')
