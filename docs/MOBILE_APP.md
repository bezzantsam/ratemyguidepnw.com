# RateMyGuidePNW installable mobile app (PWA)

This is an installable **web app**, not an App Store / Google Play native binary. It uses the existing Next.js application, auth, directory and moderation infrastructure. There is no second database or native app project.

## Install

- **Android / Chrome:** Visit the deployed HTTPS site, then use the browser's **Install app** option (or the on-page Install app control when supported).
- **iPhone / Safari:** Visit the site, tap **Share** and **Add to Home Screen**. Safari may place it under More Actions.
- **Desktop:** Use the browser's install option if supported.

Installation controls appear only when the browser offers installation or when iOS home-screen guidance is relevant; they never imply that the app is installed.

## Mobile navigation

A compact fixed bottom tab bar is visible on small screens and links to the current, implemented Home, Guides, Dock Talk and Trust routes. Desktop navigation remains unchanged. This is compatible with the later Saved Guides and review-composer draft PRs when merged after approval.

## Offline and privacy design

The service worker pre-caches **only** `/offline.html`. All page navigations still go to the network. If offline, they receive a connection-required screen. It does **not** cache guide profiles, angler reviews, account pages, API responses, Supabase data, private identifiers or submission drafts. Data displayed online is as current as the server provides; PWA installation alone does not verify licenses or completed trips.

Neither the PWA nor the offline page changes review moderation, account security, government-record provenance or experimental model status. The internal Chinook Intel pages are still present until the separately approved Chrome-AI migration.

## Validation

Run `npm run test:pwa`, `npm run typecheck`, and `npm run build`. Browser installation must be checked on HTTPS (or localhost): manifest /manifest.webmanifest, icon /icon-192 and /icon-512, worker /sw.js, and online/offline navigation. Test on Android Chrome and iOS Safari before calling a mobile launch complete.

## Not included

Native push notifications, background data sync, App Store distribution, cross-device saved guides, verified trip proof, offline reviews, paid captain tools, deployment and production domain changes.
