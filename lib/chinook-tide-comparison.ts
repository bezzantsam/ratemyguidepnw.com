import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { reviewed2026ChinookHistory } from './chinook-reviewed-history';

const APPROVED_SOURCE = '451098ea97aa92f07a6682952a65d5ed37ed4a1be6da53ee8c45f66bfd229599';
const APPROVED_ROWS = '3628b480ec9b7b5a1b71f127e9e9f85504330a72f7ca4c4c170c81a2073a764d';

type TideDay = {
  date: string; highest_predicted_high_mllw_ft: number;
  lowest_predicted_low_mllw_ft: number;
  calendar_day_high_low_spread_ft: number;
  high_events: number; low_events: number;
};
type TideEvent = { local_time: string; type: 'H' | 'L'; predicted_mllw_ft: number };
export type ChinookTidePoint = {
  date: string; sampledAnglers: number; chinookKept: number;
  retainedPerSampledAngler: number; astoriaPredictedHighLowSpreadFt: number;
};
export type ChinookTideComparisonData = {
  points: ChinookTidePoint[]; pearsonR: number; noaaRawSha: string;
  noaaNormalizedSha: string; wdfwRawSha: string; noaaSourceUrl: string;
};

function requireEvidence(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error('Unreviewed NOAA/Chinook comparison: ' + reason);
}

/** Matches Python json.dumps(sort_keys=True, separators=(',', ':')) for this reviewed dataset. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, val]) => JSON.stringify(key) + ':' + canonical(val)).join(',') + '}';
  }
  return JSON.stringify(value);
}
function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
function correlation(points: ChinookTidePoint[]): number {
  const n = points.length;
  const xbar = points.reduce((s, p) => s + p.astoriaPredictedHighLowSpreadFt, 0) / n;
  const ybar = points.reduce((s, p) => s + p.retainedPerSampledAngler, 0) / n;
  let cov = 0, xx = 0, yy = 0;
  for (const p of points) {
    const x = p.astoriaPredictedHighLowSpreadFt - xbar;
    const y = p.retainedPerSampledAngler - ybar;
    cov += x * y; xx += x * x; yy += y * y;
  }
  requireEvidence(xx > 0 && yy > 0, 'no variation for correlation');
  return cov / Math.sqrt(xx * yy);
}

export function reviewedChinookTideComparison(): ChinookTideComparisonData | null {
  if (process.env.VERCEL_ENV !== 'production' ||
      process.env.VERCEL_GIT_COMMIT_REF !== 'main') return null;
  const wdfw = reviewed2026ChinookHistory();
  requireEvidence(wdfw && wdfw.rows.length === 31,
    'approved 2026 WDFW sampling not available');
  const raw = readFileSync(
    path.join(process.cwd(), 'data', 'noaa-astoria-2026-reviewed.json'), 'utf8'
  );
  const data = JSON.parse(raw) as Record<string, unknown>;
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
  const catchByDate = new Map(wdfw.rows.map(row => [row.date, row]));
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
    requireEvidence(creel && creel.anglers > 0 && creel.chinook_kept >= 0,
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
    points, pearsonR: correlation(points),
    noaaRawSha: APPROVED_SOURCE, noaaNormalizedSha: APPROVED_ROWS,
    wdfwRawSha: wdfw.source_sha256, noaaSourceUrl: data.source_url as string,
  };
}
