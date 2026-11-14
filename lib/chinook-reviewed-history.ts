import 'server-only';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const APPROVED_HTML_SHA = 'ef43d5b525a57af1efda3e856d7a77fea08c83ac1e452b208c9daf1cf4199562';
const APPROVED_2026_SAMPLE_SHA = '3a8d445222e82f64515558cbc640cbd7aec10d7193725aa92a643645ef769672';
const STATUS = new Set([
  'observed_unverified_regulations',
  'retention_closed_or_unverified',
  'not_sampled',
  'implausible_needs_review',
]);

function assert(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error('Unapproved WDFW history: ' + reason);
}

/** Match the sorted compact canonical JSON used by the original Python watcher. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, val]) => JSON.stringify(key) + ':' + canonical(val)).join(',') + '}';
  }
  return JSON.stringify(value);
}
function hashObservations(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

/**
 * The source bot's unreviewed candidate file is NEVER read by this component.
 * Only the separate 2026 historical release, independently source-audited and
 * explicitly committed on the production branch, may be rendered. Previews and
 * local builds continue to use the original pinned five-day example, unless a
 * reviewer deliberately sets INTEL_SHOW_REVIEWED_RELEASE=1 (Vercel *Preview*
 * scope or a local shell) to QA the already-reviewed, SHA-pinned artifacts.
 * The flag can never enable anything on a production deployment of another
 * branch, and it does not widen which files are read.
 */
export function isReviewedReleaseVisible(): boolean {
  if (process.env.VERCEL_ENV === 'production') {
    return process.env.VERCEL_GIT_COMMIT_REF === 'main';
  }
  return process.env.INTEL_SHOW_REVIEWED_RELEASE === '1';
}

export function reviewed2026ChinookHistory(): ReviewedHistory | null {
  if (!isReviewedReleaseVisible()) return null;
  const candidatePath = path.join(process.cwd(), 'data', 'chinook-2026-reviewed.json');
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
  assert(data.publication_status === 'reviewed_historical_2026_only', 'unexpected source status');
  assert(data.approved_for_model_training === false &&
    data.approved_for_prospective_forecast_scoring === false,
    'private research approval gate unexpectedly changed');
  const review = data.review as Record<string, unknown> | undefined;
  assert(review?.decision === 'approved_for_descriptive_2026_history_only',
    'no documented descriptive-data release review');
  assert(data.model_prediction_values_included === false, 'private predictions detected');
  assert(data.official_sample_regulations_verified === false,
    'do not make agency-regulation certification claims');
  assert(data.site_automatically_publishes_candidate === false,
    'unexpected source publication policy');
  assert(data.source_html_sha256 === APPROVED_HTML_SHA,
    'source HTML does not match the audited official WDFW snapshot');
  assert(data.observations_sha256 === APPROVED_2026_SAMPLE_SHA,
    'normalized source hash was not reviewed');
  assert(Array.isArray(data.seasons) && data.seasons.length === 1,
    'never include future seasons in a public historical release');
  const seasons = data.seasons as Array<Record<string, unknown>>;
  assert(seasons[0].year === 2026, 'historical release must be 2026 only');
  assert(hashObservations(seasons) === APPROVED_2026_SAMPLE_SHA,
    'released observations were altered after source audit');
  const history = seasons[0];
  assert(Array.isArray(history.rows) && history.rows.length === 31,
    'full reviewed August 2026 sample is missing or oversized');
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
    const augustDay = Number(row.date.slice(-2));
    const expectedRetention = augustDay <= 9
      ? 'Chinook and hatchery coho' : 'Hatchery Chinook and hatchery coho';
    assert(row.source_retention_note === expectedRetention,
      'retention label differs from approved agency schedule');

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
  // Approved historical 2026 agency observations only. The bot's review queue
  // and any 2027 official reports or private forecasts are separate files.
  return {
    source_sha256: data.source_html_sha256 as string,
    rows: eligible,
    excluded_days: excluded,
  };
}
