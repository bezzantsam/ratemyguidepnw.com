/**
 * Pure, side-effect-free verification and math for the reviewed NOAA-tide vs
 * WDFW-Chinook comparison. No file system, environment or React access here so
 * every rule can be unit-tested (tests/chinook-tide-comparison.test.mjs).
 * Gating and file loading live in ./chinook-tide-comparison.ts.
 */
import { createHash } from 'node:crypto';

export const APPROVED_SOURCE = '451098ea97aa92f07a6682952a65d5ed37ed4a1be6da53ee8c45f66bfd229599';
export const APPROVED_ROWS = '3628b480ec9b7b5a1b71f127e9e9f85504330a72f7ca4c4c170c81a2073a764d';

type TideDay = {
  date: string; highest_predicted_high_mllw_ft: number;
  lowest_predicted_low_mllw_ft: number;
  calendar_day_high_low_spread_ft: number;
  high_events: number; low_events: number;
};
type TideEvent = { local_time: string; type: 'H' | 'L'; predicted_mllw_ft: number };
export type WdfwDay = { date: string; anglers: number; chinook_kept: number };
export type ChinookTidePoint = {
  date: string; sampledAnglers: number; chinookKept: number;
  retainedPerSampledAngler: number; astoriaPredictedHighLowSpreadFt: number;
};
export type ChinookTideComparisonData = {
  points: ChinookTidePoint[]; pearsonR: number; noaaRawSha: string;
  noaaNormalizedSha: string; wdfwRawSha: string; noaaSourceUrl: string;
};
export type ChartDomain = { lowX: number; highX: number; highY: number };

export function requireEvidence(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error('Unreviewed NOAA/Chinook comparison: ' + reason);
}

/** Matches Python json.dumps(sort_keys=True, separators=(',', ':')) for this reviewed dataset. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, val]) => JSON.stringify(key) + ':' + canonical(val)).join(',') + '}';
  }
  return JSON.stringify(value);
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function pearson(xs: number[], ys: number[]): number {
  requireEvidence(xs.length === ys.length && xs.length >= 3,
    'correlation needs at least three paired observations');
  const n = xs.length;
  const xbar = xs.reduce((s, v) => s + v, 0) / n;
  const ybar = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0, xx = 0, yy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i] - xbar;
    const y = ys[i] - ybar;
    cov += x * y; xx += x * x; yy += y * y;
  }
  requireEvidence(Number.isFinite(cov) && xx > 0 && yy > 0, 'no variation for correlation');
  return cov / Math.sqrt(xx * yy);
}

/**
 * Axis ranges that can never divide by zero or produce a negative-length tick
 * array, even for a degenerate (constant) series.
 */
export function chartDomain(points: ChinookTidePoint[]): ChartDomain {
  const spreads = points.map(p => p.astoriaPredictedHighLowSpreadFt).filter(Number.isFinite);
  const rates = points.map(p => p.retainedPerSampledAngler).filter(Number.isFinite);
  const minX = spreads.length ? Math.min(...spreads) : 0;
  const maxX = spreads.length ? Math.max(...spreads) : 1;
  const lowX = Math.floor(minX);
  const highX = Math.max(Math.ceil(maxX), lowX + 1);
  const maxY = rates.length ? Math.max(...rates) : 0;
  const highY = Math.max(Math.ceil(maxY * 10) / 10, 0.1);
  return { lowX, highX, highY };
}

/**
 * Verifies the committed NOAA artifact against its approved fingerprints and
 * pairs each August 2026 civil date with the reviewed WDFW sample.
 * Throws (Error) on any provenance or integrity failure.
 */
export function buildReviewedTideComparison(
  noaa: unknown, wdfwRows: WdfwDay[], wdfwSourceSha: string
): ChinookTideComparisonData {
  requireEvidence(noaa !== null && typeof noaa === 'object' && !Array.isArray(noaa),
    'NOAA release is not a JSON object');
  const data = noaa as Record<string, unknown>;
  requireEvidence(wdfwRows.length === 31, 'approved 2026 WDFW sampling not available');
  requireEvidence(data.schema_version === 1 &&
      data.station_id === '9439040' && data.station_name === 'Astoria, Oregon' &&
      data.station_is_buoy_10 === false &&
      data.source === 'NOAA CO-OPS astronomical tide predictions',
      'NOAA station/source identity changed');
  requireEvidence(data.source_sha256 === APPROVED_SOURCE &&
      data.observations_sha256 === APPROVED_ROWS,
      'NOAA evidence hash changed since review');
  const review = data.review as Record<string, unknown> | undefined;
  requireEvidence(data.publication_status === 'reviewed_historical_2026_tides_only' &&
      data.approved_for_public_display === true &&
      data.approved_for_model_evaluation === false &&
      review?.decision === 'approved_for_descriptive_august_2026_comparison_only',
      'not approved for historical public display');
  requireEvidence(data.time_zone === 'lst_ldt' && data.datum === 'MLLW' &&
      data.units === 'feet' && typeof data.source_url === 'string',
      'tide time zone, datum or units mismatch');
  const api = new URL(data.source_url as string);
  requireEvidence(api.origin === 'https://api.tidesandcurrents.noaa.gov' &&
      api.pathname === '/api/prod/datagetter',
      'untrusted NOAA API source URL');
  const fields = {
    station: '9439040', product: 'predictions', begin_date: '20260801',
    end_date: '20260831', interval: 'hilo', time_zone: 'lst_ldt',
    units: 'english', datum: 'MLLW', format: 'json'
  };
  requireEvidence(Object.entries(fields).every(([key, val]) =>
      api.searchParams.get(key) === val), 'changed NOAA API request parameters');
  requireEvidence(Array.isArray(data.daily) && data.daily.length === 31 &&
      Array.isArray(data.events) && data.events.length === 120,
      'missing August tidal predictions');
  requireEvidence(digest({ daily: data.daily, events: data.events }) === APPROVED_ROWS,
      'NOAA daily/events data was altered after audit');
  const daily = data.daily as TideDay[];
  const events = data.events as TideEvent[];
  const byDay = new Map<string, TideEvent[]>();
  for (const event of events) {
    requireEvidence(/^2026-08-(0[1-9]|[12]\d|3[01]) \d\d:\d\d$/.test(event.local_time) &&
      (event.type === 'H' || event.type === 'L') &&
      Number.isFinite(event.predicted_mllw_ft),
      'bad NOAA high/low event');
    const day = event.local_time.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }
  const catchByDate = new Map(wdfwRows.map(row => [row.date, row]));
  const points = daily.map((d, i): ChinookTidePoint => {
    const day = '2026-08-' + String(i + 1).padStart(2, '0');
    requireEvidence(d.date === day, 'unexpected tide date order');
    const eventsOnDay = byDay.get(day) ?? [];
    const high = eventsOnDay.filter(e => e.type === 'H').map(e => e.predicted_mllw_ft);
    const low = eventsOnDay.filter(e => e.type === 'L').map(e => e.predicted_mllw_ft);
    requireEvidence(high.length >= 1 && low.length >= 1 &&
      high.length === d.high_events && low.length === d.low_events,
      'missing high/low prediction');
    const spread = Math.max(...high) - Math.min(...low);
    requireEvidence(spread > 0 && spread < 20 &&
      Math.abs(spread - d.calendar_day_high_low_spread_ft) < 0.0011,
      'reviewed tide spread differs from original events');
    const creel = catchByDate.get(day);
    requireEvidence(creel && Number.isInteger(creel.anglers) && creel.anglers > 0 &&
      Number.isInteger(creel.chinook_kept) && creel.chinook_kept >= 0,
      'matching sampled Chinook catch missing');
    return {
      date: day,
      sampledAnglers: creel.anglers,
      chinookKept: creel.chinook_kept,
      retainedPerSampledAngler: creel.chinook_kept / creel.anglers,
      astoriaPredictedHighLowSpreadFt: d.calendar_day_high_low_spread_ft
    };
  });
  return {
    points,
    pearsonR: pearson(
      points.map(p => p.astoriaPredictedHighLowSpreadFt),
      points.map(p => p.retainedPerSampledAngler)),
    noaaRawSha: APPROVED_SOURCE, noaaNormalizedSha: APPROVED_ROWS,
    wdfwRawSha: wdfwSourceSha, noaaSourceUrl: data.source_url as string,
  };
}
