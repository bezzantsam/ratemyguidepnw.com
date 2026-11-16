# Local visual population rehearsal

From a clean, committed checkout with project dependencies and an available browser:

```sh
node scripts/editorial-visual.mjs
```

The command snapshots the exact current Git tree into two disposable workspaces. It builds the ordinary product and a separate candidate simulation sequentially, starts owned mock-backend and application servers on loopback ports, and opens both directories. The preview displays **Unapproved editorial preview** on every page and has a link to the ordinary directory and a field-level changes page. Press Ctrl+C to stop only these servers and delete the temporary workspaces. The preview adapter is generated only inside the temporary snapshot and uses the actual directory and profile components. The approved-data file, checkout build output and environment files are never copied from or written to the primary workspace.

With no decision file, the simulation includes all structurally supported, unheld candidate attributes and waters in one preview build; it leaves the input facts pending and unapproved. It excludes original holds, conflicts, hard holds, unsupported scopes and follow-up leads that remain held. It is a visual simulation, not an editorial decision or a current-availability claim. Business offerings are not personal expertise; only source-stated relationships are displayed. Use `--decisions /path/to/decisions.json` to rehearse only changes in a validated editorial decision file.

Generate and validate a reversible, unapplied release package from explicit decisions:

```sh
python3 scripts/editorial_release.py generate --decisions /path/to/decisions.json --base-commit "$(git rev-parse HEAD)" --output /tmp/guide-release-package.json
python3 scripts/editorial_release.py validate --decisions /path/to/decisions.json --base-commit "$(git rev-parse HEAD)" --package /tmp/guide-release-package.json
```

The package contains the exact base commit, product and evidence hashes, decision artifact, unmodified before files, proposed after files, field-level diff, affected-guide and distinct-fact counts, unresolved items and a reverse patch bound to the proposed output hash. Validation regenerates the patch and checks the reverse restores the original bytes. The package records required tests as **not supplied** until separately verified; it does not claim CI success. To attach a JSON test-evidence artifact, pass `--test-evidence /path/to/evidence.json` to `generate`; its bytes and hash are recorded as supplied, not independently authenticated. To check a materialized test copy before rollback, pass `--proposed-dir /path/to/test-copy` to `validate`; its product files must match the proposed output hash. It neither applies nor authorizes any change. A stale base, changed evidence, unknown item, conflicting decision, unresolved hold or incomplete relationship is rejected by the existing editorial validator. Product-level hard holds remain in force.

For a disposable browser rehearsal and QA screenshots:

```sh
BROWSER_EXECUTABLE='/path/to/chromium' node scripts/editorial-visual.mjs --test --screenshots /tmp/ratemyguide-visual-screenshots
```

The test blocks unexpected external requests and rejects backend writes. The screenshot directory contains ordinary and preview desktop views and preview desktop/mobile directory/profile views. These are unapproved QA artifacts, not deployment artifacts. The ordinary production routes and bundles do not import preview modules or pending research.
