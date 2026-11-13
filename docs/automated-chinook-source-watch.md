# Automated WDFW Chinook source watch · RateMyGuidePNW

## What is automated, without passwords

The public RateMyGuidePNW repository now has a scheduled GitHub Actions workflow to monitor the **official WDFW Buoy 10 Chinook** report at:

https://wdfw.wa.gov/fishing/reports/creel/buoy10

It runs **daily in August/September, weekly during other months**, plus manually via GitHub Actions. It authenticates to GitHub only with the workflow's default, repository-scoped token; it does **not** contain or use the private Chrome-AI or RateMyGuidePNW Supabase database passwords.

1. Download only the trusted HTTPS WDFW page, fail on off-domain redirects or a changed/malformed response
2. Parse **August 2026 and 2027 Chinook** sampled anglers, boats, retained Chinook, sampling/retention notes and explicit sample status
3. Check the first five real, pinned Aug 2026 observations and counts; fail loudly if WDFW revises those known values
4. Record only completed Pacific-local calendar dates, detect duplicated days, unexpected rows, absent effort and implausible reported catches
5. Preserve actual sampled zero retained Chinook if retention is declared open; **never** turn a missing/closed/not-sampled day into a zero
6. Compare normalized observational changes with the previous pending review candidate; do not open a new PR on each scheduled run
7. When observations change, update **one open GitHub Pull Request** at `bot/wdfw-chinook-review` for human QA (with a publicly visible agency HTML SHA and retrieval timestamp). This JSON is public agency data but **not** an approved scientific outcome dataset.

**Publishing is intentionally gated.** While the bot review PR is open, the candidate does **not** enter the public website, model training, seven-day forecast issuance, prospective scoring or guide reviews. The source-review PR is never an automatic website release. After an independent agency-source audit, an **explicitly separate, SHA-pinned historical release** in `data/chinook-2026-reviewed.json` can be committed to production `main` and rendered by `lib/chinook-reviewed-history.ts`. It displays agency counts as preliminary, not certified regulations or forecast accuracy. **All 2027 source data is excluded** even if it appears in the same candidate, and no source numbers become ML evaluation outcomes via this route.

## Project independence

The *private* Chrome-AI pipeline continues fetching WDFW and storing the original agency HTML with SHA-256 and server acceptance timestamps in isolated Supabase. The website watcher independently checks the **same public official source**. They are *two separately running ingestion paths*, not a private-DB-to-public cross-repository API or connected data merger.

A true private-Chrome-AI-to-public-website release would require a separately authorized, narrowly scoped cross-repo writer (e.g. GitHub App), signed artifact, dedicated allowlist and explicit release QA. The ordinary `GITHUB_TOKEN` from one repository cannot write to or read private data from a different repository. **Do not copy the Supabase admin password into the public website's GitHub Secrets.**

## Operational notes

- Source changes open **one** review PR, not repeated daily notification spam
- If WDFW site is unreachable or its structure changes, the job fails visibly rather than publishing fake catches
- No anonymous customer reviews, paid guide profiles or marketing posts enter Chinook forecast training
- `python -m unittest discover -s tests -p 'test_chinook_wdfw_watch.py' -v` tests the data parser using synthetic source HTML, without touching production
- `npm run check` still verifies the public site release contract and production Next.js build

**GitHub owner configuration:** If GitHub returns an error that workflow tokens cannot create Pull Requests, the repo owner must enable **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**, or use an authorized GitHub App. The current repository denies GitHub Actions PR creation even with write-scoped workflow tokens. A one-time [maintainer-created review PR #3](https://github.com/bezzantsam/ratemyguidepnw.com/pull/3) solves this: scheduled updates keep that same PR current. If it is merged or closed and GitHub still blocks new PR creation, the automation retains the review branch and opens at most one GitHub Issue requesting a new review PR. It never pushes unreviewed agency data into `main`.

## Next release milestone

A separately source-reviewed, SHA-pinned, public-safe **historical 2026** data release for the site chart, with a separate manual approval gate for 2027 results and absolutely no automatic model skill claims. The 2027 scientific score remains a separate private evaluation against server-accepted seven-day-ahead frozen forecasts.

## Review handoff to a public historical chart

- The first human-created source-review queue is [PR #3](https://github.com/bezzantsam/ratemyguidepnw.com/pull/3). New WDFW source changes update that PR if it remains open.
- Do **not** merge a 2027 record merely because a sample exists. Check it against the independent private Chrome-AI archive and verify agency source revisions, source-date sampling and regulation context.
- For the **historical 2026** series, the source-audited data is **copied into a separate, hash-pinned reviewed release file**, merged through an independent code-review PR. The source bot's PR #3 stays open for future monitoring. Production reads the reviewed release only, refuses unknown source hashes or changed historical rows, and never loads 2027 data.
- Preview builds and local environments deliberately do not render an unapproved review candidate. Public authorization is based on `VERCEL_ENV=production` and `VERCEL_GIT_COMMIT_REF=main`; do not relax those gates merely to make a preview look full.

**2026 approved historical audit:** [docs/chinook-2026-source-audit.md](chinook-2026-source-audit.md). The continuing source-watch PR remains open and is not itself the production data release.
