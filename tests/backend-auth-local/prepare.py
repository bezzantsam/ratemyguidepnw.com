#!/usr/bin/env python3
"""Prepare only the application subset in an unlinked local Supabase stack."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tomllib
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[2]
work = Path(sys.argv[1]).resolve(strict=True)
status = json.loads((work / 'status.json').read_text())
config = tomllib.loads((work / 'supabase/config.toml').read_text())
project = config['project_id']
if not re.fullmatch(r'rmgqa[0-9]+', project):
    raise SystemExit('Unsafe local project identifier')
for key in ('API_URL', 'DB_URL', 'MAILPIT_URL'):
    url = urlsplit(status[key])
    if url.hostname != '127.0.0.1' or url.scheme not in ('http', 'postgresql', 'postgres'):
        raise SystemExit(f'{key} is not a local loopback endpoint')
if config['auth']['email']['enable_confirmations'] is not True:
    raise SystemExit('Local email confirmation must be enabled')
schema = subprocess.check_output([sys.executable, str(root / 'tests/backend-launch/reconstruct.py')], text=True)
ignored = ('CREATE ROLE ', 'CREATE SCHEMA auth;', 'CREATE TABLE auth.users(', 'CREATE FUNCTION auth.uid()')
schema = '\n'.join(line for line in schema.splitlines() if not line.startswith(ignored)) + '\n'
schema += '''
CREATE TABLE public.guide_media(id uuid PRIMARY KEY,guide_id uuid NOT NULL,caption text);
ALTER TABLE public.guide_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_media_owner ON public.guide_media FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.guide_media TO authenticated;
'''
if os.environ.get('RMG_FINAL_LAUNCH_FIXTURE') == '1':
    if os.environ.get('RMG_FIXTURE_SCHEMA_ONLY') != '1':
        raise SystemExit('Final launch fixture requires schema-only setup')
    schema += '''
CREATE TABLE public.review_flags(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid NOT NULL REFERENCES public.reviews(id),reporter_id uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(review_id,reporter_id));
ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.review_flags TO anon,authenticated;
'''
if os.environ.get('RMG_FIXTURE_SCHEMA_ONLY') != '1':
    schema += (root / 'supabase/review-candidates/launch-combined.sql').read_text()
    schema += '''
INSERT INTO public.guides(id,slug,full_name,listing_status) VALUES
 ('10000000-0000-0000-0000-000000000001','fixture-one','Synthetic guide one','published'),
 ('10000000-0000-0000-0000-000000000002','fixture-two','Synthetic guide two','published');
INSERT INTO rmg_private.guide_identity_map(jurisdiction,source_id,guide_id,reviewed_at,review_reference) VALUES
 ('OR','fixture-one','10000000-0000-0000-0000-000000000001',now(),'Synthetic CI fixture'),
 ('OR','fixture-two','10000000-0000-0000-0000-000000000002',now(),'Synthetic CI fixture');
DO $$ BEGIN IF (SELECT enabled FROM rmg_private.launch_control WHERE singleton) IS DISTINCT FROM false THEN RAISE EXCEPTION 'gate is not default off'; END IF; END $$;
'''
# No credentials in process arguments. Container name is tied to our unique project.
subprocess.run(['docker', 'exec', '-i', 'supabase_db_' + project, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], input=schema, text=True, check=True, stdout=subprocess.DEVNULL)
if os.environ.get('RMG_FIXTURE_SCHEMA_ONLY') == '1':
    print('Synthetic pre-migration schema installed; no candidate applied.')
else:
    print('Synthetic schema, exact candidate, two fictional guide mappings installed; launch gate remains off.')

