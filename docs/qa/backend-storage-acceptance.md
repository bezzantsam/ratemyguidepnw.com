# Local Storage authorization candidate

This is a synthetic proposal, not a hosted schema capture or a production migration. `docs/backend-catalog-snapshot.json` captures no hosted Storage objects or policies, and `supabase/migrations/0002_captain_media.sql` is only a pointer. The Storage schema used here comes from the local upstream service migrations. The existing inherited-grant characterization and fixture-only revocation in the parent branch remain unchanged; revoking direct grants here is not proof against inherited or PUBLIC privileges in an unknown deployment.

## Candidate

`tests/backend-storage-acceptance/local-proposal.sql` binds each exact bucket/key to a synthetic claim or a guide with an approved synthetic claim. Identity comes from `auth.uid()`, not the supplied path or metadata. Evidence and guide media use separate private buckets. Reads require the associated claimant/owner or a synthetic application administrator. The proposal grants no customer insert, update, or delete. `local-enable-fixture.sql` explicitly enables inserts only for local tests; it is not a production migration, and copy, update, delete, and publishing are not enabled. Intent issuance and lifecycle, rate limits, cleanup, moderation, approved ownership mappings, inherited grants and service-role access need independent design before launch.

## Reproduction

Obtain the official Storage source at exact commit `c8f93e5164ba564fccd66596b318c5e8e2136604` (tag v1.11.13), run `npm ci --no-audit --no-fund` and `npm run build` within that disposable source checkout, and install PostgreSQL 17 plus Node 20. The runner verifies hashes of the upstream lockfile, server entry point and initial storage migration. With those prerequisites:

```sh
python3 tests/backend-storage-acceptance/run.py --storage-source /path/to/pinned/storage-source --results /tmp/storage-results.json
```

The service and database are loopback-only, use run-owned ports and directories, generated tokens and harmless synthetic files. The only artifact is sanitized JSON; server logs and signed URLs are not artifacts. PostgreSQL owner and service-role rights exist only in the disposable database. A failed startup or nonmatching API status/category is a test failure. The source tree must not contain a `.env` file.

## Observations and limits

The test exercises actual upstream Storage HTTP operations and checks object and bucket state through read-only SQL. Claimant and administrator reads return known bytes; unrelated reads do not. Once locally enabled, a claimant can upload to an exact pending-claim intent, and an approved owner can upload to a guide-media quarantine intent. Cross-user and cross-bucket uploads, bucket changes, upserts, overwrites, copies, moves and deletes are rejected. A rejected claim remains readable by its claimant but cannot receive additional uploads. These results are for the synthetic fixture only.

The server accepts HTML bytes labeled `image/png` into quarantine. An allowed MIME declaration and filename therefore do **not** validate file contents. Promotion needs a separate trusted content-validation and publication process; none exists here. A signed URL is a bearer capability: revoking a user's relationship after issuance does not invalidate the already-issued URL before expiry. Short expiry limits, but does not eliminate, that exposure. No signed URL or credential is included in the report.

Not verified: hosted Storage schema, policies and bucket configurations; Auth/JWT, gateway and deployment configuration; real role memberships and inherited grants; real identities and ownership; actual hosted file backend, signed URL keys/expiry/revocation; content scanning, transformed media, browser rendering and safe promotion. A local request test is not production security approval.
