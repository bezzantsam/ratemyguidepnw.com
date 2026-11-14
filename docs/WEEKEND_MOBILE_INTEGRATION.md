# Weekend mobile integration — merge and release gate

This branch combines four independently tested **draft** features without touching `main`:

| Origin PR | Feature | Current behavior |
|---|---|---|
| #33 | Installable mobile PWA | Manifest, icons, opt-in installation, four thumb tabs, offline-only fallback |
| #23 | Saved Guides | Up to 50 OR/WA captain profile routes saved in the browser's local storage |
| #27 | Progressive review composer | Trip month, captain-controlled ratings, firsthand account, then sign-in and **pending** moderation |
| #30 | Washington stable URLs | Imported source identity keys mapped to existing pinned public IDs |

## Release order

1. Do not merge origin PRs separately if this consolidated PR is chosen; this branch includes their code and regression suites.
2. Verify GitHub Actions: existing official-source/methodology checks; all four JS suites; TypeScript and production build.
3. Manually smoke-test an approved **HTTPS preview** on iPhone Safari and Android Chrome. Verify installation, icons, offline fallback, tab navigation, guide saving, storage clearing, review steps, keyboard focus and accessibility.
4. **Backend security gate:** RateMyGuidePNW Supabase was **inactive** at last inspection. The committed schema does not establish working review insert permissions or deployed optional columns. No claims of functional end-to-end review submission until issue #28 is resolved with auth/RLS/moderation tests.
5. Keep accurate provenance labels: imported listing != current licensing; account claim != verified captain; moderated review != proof of trip. Chrome-AI's separate site is not a runtime dependency.
6. Principal approval is required before any merge, deployment, DNS edits, native app packaging or verified-trip feature claims.

## Known limitations

- PWA is not an App Store or Play Store native app. Installation needs HTTPS and supported-browser testing; no native notifications.
- Offline worker caches only `/offline.html`, never profiles, reviews, login/session records or API responses.
- Saved guides are device/browser-local, not secret from other people using that browser and not synced across devices.
- Review composer retains a tab-local draft during OAuth sign-in; unsubmitted drafts are never published. There is no receipt upload, SMS check or automatic proof deletion.
- No live database changes and no public Chrome-AI data release included.

## Integration verification

```sh
npm run test:pwa
npm run test:shortlist
npm run test:review
npm run test:directory-ids
npm run typecheck
npm run build
```

CI runs these tests and the existing source/creel/methodology checks.
