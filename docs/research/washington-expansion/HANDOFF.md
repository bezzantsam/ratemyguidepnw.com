# Handoff: Washington market expansion

Branch `codex/washington-market-expansion` is based on `codex/evidence-discovery` at `60afe401f035639ec4c2cec46143bbaffe80ee7f`, chosen because it contains the latest inspected directory identity protections and pending evidence work. `git rev-parse HEAD` returns the local implementation commit. Review branch/PR history for the hosted commit if publication used the connected GitHub API.

The deliverable is an internal source-claim queue and reproducible offline audit, not a public directory import. See `README.md` in this directory for source links, baseline, counts, limitations, and the geographic/species matrix. `candidates.csv` retains the original manually researched claims; `review-sample.csv` is the reviewable 79-row output; `baseline-and-summary.json` and `hosted-aggregate-20261117.json` record the point-in-time snapshot. The 56 no-match results are provisional business candidates; the number of verified net-new people or businesses remains unknown. They do not meet the 200 target.

Run from repository root:

```sh
python3 scripts/washington_expansion_audit.py --out /tmp/wa-review
python3 scripts/washington_expansion_audit.py --out /tmp/wa-review-search --query 'walleye banks'
python3 -m unittest discover -s tests -p 'test_washington_expansion_audit.py' -v
npm run test:mvp
npm run test:intel
npm run typecheck
npm run build
```

The review CLI searches guide name, business, aliases, species, waters, city and port; it never assigns IDs, merges captains or publishes. It checks Washington and Oregon repository data and a saved hosted exact-business aggregate. The hosted snapshot is SHA-bound to the source CSV; changing the CSV requires a new authorized read-only comparison and a corresponding snapshot update. Full live fuzzy/name/phone/geography comparison and independent person/business reconciliation are still required. Source directories can be stale, contain non-guides or refer to multiple captains, and their contact and website claims need validation.

**Integration:** first compare the latest upstream branch and deployment configuration; preserve pre-existing stable WA source IDs, distinct captains and any unresolved identity holds. Review source and identity for each candidate; associate the correct person before constructing a profile, then propose stable IDs and source-backed fields with pending status under the established enrichment/attribute contracts. Only separately approved fields may enter public search. The public search already supports approved names, aliases, species, source areas and advertised waters; an explicit reviewed port/geography contract is still needed. The current claim and review submission paths are disabled for Washington pending identity and security work; preserve those controls and do not present candidates as verified, claimed or licensed. Do not modify hosted data, publish candidate attributes or deploy without the user's approval.

Local validation: 40 MVP Node tests, 17 Intel Node tests, 51 Python tests, TypeScript typecheck and Next.js production build passed. The first system-Python run could not import BeautifulSoup; all 51 Python tests passed using the existing `/private/tmp/ratemyguide-ci-venv`. Local Node dependencies were reused from the existing checkout, not freshly installed. No paid API calls, outreach, database writes, or intentional deployment were made. The branch-local `vercel.json` suppresses automated deployment for this branch only; do not silently remove that safeguard while the no-deployment instruction applies.
