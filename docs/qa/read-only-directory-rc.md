# Read-only directory release candidate

The candidate starts at main `218c4c91a17ec09600833d041bac32cb90246e2a` and incorporates #101 `009d4d78f32b4b65b28a726d3c25cf60882f48a4`, #102 `60afe401f035639ec4c2cec46143bbaffe80ee7f`, #108 `4d108dff1202d4c45b75765aa32ce15ddbb13f3d`, and #109 `c6578b331ba5159f827764e7bae6b93a272f255b`. Main was their common ancestor; integration required no conflicts. Their historic work remains independently reviewable. This candidate supersedes their application integration only after approval; none is closed or merged here.

Directory search, stable identifiers, reviewed cross-state gates and source context remain. Real research remains pending; the offline review, local visual simulation and reversible package remain separately available. Run `node scripts/editorial-visual.mjs` from a committed checkout to compare the ordinary directory and unapproved candidate simulation. See [editorial rehearsal instructions](editorial-visual-rehearsal.md).

The application does not load review data or offer review submissions, claims, profile edits, media uploads or moderation actions. This is a product-level restriction, not database security. Washington database identities remain unmapped and inaccessible. Existing product data and external database records are not modified.

## Release checklist

- **Read-only directory:** review the exact-head CI results and ordinary desktop/mobile screenshots; confirm search, return, unknown profiles and offline behavior. Independently review identity gates and ordinary output isolation before any release.
- **Editorial publication:** resolve source and identity holds and conflicts with attributable evidence; review unsupported fields and each desired fact and relationship; validate an explicit decision artifact and reversible package. Existing holds and proposed Washington allocations are not approvals.
- **Backend submissions:** separately verify hosted Auth/JWT, Data API grants and RLS, role memberships, storage policies, service-role exposure and the complete callable-function inventory. Independently review backend work and Washington identity mapping before enabling writes or review reads. No backend SQL or hosted configuration is part of this candidate.
