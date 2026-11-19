#!/usr/bin/env python3
"""Render the observed application subset into a disposable Postgres cluster.

This is not a migration. Auth and service roles are minimal local stubs and the
snapshot intentionally excludes unrelated schemas, extensions, and data.
"""
import json
import pathlib
import sys

p = json.loads(pathlib.Path(__file__).with_name('fixture-catalog.json').read_text())

def q(s):
    return '"' + s.replace('"', '""') + '"'

def emit(s):
    print(s + ';')

emit('CREATE ROLE anon NOLOGIN')
emit('CREATE ROLE authenticated NOLOGIN')
emit('CREATE ROLE service_role NOLOGIN')
emit('CREATE SCHEMA auth')
emit('CREATE TABLE auth.users(id uuid PRIMARY KEY)')
emit("CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$")
emit('GRANT USAGE ON SCHEMA public, auth TO anon, authenticated')
emit('GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated')
emit('CREATE EXTENSION IF NOT EXISTS pg_trgm')
for r in p['relations']:
    if r['kind'] != 'r':
        continue
    cols = []
    for c in p['columns']:
        if c['table'] != r['name']:
            continue
        cols.append(q(c['name'])+' '+c['type']+(' DEFAULT '+c['default'] if c['default'] else '')+(' NOT NULL' if c['not_null'] else ''))
    emit('CREATE TABLE public.'+q(r['name'])+' ('+', '.join(cols)+')')
for c in sorted(p['constraints'], key=lambda item: item['definition'].startswith('FOREIGN KEY')):
    # Adding after all tables permits forward references.
    emit('ALTER TABLE public.'+q(c['table'])+' ADD CONSTRAINT '+q(c['name'])+' '+c['definition'])
for i in p['indexes']:
    emit(i['definition'])
for f in p['functions']:
    emit(f['definition'].strip().rstrip(';'))
    args = 'uuid, boolean, text' if f['name'] in ('admin_decide_claim','admin_decide_review') else ('uuid' if f['name']=='refresh_guide_rating' else '')
    signature = 'public.'+q(f['name'])+'('+args+')'
    emit('REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC, anon, authenticated')
    if any(x.startswith('authenticated=X/') for x in f['acl'] or []):
        emit('GRANT EXECUTE ON FUNCTION '+signature+' TO authenticated')
for r in p['relations']:
    if r['kind']=='r' and r['rls']:
        emit('ALTER TABLE public.'+q(r['name'])+' ENABLE ROW LEVEL SECURITY')
        if r['force_rls']:
            emit('ALTER TABLE public.'+q(r['name'])+' FORCE ROW LEVEL SECURITY')
for policy in p['policies']:
    roles = ', '.join('PUBLIC' if x=='public' else q(x) for x in policy['roles'])
    statement = 'CREATE POLICY '+q(policy['name'])+' ON public.'+q(policy['table'])+' AS '+policy['permissive']+' FOR '+policy['command']+' TO '+roles
    if policy['using'] is not None: statement += ' USING ('+policy['using']+')'
    if policy['check'] is not None: statement += ' WITH CHECK ('+policy['check']+')'
    emit(statement)
for r in p['relations']:
    if r['kind']=='v':
        options = ' WITH ('+', '.join(r['options'])+')' if r['options'] else ''
        emit('CREATE VIEW public.'+q(r['name'])+options+' AS '+r['view'].strip().rstrip(';'))
for t in p['triggers']:
    emit(t['definition'])
for g in p['table_grants']:
    emit('GRANT '+g['privilege']+' ON public.'+q(g['table'])+' TO '+q(g['grantee']))
for g in p['column_select_grants']:
    emit('GRANT SELECT ('+q(g['column'])+') ON public.'+q(g['table'])+' TO '+q(g['grantee']))
