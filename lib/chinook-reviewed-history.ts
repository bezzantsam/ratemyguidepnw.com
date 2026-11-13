import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chinookRelease } from './chinook-intel';

type SourceDay = {
  date: string;
  boats: number | null;
  anglers: number | null;
  chinook_kept: number | null;
  sample_status: string;
  source_retention_note: string;
};

type ReviewedHistory = {
  source_sha256: string;
  rows: Array<{
    date: string;
    boats: number;
    anglers: number;
    chinook_kept: number;
  }>;
  excluded_days: number;
};

const EXPECTED_URL = 'https://wdfw.wa.gov/fishing/reports/creel/buoy10';
const SHA_PATTERN = /^[0-9a-f]{64}$/;
const STATUS = new Set([
  'observed_unverified_regulations',
  'retention_closed_or_unverified',
  'not_sampled',
  'implausible_needs_review',
]);

function assert(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error('Unapproved WDFW history: ' + reason);
}

/**
 * A candidate on an unreviewed bot branch MUST NOT become a live release.
 * Only a deliberate commit/merge into the production MAIN branch is eligible.
 * Vercel branch previews, unknown deployments and local machines show the
 * separately approved fixed five-day example only.
 */
function isProductionMain(): boolean {
  return process.env.VERCEL_ENV === 'production'
    && process.env.VERCEL_GIT_COMMIT_REF === 'main';
}

export function reviewed2026ChinookHistory(): ReviewedHistory | null {
  if (!isProductionMain()) return null;
  const candidatePath = path.join(process.cwd(), 'data', 'chinook-wdfw-candidate.json');
  let raw: string;
  try {
    raw = readFileSync(candidatePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const candidate: unknown = JSON.parse(raw);
  assert(candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate),
    'missing candidate envelope');
  const data = candidate as Record<string, unknown>;
  assert(data.schema_version === 1 && data.species === 'Chinook',
    'unexpected species or schema');
  assert(data.source_url === EXPECTED_URL, 'not the official WDFW source');
  assert(data.publication_status === 'candidate_review_only', 'unexpected source status');
  assert(data.model_prediction_values_included === false, 'private predictions detected');
  assert(data.official_sample_regulations_verified === false,
    'do not make agency-regulation certification claims');
  assert(data.site_automatically_publishes_candidate === false,
    'unexpected source publication policy');
  assert(typeof data.source_html_sha256 === 'string' && SHA_PATTERN.test(data.source_html_sha256),
    'missing source hash');
  assert(typeof data.observations_sha256 === 'string' && SHA_PATTERN.test(data.observations_sha256),
    'missing normalized source hash');
  assert(Array.isArray(data.seasons) && data.seasons.length >= 1 && data.seasons.length <= 2,
    'unknown report seasons');
  const seasons = data.seasons as Array<Record<string, unknown>>;
  assert(seasons.every(s => s.year === 2026 || s.year === 2027),
    'unexpected source year');
  const history = seasons.find(s => s.year === 2026);
  assert(history && Array.isArray(history.rows)
    && history.rows.length >= 5 && history.rows.length <= 31,
    'historical samples missing or oversized');
  assert(history.observed_days === history.rows.length, 'source row count mismatch');

  let previous = '';
  let excluded = 0;
  const eligible: ReviewedHistory['rows'] = [];
  for (const unknownRow of history.rows) {
    assert(unknownRow && typeof unknownRow === 'object' && !Array.isArray(unknownRow),
      'bad WDFW date row');
    const row = unknownRow as SourceDay;
    assert(typeof row.date === 'string' && /^2026-08-(0[1-9]|[12]\d|3[01])$/.test(row.date),
      'not an August 2026 date');
    assert(row.date > previous, 'duplicate or unsorted source dates');
    previous = row.date;
    assert(STATUS.has(row.sample_status), 'unknown agency status');
    assert(typeof row.source_retention_note === 'string'
      && row.source_retention_note.length <= 180, 'invalid retention note');

    if (row.sample_status === 'observed_unverified_regulations') {
      assert(Number.isInteger(row.anglers) && (row.anglers as number) > 0
        && (row.anglers as number) <= 5000, 'missing sampled angler effort');
      assert(Number.isInteger(row.boats) && (row.boats as number) > 0
        && (row.boats as number) <= 1500, 'invalid sampled boats');
      assert(Number.isInteger(row.chinook_kept) && (row.chinook_kept as number) >= 0
        && (row.chinook_kept as number) <= (row.anglers as number) * 2,
        'implausible Chinook retained count');
      const note = row.source_retention_note.toLowerCase();
      assert(note.includes('chinook') && !note.includes('release all chinook')
        && !note.includes('chinook retention closed'), 'retention not declared');
      eligible.push({
        date: row.date,
        boats: row.boats as number,
        anglers: row.anglers as number,
        chinook_kept: row.chinook_kept as number,
      });
    } else {
      assert(row.chinook_kept === null,
        'closure/missing/implausible day was turned into a zero');
      excluded++;
    }
  }
  const known = chinookRelease.historical_sample.rows;
  assert(eligible.length >= known.length, 'lost pinned historical sample');
  for (let i = 0; i < known.length; i++) {
    const first = eligible[i], reference = known[i];
    assert(first.date === reference.date
      && first.anglers === reference.anglers
      && first.boats === reference.boats
      && first.chinook_kept === reference.chinook_kept,
      'pinned WDFW August 2026 historical anchor changed');
  }
  // Only historical 2026 agency observations. All 2027 data is excluded even
  // if it appears in the merged WDFW candidate.
  return {
    source_sha256: data.source_html_sha256 as string,
    rows: eligible,
    excluded_days: excluded,
  };
}
