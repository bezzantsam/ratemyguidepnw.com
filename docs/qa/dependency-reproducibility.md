# Locked dependency and runtime handoff

## Scope

This follow-on change belongs to PR #117's read-only directory release candidate. No guide IDs, identities, approvals, registry records, UI content, backend policies, hosted settings, DNS or Chrome.ai code are changed. Pre-launch/noindex and both branch deployment-disable rules are preserved.

The prior runtime mismatch was Vercel project setting 26.x versus CI 22. The repository now declares `engines.node: 22.x`, `.nvmrc` says 22, and both CI workflows read that file. According to [Vercel's Node runtime documentation](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), the repository engine overrides the project setting for future deployments. This is **not** a claim that the currently hosted site changed: no deployment or project-setting update occurred. Minor and patch versions remain platform-managed.

## Actual lockfile generation

Container DNS to GitHub/npm was unavailable. Instead of inventing a dependency graph, a temporary, read-only GitHub Actions job generated it from the real public registry on exact source commit `f07d6445c0e17feb37bfdb7fd352e9143194b2d2`. It ran `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org`, then an actual `npm ci --ignore-scripts` and verified the lock bytes stayed unchanged. The job had contents-read permission, did not use hosted secrets, did not push, and did not execute install scripts. Its bootstrap workflow was removed after the resulting lock was retrieved.

Evidence: [run 44010547469](https://github.com/bezzantsam/ratemyguidepnw.com/actions/runs/44010547469), artifact `14295549522`; exact generation metadata is in `dependency-lock-generation.json`. Archive SHA-256: `43f4d0b4ddc8dc7c1059b204a57d77651c21672a99cb104193d95f88cd663b6c`. Original generated lock SHA-256: `31390161f2ebf56638e0ecc74621e7b754318c324cd92c9ace043646c9880354`. Committed compact-JSON lock SHA-256: `32e3c8e817e343fbfb4870d3ae504572683ac098988cd0a6c7017a939532af90`. Only JSON whitespace was normalized; parsed objects were compared for exact equality. Generation used Node 22.23.4 and npm 10.9.9. The lock contains 69 dependency entries plus its root. All tarballs resolve to HTTPS registry.npmjs.org with SHA-512 metadata. Dependency ranges were not changed.

Exact direct versions include Next 15.5.29, React/React DOM 19.3.1, Supabase JS 2.119.0, TypeScript 5.9.3, lucide-react 0.468.0 and playwright-core 1.65.1. A lock pins resolved versions; it does not certify source safety or mean all transitive code was manually audited.

## Enforced install paths

- Root CI installation uses `npm ci` and asserts the committed lock did not change.
- Ordinary and synthetic disposable snapshots use `npm ci`.
- Both ordinary and unapproved editorial-preview snapshots use `npm ci`.
- The Vercel repository install command first checks release inputs, then runs `npm ci`.
- Every `npm run build` invokes the offline prebuild check.

The offline check verifies Node major, declared runtime, lock format, root dependency declarations, direct-package presence, registry origins and integrity metadata. npm remains responsible for solving/validating the dependency graph and validating fetched tarballs. No fallback to unlocked installation is allowed.

```sh
# Use Node 22.x first.
node --version
npm run verify:dependencies
npm ci --no-audit --no-fund
npm run check
```

To deliberately update dependencies, work on a separate reviewed branch, regenerate the lock, inspect its diff, and rerun full application/browser checks. Do not regenerate it to hide a stale manifest.

## Validation and remaining gates

Generation's successful ignore-scripts install is distinct from the final release tree's full application validation. The final PR must record its exact-head CI results, including ordinary/synthetic/editorial browser execution. Local dependency-contract tests do not install or build the full app.

Still required: focused review of the new launch/runtime changes; confirmation of the served commit and actual Node runtime during an owner-authorized deployment; intended public-domain configuration; rollback reference; explicit merge/deployment/indexing approval. The existing production alias is not changed here. Optional held research and disabled backend features remain separate decisions.
