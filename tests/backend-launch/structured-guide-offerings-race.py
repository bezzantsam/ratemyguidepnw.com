"""Real concurrent offering mutations on the runner's socket-only fixture."""
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time

socket = Path(sys.argv[1]).resolve(strict=True)
assert socket.name.startswith('rmg-guide-offerings.') and (socket / 'data/PG_VERSION').read_text().strip() == '17'
psql = ['psql','-XAtq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h',str(socket),'-U','audit_owner','-d','postgres']
auth = "SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';"


def save(expected):
    return auth + (" DO $$BEGIN PERFORM public.rmg_guide_offerings_authorized_v1('owner_save',"
                   "jsonb_build_object('jurisdiction','OR','sourceId','OG.0000001',"
                   f"'expectedRevision',{expected},'draft',jsonb_build_object('vessels','[]'::jsonb,'offerings','[]'::jsonb))); END $$;")


def query(sql):
    return subprocess.check_output([*psql,'-c',sql],text=True,timeout=8).strip()


def race(first,second,end,expected=None):
    owner=subprocess.Popen(psql,text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    waiter=None
    try:
        owner.stdin.write('BEGIN;\n'+first+'\n\\echo fixture-ready\n')
        owner.stdin.flush()
        with selectors.DefaultSelector() as status:
            status.register(owner.stdout,selectors.EVENT_READ)
            assert status.select(6) and owner.stdout.readline().strip()=='fixture-ready'
        waiter=subprocess.Popen([*psql,'-c',second],env={**os.environ,'PGAPPNAME':'offerings_waiter'},
                                text=True, stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        deadline=time.monotonic()+6
        while query("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name='offerings_waiter'"
                    " AND cardinality(pg_blocking_pids(pid))>0)")!='t':
            assert time.monotonic()<deadline, 'fixture operation did not wait for its database lock'
            time.sleep(0.03)
        owner.stdin.write(end+'\n\\q\n')
        owner.stdin.flush()
        _, error=owner.communicate(timeout=8)
        assert owner.returncode==0,error
        _, error=waiter.communicate(timeout=8)
        assert (waiter.returncode!=0 and expected in error) if expected else waiter.returncode==0,error
    finally:
        for process in (owner,waiter):
            if process is not None and process.poll() is None:
                process.kill()
                process.communicate(timeout=5)


gate='UPDATE rmg_private.guide_offerings_control_v1 SET enabled='
revision="SELECT revision FROM rmg_private.guide_offerings_drafts_v1 WHERE claim_id='20000000-0000-0000-0000-000000000001'"
assert query(revision)=='2'
race(save(2),save(2),'COMMIT;',expected='P0001')
assert query(revision)=='3'
race(save(3),gate+'false WHERE singleton;','ROLLBACK;')
assert query(revision)=='3' and query('SELECT NOT enabled FROM rmg_private.guide_offerings_control_v1')=='t'
query(gate+'true WHERE singleton;')
race(gate+'false WHERE singleton;',save(3),'COMMIT;',expected='P5030')
assert query(revision)=='3'
query(gate+'true WHERE singleton;')
print('PASS concurrent owner saves admit one winner; offerings-only disable serializes in both lock orders')
