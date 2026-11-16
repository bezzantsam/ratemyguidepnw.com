#!/usr/bin/env python3
"""Independent synthetic PostgreSQL review. --strict flags the known conditional defect.

No .env, remote connection string, shell, hosted service, or real JWT is used.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
sys.dont_write_bytecode=True
import preflight

ROOT = Path(__file__).resolve().parents[2]
TESTS = ROOT / 'tests/backend-independent-review'


def required(name):
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f'required executable not found: {name}')
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--strict', action='store_true', help='exit nonzero if the conditional inherited-grant bypass reproduces')
    parser.add_argument('--candidate', action='store_true', help='apply the fixture-specific review delta in the inherited-grant database only')
    parser.add_argument('--preflight-json', help='write synthetic catalog results as JSON')
    parser.add_argument('--preflight-report', help='write synthetic catalog summary as Markdown')
    args = parser.parse_args()
    initdb, pgctl, psql = (required(x) for x in ('initdb','pg_ctl','psql'))
    # A clean environment avoids loading connection settings or credentials.
    env = {'PATH': '/usr/bin:/bin:/opt/homebrew/bin', 'LC_ALL': 'C'}
    with tempfile.TemporaryDirectory(prefix='ratemyguide-independent-') as directory:
        socket = Path(directory)
        data = socket / 'data'
        started = False
        inherited_defect = False
        preflight_results = {}
        def run(argv, *, text=None, check=True, extra_env=None):
            result = subprocess.run(argv, input=text, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**env, **(extra_env or {})}, timeout=90)
            if check and result.returncode:
                raise RuntimeError(f'command failed ({result.returncode}): {argv[0]}\n{result.stdout}')
            return result
        def dbcmd(database='postgres'):
            return [psql, '-X', '-v','ON_ERROR_STOP=1','-h',str(socket),'-p','55451','-U','qa_owner','-d',database]
        def sql(database, text):
            return run(dbcmd(database),text=text).stdout
        def file(database, name):
            out=run(dbcmd(database)+['-f',str(name)]).stdout
            print(f'PASS {database}: {name.name}', flush=True)
            return out
        try:
            run([initdb,'-D',str(data),'--username=qa_owner','--auth=trust','--no-locale'])
            run([pgctl,'-D',str(data),'-l',str(socket/'server.log'),'-o',f"-c listen_addresses='' -c unix_socket_directories='{socket}' -p 55451",'-w','start'])
            started=True
            generated=run([sys.executable,str(ROOT/'scripts/backend-audit/reconstruct.py')]).stdout
            for i, database in enumerate(('qa_baseline','qa_locked','qa_enabled','qa_inherited')):
                sql('postgres',f'CREATE DATABASE {database};')
                schema=generated if i == 0 else '\n'.join(line for line in generated.splitlines() if not line.startswith('CREATE ROLE '))
                sql(database,schema)
                file(database, TESTS/'fixtures.sql')
                if database=='qa_baseline':
                    file(database, TESTS/'baseline.sql')
                    absent=preflight.collect(lambda query: run(dbcmd(database)+['-Atq'],text=query).stdout.strip())
                    if 'guide_media' not in absent['coverage']['missing_expected_tables'] or absent['coverage']['storage_definitions']!='uninspected':
                        raise RuntimeError('incomplete baseline catalog was not reported as incomplete')
                    print('PASS preflight marks missing local table and uninspected storage', flush=True)
                    continue
                file(database, TESTS/'drift.sql')
                if database=='qa_inherited':
                    file(database, TESTS/'inherited-before.sql')
                file(database, ROOT/'scripts/backend-audit/proposed-authorization-lockdown.sql')
                if database=='qa_locked':
                    file(database, TESTS/'locked.sql')
                    # Prove the oracle rejects success and an unrelated error;
                    # neither may be counted as an expected denial.
                    for statement, marker in (
                        ("SELECT public.qa_expect('SELECT 1','42501',NULL)", 'unexpected success'),
                        ("SELECT public.qa_expect('SELECT missing_field FROM public.reviews','42501',NULL)", 'wrong error'),
                    ):
                        oracle=run(dbcmd(database)+['-c','SET ROLE anon; '+statement],check=False)
                        if oracle.returncode==0 or marker not in oracle.stdout:
                            raise RuntimeError(f'oracle accepted bad denial test: {oracle.stdout}')
                    print('PASS oracle rejects successful and unrelated-error cases', flush=True)
                elif database=='qa_enabled':
                    file(database, TESTS/'enabled.sql')
                else:
                    file(database, TESTS/'preflight-fixtures.sql')
                    # The catalog query uses only the private socket created
                    # above, and never calls application functions.
                    def catalog_query(query):
                        return run(dbcmd(database)+['-Atq'],text='BEGIN READ ONLY;\n'+query+'\nCOMMIT;').stdout.strip()
                    readonly=run(dbcmd(database)+['-Atq'],text='BEGIN READ ONLY; CREATE TABLE public.qa_readonly_probe (id int); COMMIT;',check=False)
                    if readonly.returncode==0 or 'cannot execute CREATE TABLE in a read-only transaction' not in readonly.stdout:
                        raise RuntimeError('read-only transaction oracle failed: '+readonly.stdout)
                    # ACL says PUBLIC can insert this column, but the synthetic
                    # table's RLS has no anonymous INSERT policy.
                    rls_test="SET ROLE anon; SELECT public.qa_expect($q$INSERT INTO public.guide_media(caption) VALUES ('synthetic')$q$,'42501','new row violates row-level security policy for table \"guide_media\"'); RESET ROLE;"
                    run(dbcmd(database)+['-Atq'],text=rls_test)
                    before=preflight.collect(catalog_query)
                    preflight.assert_adversarial(before)
                    preflight_results['before_candidate']=before
                    read=run(dbcmd(database)+['-Atq'],text="SET ROLE anon; SELECT id FROM public.public_angler_reviews ORDER BY id; RESET ROLE;").stdout.strip()
                    if read != '30000000-0000-0000-0000-000000000001':
                        raise RuntimeError('preflight fixture permitted-read result is not the known published row: '+read)
                    print('PASS read-only preflight: privilege graph, PUBLIC, overload, RLS, coverage and known-row read', flush=True)
                    print('PASS synthetic ACL-versus-RLS and read-only transaction oracles', flush=True)
                    if args.candidate:
                        file(database, TESTS/'candidate-inherited-delta.sql')
                        after=preflight.collect(catalog_query)
                        preflight.assert_after_candidate(after)
                        preflight_results['after_candidate']=after
                        print('PASS preflight reports unexpected grants surviving narrow candidate', flush=True)
                    regression=run(dbcmd(database)+['-f',str(TESTS/'regression-inherited.sql')],check=False)
                    if regression.returncode:
                        if 'assertion failed: inherited roles must not retain customer write or moderation execute' not in regression.stdout:
                            raise RuntimeError('unexpected inherited-grant regression failure:\n'+regression.stdout)
                        inherited_defect=True
                        file(database, TESTS/'inherited-after.sql')
                    else:
                        print('PASS inherited-role regression: effective privileges are blocked', flush=True)
                        if args.candidate:
                            file(database, TESTS/'inherited-blocked.sql')
                            # A different inherited column grant must trip the
                            # check rather than silently broadening the delta.
                            sql(database, 'CREATE ROLE qa_shadow NOLOGIN; GRANT qa_shadow TO authenticated; GRANT INSERT (body) ON public.reviews TO qa_shadow;')
                            guard=run(dbcmd(database)+['-f',str(TESTS/'candidate-inherited-delta.sql')],check=False)
                            if guard.returncode == 0 or 'Inherited review write or moderation execute remains for authenticated' not in guard.stdout:
                                raise RuntimeError('candidate failed to reject another inherited column grant:\n'+guard.stdout)
                            print('PASS candidate aborts on additional inherited column grant', flush=True)
            file('qa_enabled',TESTS/'race-setup.sql')
            a_sql="BEGIN; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false); SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000009',true,'race A'); SELECT pg_sleep(7); COMMIT;"
            b_sql="BEGIN; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false); SELECT public.admin_decide_claim('20000000-0000-0000-0000-000000000010',true,'race B'); COMMIT;"
            def start(name, statement):
                return subprocess.Popen(dbcmd('qa_enabled')+['-c',statement], stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,env={**env,'PGAPPNAME':name})
            a=start('qa_independent_a',a_sql)
            b=None
            try:
                def await_condition(statement, process, label):
                    deadline=time.monotonic()+5
                    while time.monotonic()<deadline:
                        if process.poll() is not None:
                            raise RuntimeError(f'{label} exited early: {process.communicate()[0]}')
                        out=run(dbcmd('qa_enabled')+['-Atc',statement]).stdout.strip()
                        if out=='1': return
                        time.sleep(0.04)
                    raise RuntimeError(f'{label} did not reach expected state')
                await_condition("SELECT count(*) FROM pg_stat_activity WHERE application_name='qa_independent_a' AND wait_event='PgSleep'",a,'first session')
                b=start('qa_independent_b',b_sql)
                await_condition("SELECT count(*) FROM pg_stat_activity WHERE application_name='qa_independent_b' AND cardinality(pg_blocking_pids(pid))>0",b,'second session')
                a_out=a.communicate(timeout=20)[0]
                b_out=b.communicate(timeout=20)[0]
                if a.returncode != 0 or b.returncode == 0 or 'A captain is already approved for this listing' not in b_out:
                    raise RuntimeError(f'unexpected concurrent outcomes: {a.returncode}, {b.returncode}\n{a_out}\n{b_out}')
            finally:
                for process in (a,b):
                    if process and process.poll() is None:
                        process.terminate()
                        process.communicate(timeout=10)
            file('qa_enabled',TESTS/'race-check.sql')
            print('PASS concurrent sessions: observed blocking, one success, exact loser error', flush=True)
            if args.preflight_json:
                Path(args.preflight_json).write_text(json.dumps(preflight_results,sort_keys=True,indent=2)+'\n')
            if args.preflight_report:
                sections=[preflight.summarize(value,key) for key,value in preflight_results.items()]
                Path(args.preflight_report).write_text('\n'.join(sections))
            if inherited_defect:
                print('EXPECTED FAILURE: inherited role grants bypass the proposed default-off revocations (synthetic condition)', flush=True)
            if args.strict and inherited_defect:
                return 1
            return 0
        finally:
            if started:
                result=run([pgctl,'-D',str(data),'-m','immediate','-w','stop'],check=False)
                if result.returncode:
                    print('ERROR stopping own disposable server:',result.stdout,file=sys.stderr)
                    raise RuntimeError('local server cleanup failed')

if __name__=='__main__':
    try:
        raise SystemExit(main())
    except (RuntimeError,subprocess.TimeoutExpired) as exc:
        print(f'ERROR: {exc}',file=sys.stderr)
        raise SystemExit(2)
