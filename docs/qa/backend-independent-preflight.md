# Local synthetic authorization preflight

This workflow tests a reconstructed, disposable socket-only PostgreSQL database. It cannot select a hosted project and does not read `.env` files or real credentials. Its preflight query runs inside a read-only transaction and does not execute inspected application functions. The full independent harness separately exercises synthetic write behavior, moderation and a concurrent ownership race.

Run all three CI modes and write machine-readable results and the readable summary:

```sh
python3 tests/backend-independent-review/ci_modes.py --output-dir /tmp/ratemyguide-independent-preflight
```

`preflight.json` contains `before_candidate` and `after_candidate` catalog observations; `preflight.md` summarizes them; `client-key-scan.txt` contains only reference locations and scan coverage. To run just the candidate suite with explicit output paths:

```sh
python3 tests/backend-independent-review/run.py --strict --candidate \
  --preflight-json /tmp/ratemyguide-preflight.json \
  --preflight-report /tmp/ratemyguide-preflight.md
```

Both commands require local PostgreSQL `initdb`, `pg_ctl` and `psql`. The CI driver checks mode A exits 0 with the demonstrated expected-failure marker, B exits 1 with the same specific reproduction, and C exits 0 with candidate-denial and surviving-grant evidence. An unrelated failure cannot satisfy B. Green CI means the known unpatched regression was reproduced, not fixed.

## Reading the results

The JSON contains effective table and column ACL checks, direct ACL entries and grantors, membership paths and inheritance options, and revocation-impact lists including other members of each grantee. It identifies functions by full signature and records owner, security mode, configured search path, ACLs, effective EXECUTE and definition. It also records RLS enabled/forced flags and policy expressions. Privileged local fixture roles are labeled separately from ordinary application roles. PostgreSQL versions before per-membership inheritance options report that coverage as unsupported instead of assuming a result.

`captured_schema_snapshot_sha256` identifies the unchanged captured source snapshot. `tested_catalog_sha256` hashes the canonical JSON of this **selected security catalog and its synthetic privilege graph**; it is not a fingerprint of an entire database. On the recorded macOS run, PostgreSQL was 17.12, the captured snapshot hash was `7bab10cbbd0b9246fbd9a19591b8fa21f5afc0de2d9f0e0ad47cfd018ddc9ec4`, and the before-candidate tested-catalog hash was `fca4f930f638c518039d6461368603eda5991571f12449e75c85ceec0155b5d7`. Output changes when the PostgreSQL version or fixture/catalog changes.

The adversarial fixture includes direct, PUBLIC, inherited and column-only grants; an overloaded function; a multi-step role path; a shared role with another member; and, on supported PostgreSQL versions, a membership with inheritance disabled. It checks a known published row is actually readable, reports an unrelated grant surviving the narrow candidate, and proves a synthetic PUBLIC column grant is still denied by RLS. Missing fixture objects are marked as missing **locally**; storage and full function inventory are marked unknown or uninspected. An ACL says a role has a privilege, not that RLS permits a row operation; policy and function definitions likewise do not by themselves prove end-to-end authorization.

The tracked-source client-key scan inspects public environment names, suspicious privileged references and static client import paths, printing filenames and line numbers only. Its automated tests use synthetic markers and assert marker values are not printed. It skips environment files, credential stores, untracked files and symlinks. Dynamic imports, other secret formats and runtime configuration remain unverified; a clean source scan is not evidence of a safe hosted deployment.

Hosted Auth/JWT behavior, Data API exposure and grants, storage policies, actual role memberships and the complete callable-function inventory remain uninspected. The synthetic guide-media table and fixture grants are not claims about hosted configuration. This is no authorization to migrate, change roles or enable customer submissions.
