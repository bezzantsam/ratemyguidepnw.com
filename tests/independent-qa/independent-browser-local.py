#!/usr/bin/env python3
"""Entrypoint for 05 local browser/Next/Auth test; guarded ephemeral CI only."""
import os
from pathlib import Path
import re
import subprocess
import sys

try:
    project=os.environ.get('RMG_LOCAL_PROJECT','')
    runid=os.environ.get('GITHUB_RUN_ID','');attempt=os.environ.get('GITHUB_RUN_ATTEMPT','')
    if os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted' or not runid.isdigit() or not attempt.isdigit() or project!='rmgqa'+runid+attempt: raise ValueError('guard')
    script=Path(__file__).with_name('independent-browser-local.cjs').resolve(strict=True)
    result=subprocess.run(['node',str(script)],env=os.environ.copy(),timeout=360)
    if result.returncode: raise ValueError('test failed')
except Exception:
    print('FAIL guarded local browser entrypoint; details withheld',file=sys.stderr)
    sys.exit(1)
