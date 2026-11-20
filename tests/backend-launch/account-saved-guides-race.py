"""Run only against the disposable account-shortlist fixture socket."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import sys

socket = Path(sys.argv[1]).resolve()
if not (socket / ".s.PGSQL.5432").is_socket() or not socket.name.startswith("rmg-guide-offerings."):
    raise SystemExit("Disposable PostgreSQL fixture socket required")
command = ["psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-h", str(socket), "-U", "audit_owner", "-d", "postgres"]
caller = """
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SET request.jwt.claims='{"is_anonymous":false}';
"""

def query(sql):
    return subprocess.check_output(command, input=sql, text=True).strip()

def save(number):
    return query(caller + f"""
      SELECT public.rmg_account_saved_guides_v1('save',
        '[{{"jurisdiction":"OR","sourceId":"OG.{number:07}.X&Y"}}]')->>'status';
    """)

with ThreadPoolExecutor(max_workers=2) as executor:
    outcomes = sorted(executor.map(save, [48, 49]))
assert outcomes == ["full", "saved"], outcomes
assert query(caller + "SELECT count(source_id) FROM rmg_private.account_saved_guides;") == "50"
print("PASS: concurrent saves serialize at the existing 50-guide cap")
