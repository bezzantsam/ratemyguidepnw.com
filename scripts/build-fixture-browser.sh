#!/usr/bin/env bash
# Isolated local/CI browser artifact. Never deploy this synthetic test build.
set -euo pipefail
fixture_target=lib/approved-guide-attributes.json
saved=$(mktemp)
cp "$fixture_target" "$saved"
restore() { cp "$saved" "$fixture_target"; rm -f "$saved"; }
trap restore EXIT
cp tests/fixtures/discovery-attributes.json "$fixture_target"
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-test-key npm run build
