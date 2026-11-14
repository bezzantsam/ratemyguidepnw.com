import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildReviewedTideComparison,
  type ChinookTideComparisonData,
} from './chinook-tide-core';
import {
  isReviewedReleaseVisible,
  reviewed2026ChinookHistory,
} from './chinook-reviewed-history';

export type { ChinookTideComparisonData, ChinookTidePoint } from './chinook-tide-core';

/**
 * Returns the verified comparison, or null when it must not be shown.
 *
 * A provenance/integrity failure withholds only this research panel (and is
 * logged loudly in the build/server log) rather than throwing, so a damaged
 * artifact can never take down the whole intel page or block unrelated
 * deploys. Tampering is still caught in CI by tests/chinook-tide-comparison
 * .test.mjs, which asserts the committed artifact verifies.
 */
export function reviewedChinookTideComparison(): ChinookTideComparisonData | null {
  if (!isReviewedReleaseVisible()) return null;
  try {
    const wdfw = reviewed2026ChinookHistory();
    if (!wdfw) return null;
    const raw = readFileSync(
      path.join(process.cwd(), 'data', 'noaa-astoria-2026-reviewed.json'), 'utf8'
    );
    return buildReviewedTideComparison(JSON.parse(raw), wdfw.rows, wdfw.source_sha256);
  } catch (error) {
    console.error('[chinook-tide] comparison withheld:',
      error instanceof Error ? error.message : String(error));
    return null;
  }
}
