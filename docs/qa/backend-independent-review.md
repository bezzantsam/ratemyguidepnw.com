# Independent backend authorization review

Target: PR #106 commit `1987c968a721bcf0810e7799abd26dc5db6b8c7e`. This review used only reconstructed catalog metadata, synthetic identities and a disposable socket-only PostgreSQL 17.12 cluster. It did not connect to hosted Supabase or exercise actual JWT verification. The original snapshot, proposal and baseline tests were not modified.

## Confirmed conditional defect: inherited grants defeat default-off revocation

**Location:** `scripts/backend-audit/proposed-authorization-lockdown.sql:9-19` revokes writes from `PUBLIC`, `anon` and `authenticated`; lines 21–23 and 89–90 revoke the named functions from those same principals. These statements do not revoke privileges granted to another role inherited by `authenticated`.

**Reproduction:** In an otherwise reconstructed local schema, [`inherited-before.sql`](../../tests/backend-independent-review/inherited-before.sql) creates a synthetic `qa_legacy_grants` role, grants it review INSERT and moderation-function EXECUTE, and grants membership to `authenticated` before applying the proposal. [`regression-inherited.sql`](../../tests/backend-independent-review/regression-inherited.sql) asserts those effective privileges are absent. At the target commit it fails. [`inherited-after.sql`](../../tests/backend-independent-review/inherited-after.sql) then confirms actual behavior, with a non-superuser `authenticated` role: an ordinary synthetic user inserts a pending review and a synthetic application administrator calls the supposedly disabled moderation RPC and publishes another pending review.

**Expected:** Customer writes and moderation calls are blocked in the default-off state, including effective inherited grants. **Actual under this fixture:** both operations succeed and the moderation audit row is written. **Impact:** the off switch can be bypassed if the deployment has equivalent role memberships and grants; the RPC still enforces its application-admin check, so this test does not show a non-admin can moderate. The snapshot does not establish hosted role memberships or grants to other principals; this is a confirmed conditional defect in the proposal, not a finding that the hosted project has that configuration.

**Minimal regression:** Run `python3 tests/backend-independent-review/run.py --strict`. It exits 1 at this target because the inherited-grant expectation fails, after also verifying the actual bypass. A repair should reject or explicitly eliminate unintended effective privileges via reviewed role memberships and grants, and assert the effective permissions before deployment; do not indiscriminately revoke shared roles in a live environment. The normal characterization run exits 0 while clearly labeling this known regression as `EXPECTED FAILURE`; it must not be interpreted as a security pass.

## Independent results

- **Baseline:** direct pending review insert and owner details edit succeed; public and administrator review views produce SQLSTATE `42501`; an application admin can approve their own review and claim.
- **Locked proposal with direct/PUBLIC grant drift:** anonymous and authenticated non-admins each receive the exact published fixture from both the view and direct table, and do not receive pending rows. Reviewer ID reads fail with the expected SQLSTATE. A claimant reads their exact own private evidence; an unrelated user sees none; an application admin sees nonempty queues and the exact evidence. Both customer roles lack the tested table and column write privileges, and the captured privileged functions have neither effective direct access nor `PUBLIC` EXECUTE. Denied operations leave fixture statuses, aggregates and audit rows unchanged. The media table is a synthetic stand-in because its hosted definition was not captured.
- **Explicitly enabled local moderation:** tests check missing actor, null decision, non-admin, self-approval, owner approval and rejection of their guide's review, non-pending and missing targets, and exact error messages. Injected audit failures roll back review and claim state and rating aggregation. An independent administrator can approve both target types and produces two audit entries. Customer DML is not enabled by the fixture.
- **Competing claims:** two separate PostgreSQL sessions attempted approvals on the same guide. The harness observed the second session blocked by another backend, required the exact losing error, and checked one approved owner, one still-pending claim, one audit row and unchanged rating aggregate.
- **Oracle:** tests assert `current_user`, non-superuser/non-BYPASSRLS roles and `row_security=on`; the harness separately verifies its denial helper rejects both successful SQL and an unrelated SQLSTATE. The cluster owner is used for schema and fixture setup only, and is not treated as an application administrator.

## Missing evidence and design limits

The inherited-role fixture is deliberately adversarial and its existence on any hosted project is unknown. The captured subset omits hosted media and object-storage policies, full role memberships, the complete callable-function inventory, API exposure and authentication configuration. PostgreSQL role/GUC simulation does not verify JWT signatures, Supabase anonymous sign-in behavior, real Data API grants, connection-pool behavior, or the service-role/owner boundary. Reconcile those separately before any hosted change. No conclusion here authorizes a migration, enables submissions, verifies identity mapping, or provides a blanket security sign-off.

## Commands and outcomes

- `python3 tests/backend-independent-review/run.py` — exit 0; all characterization and safety checks passed, with the inherited-grant bypass explicitly reported as **EXPECTED FAILURE**.
- `python3 tests/backend-independent-review/run.py --strict` — exit 1 as expected for that regression; no other test failed.
- The initial sandboxed run could not initialize PostgreSQL because shared-memory creation returned `Operation not permitted`; both completed runs used approved local execution outside the sandbox.
