# Local PostgREST authorization acceptance

Base: `codex/backend-independent-review` at `afb3a2736cf4a088612c3a799822a53d05e0cce5`. These tests exercise actual HTTP requests through PostgREST 12.2.12 into a disposable PostgreSQL 17 reconstruction. They do not use hosted Supabase or production accounts. The captured schema, original proposal and inherited-grant delta are unchanged.

## Reproduce

Install PostgreSQL 17 tools (`initdb`, `pg_ctl`, `psql`, `pg_config`) and obtain the official PostgREST `v12.2.12` release for your platform. The runner verifies the executable's pinned SHA-256 and version; supported binaries are macOS arm64 and Linux x86-64. On macOS it discovers the PostgreSQL 17 `libpq` directory via `pg_config`.

```sh
python3 tests/backend-http-acceptance/run.py \
  --postgrest /path/to/postgrest \
  --results /tmp/ratemyguide-http-results.json
```

The GitHub workflow downloads the official Linux x86-64 archive and verifies its SHA-256 `5de4092f1719da3353c40bf96c8dec6913f2254a7cd0b61cc05f233153b557d5`; the runner additionally checks executable SHA-256 `16dbc82fd830db6a28a03231ec99fcd28139fd4558bebe402586d9534376cec1`. The macOS arm64 executable SHA-256 is `4d605ebfe3b1de1f05b1e5b559544f6b27b856533f0099e87c10d6e59833d1bb`. These hashes were computed from the GitHub release artifacts; the release metadata did not provide an independent digest for these two artifacts.

The runner creates a fresh socket-only PostgreSQL cluster, synthetic accounts, a non-superuser/no-inherit PostgREST authenticator, separate databases for each state, random HMAC signing keys and an HTTP server bound to `127.0.0.1` on run-owned ports. Keys and configs have restricted file permissions, process environments are cleared of application connection variables, and all owned processes and temporary files are cleaned up. Logs and response bodies are withheld on failures so tokens and signing material are not printed. The optional JSON output contains only synthetic test labels, statuses, error classifications and versions.

## Results and interpretation

- **A — captured baseline:** the public review view returns HTTP 401 / `42501` in this fixture; a pending-review insert returns 201; an admin's own review and claim decisions return 204. Database assertions confirm both self-approvals and their audit rows.
- **B — original lockdown with synthetic inherited grants:** published review reads succeed, and unrelated claim/evidence/owner writes are blocked. The inherited review insert still returns 201 and the moderator RPC returns 204; database assertions confirm the conditional bypass. This is an intentionally adversarial role fixture, not a claim about hosted membership.
- **C — fixture-specific candidate delta:** the same review insert and moderation RPC return 403 / `42501` and leave state unchanged. An explicit **local owner grant** then enables only the moderator RPCs. Independent decisions succeed and audit; self-approval, owner moderation of their guide and user-metadata-based admin escalation are denied with exact `P0001` messages and unchanged target state. Customer writes remain blocked. Two HTTP requests wait concurrently on a held guide row: one returns 204 and one returns 400 with the expected ownership-conflict message; exactly one owner and one audit result.
- Anonymous and authenticated direct table and public view reads return the known published review and omit pending/rejected reviews. Direct author-ID access is denied, and the public view has no such column. One claimant can see their known evidence while another user and anonymous requests cannot; the admin queue shows known pending records to an admin but not an unrelated user.
- Valid tokens use per-run HS256 keys. A bit-flipped signature, expired token, future `nbf` and wrong present audience each return 401 / `PGRST301` with a matching error classification. A token requesting an ungranted database or service role returns 403 / `42501`. Tokens without a role use `anon`; an explicit `anon` role cannot gain admin access through metadata.

The configured PostgREST `jwt-aud` rejects a **different present** audience, but an absent audience is accepted. A valid token with a different issuer is also accepted: this PostgREST configuration does not enforce an issuer. These are observed local properties, not assurances about hosted configuration. See the [PostgREST JWT validation documentation](https://docs.postgrest.org/en/v12/references/auth.html#jwt-claims-validation) and [audience setting](https://docs.postgrest.org/en/v12/references/configuration.html#jwt-aud).

The harness replaces only its local `auth.uid()` stub with a function reading PostgREST's validated `request.jwt.claims`; it does not emulate the hosted Supabase Auth service. The media table, identities, role memberships, data and JWT claims are synthetic. This is not a test of hosted OAuth, email delivery, token issuance, refresh/session revocation, API gateway behavior, storage policies, hosted role memberships, hosted signing configuration, or production safety. The fixture-specific role revocation is not a general repair or authorization for a migration.
