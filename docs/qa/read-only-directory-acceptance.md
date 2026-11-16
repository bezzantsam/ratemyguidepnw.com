# Independent review: read-only directory candidate

**Decision for fixed candidate `d47eb254481d6af121d6e0af365eb38153719e25`: reject pending one identity-copy correction.** This does not judge the author's later work. The review branch changes tests and this report only. The ordinary, unmodified application was built in a disposable tree with a run-owned unavailable dummy backend and a synthetic server-only secret marker.

## Confirmed read-only release blocker

[`app/guides/page.tsx`](../../app/guides/page.tsx) tells every directory visitor, “Shared captains appear once.” [`lib/washington-reconciled.ts`](../../lib/washington-reconciled.ts) has an empty `identityLinkDecisions` array, and [`lib/directory.ts`](../../lib/directory.ts) independently adds Oregon and Washington source rows. There is no approved cross-state identity linkage supporting the unqualified deduplication guarantee. **Reproduce:** open `/guides` and read the introductory text; inspect the empty decisions array. The independent browser test characterizes the statement as a release blocker and passes only while that statement remains present. Remove or qualify the unsupported promise; do not merge records or infer identity from names to make the copy true. This finding does not claim that any two similarly named source rows actually represent the same person.

## Observed nonblocking issues and limitations

- On the local Next.js production server, `POST`, `PUT`, `PATCH` and `DELETE` to `/claim/OG.0000047` or `/guides/og-0000047` returned **200 HTML for the same read-only page**. The tested API-like routes returned 404 and `/reviews` and `/admin` returned 405 for those methods; the dummy backend observed zero requests. This is misleading HTTP method semantics, not evidence of an executable write. Responses from hosting infrastructure may differ.
- The fixed candidate has no committed npm lockfile. The tested `npm install` resolved Next 15.5.29 and Supabase JS 2.119.0. Local Node 20.3.0 produced dependency engine warnings (Supabase JS requested Node >=22); the build and tests still passed. CI uses Node 22. Dependency resolution and future builds can drift.
- One held research observation occurs in a server-only compiled implementation chunk. The representative `/_next/server/...` URL returned 404, and the checked public assets/rendered output did not contain the targeted held markers. This is not a finding of public disclosure; verify that any actual deployment does not expose server artifacts. The scan is targeted, not an exhaustive information-flow proof.

## What was checked

In the isolated run, `npm run test:intel` passed 17/17; `npm run test:mvp` passed 54/54; `npm run typecheck` and the ordinary `npm run build` passed (with CSS autoprefixer warnings). The existing `tests/production-browser.test.mjs` passed 1/1. The independent browser/HTTP test passed its two operational tests; its third test explicitly reports and characterizes the identity-copy blocker. The dummy backend received **zero** requests. The application and browser were restricted to loopback; external browser requests were blocked and none occurred.

The independent run scanned public client assets and generated HTML/RSC against representative pending/held, fixture and synthetic-secret markers. It inspected server output for the synthetic secret marker and tested the direct URL of the server-only held-marker bundle. Representative offline editorial and report URLs returned 404. Coverage is a targeted sample, not proof that every possible record or route is absent.

The browser checked Oregon `OG.0000047` and Washington `wa-000` links and labels; seven unresolved Oregon associations had no Washington identity claim. Proposed IDs `wa-158` through `wa-162` and an unknown ID returned 404. Neal Burrell's checked profile did not display the excluded Grindstone offering. The tested review states say unavailable rather than showing a zero rating. Desktop and mobile checks covered a filtered search, copied-link fallback, keyboard focus, profile return, reload, Back/Forward, an actionable empty result, and absence of horizontal overflow. The screenshots below were inspected as rendered images:

- [Desktop filtered directory](read-only-directory-acceptance/desktop-directory.png)
- [Mobile filtered directory](read-only-directory-acceptance/mobile-directory.png)
- [Desktop profile](read-only-directory-acceptance/desktop-profile.png)
- [Mobile profile](read-only-directory-acceptance/mobile-profile.png)

To reproduce from a clean review checkout, install Node, npm and a local Chrome/Chromium, then run:

```sh
TREE=$(git rev-parse 'HEAD^{tree}')
BROWSER_EXECUTABLE='/path/to/chrome' REVIEW_SCREENSHOT_DIR=/tmp/directory-review-screens \
  node tests/independent-directory-acceptance/run.mjs "$TREE"
```

The runner snapshots that exact Git tree, excludes local environment files, installs dependencies, runs the checks, builds once, starts separate owned loopback app and dummy-backend servers, and cleans up. Use the acceptance commit's tree; the application code in it is exactly the reviewed target.

## Separate decisions

- **Editorial publication:** Existing source-linked waterway claims and other public source records are not independently verified by this review. Optional pending research remains unpublished and is not itself a read-only release blocker.
- **Future backend activation:** This review provides no hosted database or Auth security assurance. Live identity mapping, role memberships, RLS, callable functions, Data API and Auth must be independently validated before submissions or ownership edits. The separate local Storage review leaves hosted configuration, content validation, safe publication and signed-URL revocation/expiry unresolved. No review, claim, media, or moderation activation is authorized here.
- **Release recommendation:** Correct the identity guarantee and rerun this pinned ordinary-data review before reconsidering release. Do not treat the absence of the optional backend features as a blocker for a genuinely read-only directory.
