"""Read-only preflight; invoked solely with the runner's disposable socket.

Catalog ACLs and policy text describe constraints; neither proves authorization.
No inspected application function is executed by this module.
"""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
TESTS=ROOT/'tests/backend-independent-review'
EXPECTED_FUNCTIONS={'admin_decide_review','admin_decide_claim','is_site_admin','refresh_guide_rating','reviews_rating_trigger','throttle_review_submission'}


def collect(query):
    raw=query((TESTS/'preflight.sql').read_text())
    result=json.loads(raw)
    snapshot=(ROOT/'docs/backend-catalog-snapshot.json').read_bytes()
    result['captured_schema_snapshot_sha256']=hashlib.sha256(snapshot).hexdigest()
    result['coverage']['missing_expected_tables']=[x for x in result['scope_expected_tables'] if x not in {r['name'] for r in result['relations']}]
    result['coverage']['missing_expected_functions']=[x for x in sorted(EXPECTED_FUNCTIONS) if not any(f['signature'].startswith('public.'+x+'(') for f in result['functions'])]
    result['coverage']['membership_edge_inherit_option']='supported' if result['server_version_num']>=160000 else 'unsupported_by_server'
    grants={}
    def add(grantee, detail):
        grants.setdefault(grantee,[]).append(detail)
    for entry in result['table_acl']:
        add(entry['grantee'],{'kind':'table','object':entry['table'],'privilege':entry['privilege']})
    for entry in result['column_acl']:
        add(entry['grantee'],{'kind':'column','object':entry['table']+'.'+entry['column'],'privilege':entry['privilege']})
    for function in result['functions']:
        for entry in function['acl'] or []:
            add(entry['grantee'],{'kind':'function','object':function['signature'],'privilege':entry['privilege']})
    result['revocation_impacts']=[{'grantee':grantee,'affects_all_roles':grantee=='PUBLIC','members':[x for x in result['role_members'] if x['grantee_role']==grantee],'direct_grants':details} for grantee,details in sorted(grants.items())]
    # Fingerprint the actual reconstructed test catalog, including synthetic
    # grants and membership paths. No database rows or credentials are included.
    fingerprint_input=json.dumps(result,sort_keys=True,separators=(',',':')).encode()
    result['tested_catalog_sha256']=hashlib.sha256(fingerprint_input).hexdigest()
    return result


def assert_adversarial(report):
    def present(rows, **expected):
        return any(all(row.get(key)==value for key,value in expected.items()) for row in rows)
    def require(ok, label):
        if not ok: raise AssertionError('preflight fixture failed: '+label)
    require(present(report['table_acl'],table='claim_evidence',grantee='authenticated',privilege='INSERT'),'direct grant')
    require(present(report['table_effective'],role='authenticated',table='claim_evidence',privilege='INSERT',acl_allowed=True),'effective direct grant')
    require(present(report['column_acl'],table='guide_media',column='caption',grantee='PUBLIC',privilege='INSERT'),'PUBLIC column grant')
    require(present(report['column_effective'],role='anon',table='guide_media',column='caption',privilege='INSERT',acl_allowed=True),'effective PUBLIC column grant')
    require(present(report['column_acl'],table='reviews',column='body',grantee='qa_top',privilege='UPDATE'),'inherited column grant')
    require(present(report['column_effective'],role='authenticated',table='reviews',column='body',privilege='UPDATE',acl_allowed=True),'effective inherited column grant')
    require(any(p['application_role']=='authenticated' and p['path']==['authenticated','qa_middle','qa_top'] and p['effective_usage'] for p in report['membership_paths']),'multi-hop effective path')
    require(present(report['role_members'],grantee_role='qa_legacy_grants',member='qa_peer',effective_usage=True),'shared role other member')
    require(present(report['table_effective'],role='qa_peer',table='reviews',privilege='INSERT',acl_allowed=True),'shared peer has inherited permission before revocation')
    impact=next(x for x in report['revocation_impacts'] if x['grantee']=='qa_legacy_grants')
    require(any(x['member']=='qa_peer' for x in impact['members']) and any(x['kind']=='table' and x['object']=='reviews' and x['privilege']=='INSERT' for x in impact['direct_grants']),'revocation impact identifies shared member and grant')
    admin=next(f for f in report['functions'] if f['signature'].startswith('public.admin_decide_review('))
    require(admin['owner']=='qa_owner' and admin['security_definer'] and admin['search_path'] is not None,'function security and owner')
    require(any(a['grantee']=='qa_legacy_grants' and a['privilege']=='EXECUTE' for a in admin['acl']),'inherited function ACL')
    public_fn=next(f for f in report['functions'] if f['signature']=='public.is_site_admin()')
    require(any(a['grantee']=='PUBLIC' and a['privilege']=='EXECUTE' for a in public_fn['acl']),'PUBLIC function ACL')
    require(any(x['role']=='anon' and x['execute'] for x in public_fn['effective']),'effective PUBLIC function ACL')
    require(len([f for f in report['functions'] if f['signature'].startswith('public.admin_decide_review(')])==2,'overloaded functions remain separate')
    overload=next(f for f in report['functions'] if f['signature']=='public.admin_decide_review(uuid)')
    require(any(x['role']=='anon' and x['execute'] for x in overload['effective']),'overload PUBLIC execute separately reported')
    require(all(r['rls_enabled'] for r in report['relations']),'RLS flags')
    require(any(p['table']=='reviews' and p['command']=='INSERT' for p in report['policies']),'policy definitions')
    require(report['coverage']['storage_definitions']=='uninspected' and report['coverage']['full_function_inventory']=='unknown','unknown surfaces')
    if report['server_version_num']>=160000:
        require(any(p['application_role']=='authenticated' and p['path']==['authenticated','qa_noinherit'] and p['membership'] and not p['effective_usage'] and p['edges'][0]['inherit_option'] is False for p in report['membership_paths']),'per-membership NOINHERIT semantics')
        require(present(report['table_acl'],table='guide_claims',grantee='qa_noinherit',privilege='DELETE'),'noninherited grant exists')
        require(present(report['table_effective'],role='authenticated',table='guide_claims',privilege='DELETE',acl_allowed=False),'noninherited grant not effective')
    else:
        require(report['coverage']['membership_edge_inherit_option']=='unsupported_by_server','unsupported membership semantics')


def assert_after_candidate(report):
    if not any(x['role']=='authenticated' and x['table']=='reviews' and x['column']=='body' and x['privilege']=='UPDATE' and x['acl_allowed'] for x in report['column_effective']):
        raise AssertionError('preflight failed to detect unrelated inherited grant surviving the delta')
    if not any(x['role']=='authenticated' and x['table']=='claim_evidence' and x['privilege']=='INSERT' and x['acl_allowed'] for x in report['table_effective']):
        raise AssertionError('preflight failed to detect unrelated direct grant surviving the delta')
    if not any(x['role']=='qa_peer' and x['table']=='reviews' and x['privilege']=='INSERT' and not x['acl_allowed'] for x in report['table_effective']):
        raise AssertionError('preflight failed to show shared peer loses the revoked privilege')
    admin=next(f for f in report['functions'] if f['signature'].startswith('public.admin_decide_review(p_id uuid, p_approve boolean, p_reason text)'))
    if next(x for x in admin['effective'] if x['role']=='authenticated')['execute']:
        raise AssertionError('preflight reports revoked inherited execute as available')
    overload=next(f for f in report['functions'] if f['signature']=='public.admin_decide_review(uuid)')
    if not next(x for x in overload['effective'] if x['role']=='anon')['execute']:
        raise AssertionError('preflight missed the untouched overloaded fixture function')


def summarize(report,label):
    allowed=[x for x in report['table_effective'] if x['role'] in ('anon','authenticated') and x['acl_allowed'] and x['privilege'] in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')]
    rolepaths=[p for p in report['membership_paths'] if p['application_role']=='authenticated']
    shared=[x for x in report['role_members'] if x['grantee_role']=='qa_legacy_grants']
    return '\n'.join([
        f'# Synthetic effective-permission preflight: {label}', '',
        f"PostgreSQL: {report['postgres_version']}",
        f"Captured snapshot SHA-256: `{report['captured_schema_snapshot_sha256']}`",
        f"Tested catalog SHA-256: `{report['tested_catalog_sha256']}`", '',
        f"Effective application-role table write permissions: {len(allowed)} (see JSON for each role/table/privilege).",
        f"Authenticated role membership paths: {len(rolepaths)}; qa_legacy_grants members: {', '.join(sorted(x['member'] for x in shared))}.",
        ('Synthetic qa_noinherit membership exists but is not inherited.' if report['server_version_num']>=160000 else 'Per-membership inheritance options are unsupported by this server and remain unverified.'),
        'Example fixture: authenticated has direct claim_evidence INSERT; PUBLIC has guide_media.caption INSERT; authenticated inherits reviews.body UPDATE via qa_middle → qa_top.',
        'The separate synthetic admin_decide_review(uuid) overload remains PUBLIC executable; the fixture delta targets a different signature.',
        'The synthetic qa_legacy_grants role is shared with qa_peer; revoking its grants affects both members.',
        'ACL permission, RLS policy definitions and function bodies are reported separately; none alone proves whether an operation succeeds.',
        'Synthetic behavior test: anonymous guide_media.caption INSERT has PUBLIC ACL permission but is denied by RLS.',
        'Scope: selected reconstructed public tables and functions; guide_media and all extra roles/grants are synthetic.',
        'Unknown/uninspected: storage definitions, complete function inventory, system-role effective matrix, hosted Auth/JWT, Data API, and hosted role memberships.',
        'No inspected application function was executed by this catalog preflight.', ''
    ])
