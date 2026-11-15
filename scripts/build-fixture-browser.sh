#!/usr/bin/env bash
# Build and test only inside a disposable snapshot. The source tree is explicit.
set -euo pipefail
if [ "$#" -ne 1 ]; then echo 'Usage: bash scripts/build-fixture-browser.sh <git-tree-id>' >&2; exit 2; fi
exec node scripts/browser-isolation.mjs synthetic "$1"
