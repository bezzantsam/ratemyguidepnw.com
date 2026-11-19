#!/usr/bin/env python3
"""Exercise upstream Storage HTTP over the disposable CLI runner fixture."""
import base64
import hashlib
import hmac
from http.client import HTTPConnection, HTTPException
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time

work = Path(sys.argv[1]).resolve(strict=True)
dbport = int(sys.argv[2])
source = Path(sys.argv[3]).resolve(strict=True)
assert work.name.startswith('rmg-oregon-split.') and (work / 'data/PG_VERSION').read_text().strip() == '17'
assert subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip() == 'c8f93e5164ba564fccd66596b318c5e8e2136604'
subprocess.run(['git', '-C', str(source), 'diff', '--exit-code', 'HEAD'], stdout=subprocess.DEVNULL, check=True)
assert not (source / '.env').exists() and (source / 'dist/start/server.js').is_file()

psql = ['psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-h', str(work), '-p', str(dbport), '-U', 'audit_owner', '-d', 'postgres']
owner = '00000000-0000-0000-0000-000000000005'
guide = '10000000-0000-0000-0000-000000000001'
owner_prefix = 'fixture-one'
bucket = 'guide-photos'
original = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=')
replacement = original + b'fixture version two'
secret = secrets.token_hex(32)


def sql(statement):
    return subprocess.check_output(psql, input=statement, text=True, timeout=12).strip()


def encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def token(role, sub=None):
    claims = {'role': role, 'exp': int(time.time()) + 600}
    if sub:
        claims['sub'] = sub
    message = encode(b'{"alg":"HS256","typ":"JWT"}') + '.' + encode(json.dumps(claims).encode())
    signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return message + '.' + encode(signature)


with socket.socket() as free:
    free.bind(('127.0.0.1', 0))
    port = free.getsockname()[1]

roles = {'owner': token('authenticated', owner), 'service': token('service_role'), 'anon': token('anon')}


def http(method, url, role=None, body=None, headers=None):
    outgoing = dict(headers or {})
    if role:
        outgoing['Authorization'] = 'Bearer ' + roles[role]
    if isinstance(body, dict):
        body = json.dumps(body).encode()
        outgoing['Content-Type'] = 'application/json'
    if isinstance(body, bytes):
        outgoing.setdefault('Content-Type', 'image/png')
    client = HTTPConnection('127.0.0.1', port, timeout=5)
    try:
        client.request(method, url, body=body, headers=outgoing)
        response = client.getresponse()
        return response.status, response.read()
    finally:
        client.close()


def check(label, method, url, role=None, body=None, headers=None, expected=None):
    status, data = http(method, url, role, body, headers)
    if status != 200 or (expected is not None and data != expected):
        raise RuntimeError(f'{label}: expected HTTP 200 with matching data, got {status}')
    print(f'PASS {label}: HTTP {status}')


def reject(label, method, url, body=None, headers=None):
    status, response = http(method, url, 'owner', body, headers)
    try:
        error = json.loads(response).get('error')
    except (ValueError, AttributeError):
        error = None
    if status not in (400, 403) or error not in ('Unauthorized', 'not_found'):
        raise RuntimeError(f'{label}: expected Storage authorization denial, got HTTP {status}')
    print(f'PASS {label}: HTTP {status} {error}')


def object_path(name):
    return f'/object/{bucket}/{owner_prefix}/{name}.png'


def read_path(name):
    return f'/object/authenticated/{bucket}/{owner_prefix}/{name}.png'


env = {
    **os.environ,
    'NODE_ENV': 'production', 'SERVER_HOST': '127.0.0.1', 'SERVER_PORT': str(port),
    'DATABASE_URL': f'postgresql://audit_owner@127.0.0.1:{dbport}/postgres',
    'DB_INSTALL_ROLES': 'false', 'DB_SUPER_USER': 'audit_owner',
    'AUTH_JWT_SECRET': secret, 'AUTH_JWT_ALGORITHM': 'HS256',
    'SERVICE_KEY': roles['service'], 'ANON_KEY': roles['anon'], 'STORAGE_BACKEND': 'file',
    'STORAGE_FILE_BACKEND_PATH': str(work / 'storage-objects'), 'STORAGE_S3_BUCKET': 'split-fixture',
    'STORAGE_S3_REGION': 'local', 'PG_QUEUE_ENABLE': 'false',
    'IMAGE_TRANSFORMATION_ENABLED': 'false', 'LOG_LEVEL': 'fatal', 'AWS_EC2_METADATA_DISABLED': 'true',
}
with (work / 'storage-private.log').open('w+') as log:
    service = subprocess.Popen(['node', 'dist/start/server.js'], cwd=source, env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        for _ in range(300):
            if service.poll() is not None:
                raise RuntimeError('isolated Storage exited before readiness')
            try:
                if http('GET', '/status')[0] == 200:
                    break
            except (OSError, HTTPException):
                pass
            time.sleep(0.1)
        else:
            raise RuntimeError('isolated Storage readiness timed out')

        sql(f"""
ALTER ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role;
GRANT SELECT ON storage.buckets TO anon,authenticated;
GRANT SELECT ON storage.objects TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA storage TO anon,authenticated,service_role;
ALTER TABLE public.guide_media ADD COLUMN photo_path text;
GRANT SELECT ON public.guide_media TO authenticated,anon;
INSERT INTO public.guide_media(id,guide_id,photo_path) VALUES
 ('40000000-0000-0000-0000-000000000002','{guide}','{owner_prefix}/held.png'),
 ('40000000-0000-0000-0000-000000000003','{guide}','{owner_prefix}/control.png');
DELETE FROM public.site_admins WHERE user_id='{owner}';
CREATE POLICY fixture_read ON storage.objects FOR SELECT TO anon,authenticated USING (
 bucket_id='guide-photos' AND EXISTS(SELECT 1 FROM public.guide_media m WHERE m.photo_path=objects.name));
CREATE POLICY fixture_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='guide-photos' AND (storage.foldername(name))[1] IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.guides g JOIN public.guide_claims c ON c.guide_id=g.id
  WHERE g.slug=(storage.foldername(objects.name))[1] AND c.claimant_id=(SELECT auth.uid()) AND c.status='approved'));
CREATE POLICY fixture_delete ON storage.objects FOR DELETE TO authenticated USING (
 bucket_id='guide-photos' AND EXISTS(
  SELECT 1 FROM public.guides g JOIN public.guide_claims c ON c.guide_id=g.id
  WHERE g.slug=(storage.foldername(objects.name))[1] AND c.claimant_id=(SELECT auth.uid()) AND c.status='approved'));
UPDATE rmg_private.launch_control SET enabled=true WHERE singleton;
DROP POLICY rmg_launch_no_direct_approved_claims ON public.guide_claims;
""")
        check('create disposable bucket', 'POST', '/bucket', 'service', {'name': bucket, 'id': bucket, 'public': False})
        check('approved owner positive upload under existing policy', 'POST', object_path('held'), 'owner', original)
        check('approved owner positive read', 'GET', read_path('held'), 'owner', expected=original)
        check('seed service overwrite control', 'POST', object_path('control'), 'service', original)
        check('service overwrite control works on existing path', 'PUT', object_path('control'), 'service', replacement)
        check('service overwrite bytes', 'GET', read_path('control'), 'owner', expected=replacement)
        check('approved owner positive delete under existing policy', 'DELETE', object_path('control'), 'owner')

        sql("""CREATE POLICY rmg_launch_no_direct_approved_claims ON public.guide_claims AS RESTRICTIVE
 FOR SELECT TO authenticated USING (status <> 'approved');""")
        assert sql("SELECT (SELECT enabled FROM rmg_private.launch_control WHERE singleton) AND NOT (SELECT enabled FROM rmg_private.claim_control_v1 WHERE singleton);") == 't'
        assert sql(f"""SET ROLE authenticated; SET request.jwt.claim.sub='{owner}';
 SELECT count(*) FROM public.guide_claims WHERE status='approved';""") == '0'
        assert sql(f"SELECT count(*) FROM public.guide_claims WHERE claimant_id='{owner}' AND status='approved';") == '1'
        reject('closed owner upload', 'POST', object_path('new'), original)
        reject('closed owner upsert', 'POST', object_path('held'), replacement, {'x-upsert': 'true'})
        reject('closed owner overwrite', 'PUT', object_path('held'), replacement)
        status, _ = http('DELETE', object_path('held'), 'owner')
        if status not in (200, 400, 403):
            raise RuntimeError(f'closed owner delete produced unexpected HTTP {status}')
        # Postgres DELETE under RLS may be a successful no-op. Contents and rows decide the outcome.
        check('held object unchanged after failed writes and delete', 'GET', read_path('held'), 'owner', expected=original)
        assert sql("SELECT string_agg(name,',' ORDER BY name) FROM storage.objects WHERE bucket_id='guide-photos';") == f'{owner_prefix}/held.png'
        print(f'PASS closed owner delete: HTTP {status}, original metadata and bytes retained')
        sql("UPDATE rmg_private.launch_control SET enabled=false WHERE singleton;")
    finally:
        service.terminate()
        try:
            service.wait(timeout=5)
        except subprocess.TimeoutExpired:
            service.kill()
            service.wait(timeout=5)
        log.seek(0)
        private_log = log.read()
        if secret in private_log or any(value in private_log for value in roles.values()):
            raise RuntimeError('synthetic credential leaked into Storage service log')
