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
7. When observations change, update **one open GitHub Pull Request** at `bot/wdfw-chinook-review` for human QA (with a private-to-the-PR exact WDFW HTML SHA and retrieval timestamp). This JSON is public agency data but **not** an approved scientific outcome dataset.

**Publishing is intentionally gated.** The watcher's candidate JSON is **NOT imported into the live Chinook page**, model training, seven-day forecast issuance, prospectively verified outcome scoring or guide reviews. Before any new values are published, someone must verify the actual official record, sampling effort, legal Chinook retention, 2027 publication timing, source revisions and display scope; only then promote reviewed historical data by explicitly changing the public-release contract.

## Project independence

The *private* Chrome-AI pipeline continues fetching WDFW and storing the original agency HTML with SHA-256 and server acceptance timestamps in isolated Supabase. The website watcher independently checks the **same public official source**. They are *two separately running ingestion paths*, not a private-DB-to-public cross-repository API or connected data merger.

A true private-Chrome-AI-to-public-website release would require a separately authorized, narrowly scoped cross-repo writer (e.g. GitHub App), signed artifact, dedicated allowlist and explicit release QA. The ordinary `GITHUB_TOKEN` from one repository cannot write to or read private data from a different repository. **Do not copy the Supabase admin password into the public website's GitHub Secrets.**

## Operational notes

- Source changes open **one** review PR, not repeated daily notification spam
- If WDFW site is unreachable or its structure changes, the job fails visibly rather than publishing fake catches
- No anonymous customer reviews, paid guide profiles or marketing posts enter Chinook forecast training
- `python -m unittest discover -s tests -p 'test_chinook_wdfw_watch.py' -v` tests the data parser using synthetic source HTML, without touching production
- `npm run check` still verifies the public site release contract and production Next.js build

**GitHub owner configuration:** If GitHub returns an error that workflow tokens cannot create Pull Requests, the repo owner must enable **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**, or use an authorized GitHub App. The site stays safe if this is unavailable: the action fails instead of pushing into `main`.

## Next release milestone

A reviewed, signed, public-safe **historical 2026** data release for the site chart, with a separate manual approval gate for 2027 results and absolutely no automatic model skill claims. The 2027 scientific score remains a separate private evaluation against server-accepted seven-day-ahead frozen forecasts.
