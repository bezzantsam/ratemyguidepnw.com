#!/usr/bin/env python3
"""Check exact outcome and evidence for all three local-only oracle modes."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
RUNNER=ROOT/'tests/backend-independent-review/run.py'
MARKER='EXPECTED FAILURE: inherited role grants bypass the proposed default-off revocations (synthetic condition)'


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output-dir',required=True)
    args=parser.parse_args()
    out=Path(args.output_dir)
    out.mkdir(parents=True,exist_ok=True)
    cases=(
        ('A characterization',[],0,[MARKER,'PASS qa_inherited: inherited-after.sql']),
        ('B unpatched strict',['--strict'],1,[MARKER,'PASS qa_inherited: inherited-after.sql']),
        ('C candidate strict',['--strict','--candidate','--preflight-json',str(out/'preflight.json'),'--preflight-report',str(out/'preflight.md')],0,['PASS inherited-role regression: effective privileges are blocked','PASS qa_inherited: inherited-blocked.sql','PASS candidate aborts on additional inherited column grant','PASS preflight reports unexpected grants surviving narrow candidate']),
    )
    for name,flags,expected,markers in cases:
        proc=subprocess.run([sys.executable,str(RUNNER),*flags],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
        missing=[marker for marker in markers if marker not in proc.stdout]
        if 'PASS read-only preflight: privilege graph, PUBLIC, overload, RLS, coverage and known-row read' not in proc.stdout:
            missing.append('read-only preflight evidence')
        if 'PASS synthetic ACL-versus-RLS and read-only transaction oracles' not in proc.stdout:
            missing.append('ACL-versus-RLS and transaction evidence')
        if proc.returncode!=expected or missing or (name.startswith('C ') and MARKER in proc.stdout):
            print(f'FAIL {name}: expected exit {expected}; got {proc.returncode}; missing markers: {missing}\n{proc.stdout}',file=sys.stderr)
            return 1
        print(f'PASS {name}: exit {proc.returncode}; expected evidence present',flush=True)
        if name.startswith(('A ','B ')):
            print(MARKER,flush=True)
    scanner=subprocess.run([sys.executable,str(ROOT/'tests/backend-independent-review/client_key_scan.py'),'--self-test','--scan'],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=30)
    if scanner.returncode:
        print('FAIL client-key reference scan (no credential values emitted):\n'+scanner.stdout,file=sys.stderr)
        return 1
    (out/'client-key-scan.txt').write_text(scanner.stdout)
    print(scanner.stdout,flush=True)
    results=json.loads((out/'preflight.json').read_text())
    if set(results)!={'before_candidate','after_candidate'}:
        print('FAIL preflight did not produce before and after results',file=sys.stderr)
        return 1
    print((out/'preflight.md').read_text(),flush=True)
    print('PASS: green CI means the known unpatched regression was reproduced, not repaired',flush=True)
    return 0

if __name__=='__main__':
    raise SystemExit(main())
