# RMG read-only launch preparation

## Scope and checkpoint

Parent: `9ca4b8ab3ec77aa1824057ebcd49a909ce1421b7` (PR #116), which contains the PR #112 directory candidate plus the independently accepted identity-copy correction. The original fixed-checkpoint acceptance is on PR #116 comment `6918815715`; it is not automatic acceptance of this follow-on commit.

This work branch is `coordinator/rmg-launch-prep`. It does not move any donor branch, merge into main, change hosting settings, approve content or deploy. Existing identity decisions, source IDs, data files, review/claim gates and backend proposals are unchanged.

The user-facing RMG homepage and navigation now focus on guide discovery rather than promoting Chinook Intel. The older `/intel/*` routes, data and their scientific tests are deliberately preserved, with their inherited noindex behavior. This is removal of homepage/navigation promotion, NOT a claim that every historical research route has been extracted. Chrome.ai remains a separate portfolio/research project, not an RMG launch dependency.

The read-only scope excludes active reviews, profile claims, moderation, ownership edits and uploads. It does not establish that separately hosted database/API endpoints are locked down. Pending research and held records remain unpublished as additions; solving every hold is not a prerequisite for releasing the already-supported directory.

## What changed

- Removed the research feature card from `app/page.tsx`.
- Replaced the shared-navigation research link with the existing listing-explanation page; corrected the shared description to describe the read-only directory.
- Preserved the pre-launch notice and robots `index: false, follow: false` rather than silently approving a public launch.
- Added a dependency-free GET-only smoke command with seven response checks, bounded downloads/timeouts, no redirects, no credentials and no mutation requests.
- Integrated that command into the existing ordinary isolated build before browser tests. The dummy backend's zero-request assertion remains active.
- Added local fixture/HTTP/CLI tests and a focused CI job. No new npm dependencies.
- Disabled automatic Git deployments for this work branch in `vercel.json`, preserving the prior fix-branch rule. Other branch settings are not changed. This does not prevent a privileged manual deployment or disable automatic deployments on main.

## Validation commands

Use the project's Node 22 environment. The focused tests require no npm installation:

```sh
npm run test:launch
```

Existing application checks remain required:

```sh
npm run check
npm run test:isolation
BROWSER_EXECUTABLE=/path/to/chromium \
  node scripts/browser-isolation.mjs ordinary "$(git rev-parse 'HEAD^{tree}')"
```

The ordinary runner now invokes the same smoke command against its owned loopback production server, and then runs existing browser coverage. Synthetic and editorial-preview tests remain unchanged and must still pass in the normal application CI.

## Manual smoke test on a local or explicitly authorized deployment

No URL is assumed. Local example (use the actual port of the production preview):

```sh
npm run smoke:launch -- --base-url http://127.0.0.1:3000 \
  --output /tmp/rmg-local-launch-smoke.json
```

Only after the target and access have been authorized, a remote run uses an HTTPS origin and explicit opt-in:

```sh
npm run smoke:launch -- --base-url https://AUTHORIZED-DEPLOYMENT.example \
  --allow-remote --output /tmp/rmg-authorized-launch-smoke.json
```

Replace the placeholder with the authorized origin. Do not supply bypass tokens, credentials or query strings. The runner refuses redirects; use the canonical origin after independently checking it. A protected deployment returning a login/challenge is NOT a pass. An existing output file is never overwritten. Exit 0 means the listed checks passed; exit 1 means one or more failed; exit 2 means configuration or report-writing failed.

Checks: homepage, directory introduction, unavailable reviews, unavailable moderation, unavailable claim page, a nonexistent guide (404), and the internal editorial route (404). Expected text inside scripts/comments/templates cannot stand in for rendered-page content. The tool checks representative forbidden markers, research promotion in directory links, and forms on unavailable pages.

Limits: it does not execute JavaScript, prove that there are no write endpoints, authenticate users, inspect live database permissions, verify credentials/licensing/source truth, identify the served commit, or exhaustively scan public data. Use the independent browser/authorization work for its separately stated scope. A green smoke result is NOT launch authorization.

## Owner-controlled release sequence

1. Pin the candidate SHA and its successful CI runs. Obtain focused review of this follow-on diff, particularly the homepage/navigation and smoke runner. Preserve the earlier acceptance record rather than claiming it covers new changes.
2. Select the intended main-facing candidate without merging donor PRs blindly. This branch inherits #112 and #116, but not the optional #114 editorial follow-up or backend proposals. Preserve all donor work. Review the exact candidate-to-main diff and rerun tests if combined with newer changes.
3. Confirm the actual hosting project/team, production branch, current deployment ID, custom domains and rollback target through authorized access. Do not guess them. A merge to an auto-deployed main branch may publish immediately; no merge is authorized by this document.
4. Review the build environment and output. Keep privileged keys and live backend credentials out of this read-only build. Record resolved Node/npm/dependency versions. No committed npm lockfile existed at the parent checkpoint: dependency resolution remains a reproducibility gap, not something this task silently fixes with an untested lockfile.
5. Confirm the indexing decision explicitly. This candidate stays noindex and pre-launch. Removing those protections needs an approved release decision and an exact tested change; simply merging this branch does not make search indexing ready.
6. With explicit deployment approval, test the intended production-environment artifact at an authorized address before assigning the live domain where supported. Match its SHA/build to the hosting release record; the GET smoke runner cannot establish that on its own.
7. Inspect desktop/mobile pages and run the GET smoke check on the exact release and canonical domain. Check HTTPS and the actual server-artifact exposure rules. Stop on failed routes, unsupported claims, leaked candidate markers, auth challenges or unexpected backend activity. Do not work around failures by enabling reviews/claims or relaxing identity rules.
8. Preserve the prior known deployment and configuration. If the release fails, an authorized operator restores the recorded previous deployment/domain target through the existing host and reruns checks. Do not perform database rollback for this frontend-only change or delete rollback artifacts. No rollback action is executed here.

## Open gates, not new features

- Full application/browser CI for the new commit and focused independent review.
- Exact deployment/project/environment and rollback inventory.
- Dependency lockfile/reproducible build follow-up.
- Owner approval for merge/deployment and indexing state.
- Optional field-level editorial decisions stay separate; no bulk approval.
- Hosted backend verification stays separate before any future feature activation.

Local evidence for this preparation: 21 new tests passed on Node 22.16.0, including real loopback HTTP and CLI positive/negative tests. Outbound DNS failed for github.com and registry.npmjs.org in this container, so a local full dependency install/build is not claimed. Full-app execution must be established from exact-commit GitHub CI independently of these focused checks.

## Official references

- Git deployment configuration: https://vercel.com/docs/project-configuration/git-configuration
- Deployment management: https://vercel.com/docs/deployments/managing-deployments
- Node fetch and abort signals: https://nodejs.org/api/globals.html

These references explain platform behavior; they do not verify this account's hosted configuration.
