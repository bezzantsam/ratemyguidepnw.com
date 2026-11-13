# WDFW Buoy 10 Chinook · August 2026 source-audit record

**Publication scope:** descriptive, **preliminary WDFW creel samples only**; no fishing-regulation advice, individual catch probability, full-season harvest estimate, guide endorsement, or validated Chrome-AI prediction. Review completed November 13, 2026.

## Independent evidence checks

| Audit | Result |
|:--|:--|
| Official WDFW source | https://wdfw.wa.gov/fishing/reports/creel/buoy10 |
| Published source reporting vintage | **Updated October 1, 2026**; data explicitly preliminary |
| Original server-archived source SHA-256 | `ef43d5b525a57af1efda3e856d7a77fea08c83ac1e452b208c9daf1cf4199562` |
| Canonical August 2026 source-row SHA-256 | `3a8d445222e82f64515558cbc640cbd7aec10d7193725aa92a643645ef769672` |
| Original private archived source capture | `83faa60c7f23942b96b9269577c951564c9dd076da5a64b56aa8b8ef8701a9a9`, server accepted Nov 13, 2026 06:43 UTC |
| Reproduced against raw WDFW HTML | **31 of 31 August dates; exact match on boats, sampled anglers, retained Chinook and WDFW retention note** |
| Observed Chinook sample totals | **1,373 reported retained / 5,087 sampled anglers** across 31 recorded August sample dates |
| August sample status | 31 reported sampled Chinook-retention dates; no rows coded as missing or closed in the 2026 August table |
| Future or private results | **No 2027 data, no private model predictions, no verified prospective accuracy** |
| Raw source bytes / personal review data in release | None |

The aggregate 1,373 / 5,087 = approximately 0.270 **retained Chinook per sampled angler** is a *sample rate*, not 27% of anglers catching a Chinook, a fishery-wide harvest, or an individual success probability. These are creel-survey observations, not independently proven legal harvest counts for every angler.

## Retention timeline cross-check

| Dates | WDFW creel-column label | Sampled anglers | Retained Chinook | Independent rule evidence |
|:--|:--|--:|--:|:--|
| Aug 1–9 | Chinook and hatchery coho | 1,379 | 457 | Washington 2026 initial seasonal emergency rules |
| Aug 10–24 | Hatchery Chinook and hatchery coho | 2,397 | 705 | Washington 2026 seasonal emergency rules, mark-selective Chinook |
| Aug 25–31 | Hatchery Chinook and hatchery coho | 1,311 | 211 | **Washington emergency rule WSR 26-18-012**, effective August 25 after an August 21 in-season decision, prohibited wild Chinook retention |

References:
- Primary agency observations: https://wdfw.wa.gov/fishing/reports/creel/buoy10
- Initial Washington rule: https://lawfilesext.leg.wa.gov/law/wsr/2026/13/26-13-052.htm
- August 25 emergency mark-selective rule: https://lawfilesext.leg.wa.gov/law/wsr/2026/18/26-18-012.htm
- WDFW/ODFW joint September management summary (historical context only): https://wdfw.wa.gov/sites/default/files/2026-09/2026-columbia-river-compact-fall-fact-sheet-no-4.pdf

The emergency rule matters: preseason rules had proposed opening a non-mark-selective Chinook period on August 25, but the actual joint-state action required hatchery-only retention. The WDFW source table **does** distinguish hatchery Chinook from August 10 onward. This audit cross-checks that August retention classification; it does not certify every local boundary, bag limit or in-season rule applicable to each fishing trip.

## Trusted release path

The website's scheduled source watcher keeps **unapproved** official observations in `data/chinook-wdfw-candidate.json` on the independent review branch `bot/wdfw-chinook-review` and its open review PR #3.

This separately reviewed snapshot is stored as **`data/chinook-2026-reviewed.json`** and is eligible for public rendering **only on production `main`** through `lib/chinook-reviewed-history.ts`. The server gate requires the exact source hash, exact independently recalculated canonical 31-day sample digest, known first-five-day anchor, original retention notes and source QA decision; it rejects revisions unless a new audit and code approval deliberately update the expected hash.

**The review bot's candidate branch may change later; it never changes the approved 2026 public release.** The 2027 season is excluded from this release structurally; its observations and eventual seven-day forecast skill remain separate private scientific work.

## Remaining limitations

- WDFW explicitly labels these creel values preliminary and subject to subsequent revisions.
- The source was captured Nov 13; the private archive proves captured bytes, not the exact time WDFW first published each observation.
- This dataset summarizes *sampled* anglers at Buoy 10, not all Columbia River anglers, total river harvest, or a guide's personal catch rate.
- The Chrome-AI prediction model is frozen and prospectively unvalidated until the 2027 season; no 2027 error statistics are released.
- Real-time regulation advice must always link to current ODFW/WDFW emergency changes rather than extrapolating from a historical sample.
