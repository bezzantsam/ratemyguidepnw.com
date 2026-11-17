# RateMyGuidePNW — read-only directory launch candidate

Independent Oregon and Washington fishing-guide discovery, built with Next.js App Router and TypeScript. Registry listings and attributed business information are not current license verification, personal endorsements, ownership verification or booking availability.

**Pre-launch, read-only scope:** search, filtering, stable profile links and listing-source explanations are available in the candidate. Reviews, profile claims, moderation, owner edits and media uploads are unavailable. The ordinary directory must work without a live backend. This application restriction does not prove the separately hosted database or API is secure. Never commit credentials to this public repository.

## Local development and validation

Use **Node 22.x** (declared in `.nvmrc` and `package.json`). The committed npm v3 lockfile records the dependency graph; routine installation must not resolve a new one.

```sh
node --version
npm run verify:dependencies
npm ci --no-audit --no-fund
npm run dev
# Open the actual local URL printed by Next.js.
npm run check
npm run test:isolation
```

`verify:dependencies` runs offline. `test:dependencies` checks missing/stale locks, runtime agreement, registry/integrity metadata and install-path boundaries. `check` includes dependency, scientific-data, directory/identity, launch-smoke, TypeScript and production-build checks. Every build runs the offline dependency guard first. These checks are not a complete security audit or editorial approval.

## Public application scope

- `/` and `/guides`: guide discovery and URL-backed filters.
- `/guides/[slug]`: Oregon source-record profiles.
- `/washington` and `/washington/[id]`: Washington directory and stable source-record profiles.
- `/guides/verification`: explanations of evidence and unavailable verification.
- `/waterways` and `/waterways/[slug]`: source-context browsing.
- `/reviews`, `/claim/[id]` and `/admin`: explicit unavailable states, not working submission or moderation interfaces.
- `/about`: mission and pre-launch context.

The directory uses static registry data, not a live licensing lookup or a completed database import. The Oregon source has 1,027 registrations. Washington source allocations and unresolved cross-state links are governed by separate tests; matching names alone must not merge people. No guide ratings are invented.

## Separate research and editorial work

Chrome.ai remains a separate research/ML portfolio project. Legacy `/intel/*` pages, public-source datasets and scientific checks remain preserved in this repository; research promotion has been removed from the RMG homepage/navigation. This is not a claim that every legacy route has already been extracted. Historical implementation records remain in Git history and `docs/chinook-intel-integration.md`. Public historical source provenance is recorded in `docs/chinook-2026-source-audit.md`; it is not prospective forecast skill.

Pending research, held observations and proposed Washington identities do not become approved facts through a build or merge. The offline editorial workflow and clearly labeled disposable preview are documented in `docs/qa/editorial-review-workflow.md` and `docs/qa/editorial-visual-rehearsal.md`. Optional later research PRs are not silently included in this candidate.

## Isolated browser validation

Choose a local Chromium/Chrome executable and an explicit Git tree. The runners copy tracked source, excluding credentials and local environment files, into disposable workspaces. Each uses `npm ci`, its own dummy backend and app ports, and its own cleanup. No shared `.next` output or live credentials are used.

```sh
TREE=$(git rev-parse 'HEAD^{tree}')
BROWSER_EXECUTABLE='/path/to/chrome' node scripts/browser-isolation.mjs ordinary "$TREE"
BROWSER_EXECUTABLE='/path/to/chrome' bash scripts/build-fixture-browser.sh "$TREE"
```

For deliberately staged changes, `git write-tree` supplies the test tree; unstaged/untracked work is excluded. Synthetic builds are test-only and must never be deployed.

## Release boundary

See `docs/qa/read-only-launch-handoff.md` and `docs/qa/dependency-reproducibility.md`. Vercel's repository engine override selects Node 22.x for a future authorized deployment, with a frozen install command. Its minor/patch versions remain platform-managed; no existing hosted deployment or setting is changed by these files.

Before release, review the exact candidate and CI evidence, confirm the intended hosting project/domain and rollback target, and obtain explicit merge/deployment/indexing approval. The candidate remains pre-launch/noindex. Backend migrations and local authorization/storage proposals are separate work: do not apply them or enable writes as part of the directory release.
