#!/usr/bin/env python3
"""Inspect tracked source references without printing content or credentials.

This is a conservative static scan, not dataflow proof or deployment inspection.
"""
import argparse
import json
from pathlib import Path, PurePosixPath
import re
import subprocess

ROOT=Path(__file__).resolve().parents[2]
PUBLIC=re.compile(r'\bNEXT_PUBLIC_[A-Z0-9_]*(?:SERVICE_ROLE|SERVICE_KEY|SECRET)[A-Z0-9_]*\b')
PRIVILEGED=re.compile(r'\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY)\b|\bsb_secret_[A-Za-z0-9_-]+')
ROUTE=re.compile(r'''\bNEXT_PUBLIC_[A-Z0-9_]+["']?\s*[:=]\s*["']?\s*(?:(?:process\.env\.)|(?:\$\{\{\s*secrets\.)|(?:\$\{))?(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9_-]+)\b''')
IMPORT=re.compile(r"(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['\"]([^'\"]+)['\"]")
CLIENT=re.compile(r"^\s*['\"]use client['\"]\s*;?",re.MULTILINE)


def resolve(source,ref,files):
    if ref.startswith('@/'): candidate=PurePosixPath(ref[2:])
    elif ref.startswith('.'): candidate=PurePosixPath(source).parent/ref
    else: return None
    # Normpath does not access the filesystem or resolve external symlinks.
    import posixpath
    base=posixpath.normpath(str(candidate))
    for name in (base,base+'.ts',base+'.tsx',base+'.js',base+'.jsx',base+'/index.ts',base+'/index.tsx'):
        if name in files:return name
    return None


def scan(files):
    clients={name for name,source in files.items() if CLIENT.search(source)}
    queue=list(clients)
    while queue:
        name=queue.pop()
        for ref in IMPORT.findall(files[name]):
            child=resolve(name,ref,files)
            if child and child not in clients:
                clients.add(child);queue.append(child)
    findings=[]
    for name,source in sorted(files.items()):
        for match in ROUTE.finditer(source):
            findings.append({'path':name,'line':source.count('\n',0,match.start())+1,'kind':'public_env_privileged_route'})
        for line_number,line in enumerate(source.splitlines(),1):
            if PUBLIC.search(line):
                findings.append({'path':name,'line':line_number,'kind':'public_privileged_reference'})
            if PRIVILEGED.search(line):
                findings.append({'path':name,'line':line_number,'kind':'client_privileged_reference' if name in clients else 'nonclient_privileged_reference_requires_review'})
    return findings


def self_test():
    synthetic={
        'components/Browser.tsx': "'use client';\nimport {x} from '@/lib/indirect';\nconst x = process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY;",
        'lib/indirect.ts': "export const x = process.env.SUPABASE_SERVICE_ROLE_KEY;",
        'app/server.ts': "const key = process.env.SUPABASE_SECRET_KEY;",
        'components/Marker.tsx': "'use client';\nconst key = 'sb_secret_synthetic_only';",
        'next.config.js': "const env = {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:\n process.env.SUPABASE_SERVICE_ROLE_KEY};",
        'vercel.json': '{"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "sb_secret_synthetic_only"}',
        '.github/workflows/synthetic.yml': 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}',
    }
    out=scan(synthetic)
    assert any(x['path']=='components/Browser.tsx' and x['kind']=='public_privileged_reference' for x in out)
    assert any(x['path']=='lib/indirect.ts' and x['kind']=='client_privileged_reference' for x in out)
    assert any(x['path']=='app/server.ts' and x['kind']=='nonclient_privileged_reference_requires_review' for x in out)
    assert any(x['path']=='components/Marker.tsx' and x['kind']=='client_privileged_reference' for x in out)
    assert any(x['path']=='next.config.js' and x['kind']=='public_env_privileged_route' for x in out)
    assert any(x['path']=='vercel.json' and x['kind']=='public_env_privileged_route' for x in out)
    assert any(x['path']=='.github/workflows/synthetic.yml' and x['kind']=='public_env_privileged_route' for x in out)
    assert 'synthetic_only' not in json.dumps(out)
    assert not scan({'components/Safe.tsx':"'use client';\nconst x = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;"})
    print('PASS synthetic client-key reference and import-chain tests; marker value withheld')


def tracked_scan():
    result=subprocess.run(['git','ls-files','-z'],cwd=ROOT,check=True,stdout=subprocess.PIPE)
    files={}
    skipped_symlinks=[]
    for raw in result.stdout.split(b'\0'):
        if not raw: continue
        name=raw.decode('utf8')
        path=PurePosixPath(name)
        # No .env files, credential stores, ignored or untracked files.
        if any(part.startswith('.env') for part in path.parts):continue
        if not (name.startswith(('app/','components/','lib/','.github/workflows/')) or name in ('next.config.js','next.config.mjs','next.config.ts','vercel.json')):continue
        if path.suffix not in ('.ts','.tsx','.js','.jsx','.mjs','.json','.yml','.yaml'):continue
        if (ROOT/name).is_symlink():
            skipped_symlinks.append(name)
            continue
        files[name]=(ROOT/name).read_text(encoding='utf8')
    findings=scan(files)
    print(json.dumps({'tracked_files_scanned':len(files),'findings':findings,'uninspected_symlinks':skipped_symlinks,'runtime_configuration':'unverified','scan_limit':'static references/imports only; dynamic flows and other secret formats may be missed; no credential values or environment files inspected'},indent=2))
    return int(any(x['kind']!='nonclient_privileged_reference_requires_review' for x in findings))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--self-test',action='store_true')
    parser.add_argument('--scan',action='store_true')
    args=parser.parse_args()
    if not args.self_test and not args.scan:parser.error('select --self-test and/or --scan')
    if args.self_test:self_test()
    raise SystemExit(tracked_scan() if args.scan else 0)
