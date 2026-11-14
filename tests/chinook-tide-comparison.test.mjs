import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const noaaText = readFileSync('data/noaa-astoria-2026-reviewed.json', 'utf8');
const noaa = JSON.parse(noaaText);
const wdfwArtifact = JSON.parse(readFileSync('data/chinook-2026-reviewed.json', 'utf8'));
const wdfwRows = wdfwArtifact.seasons[0].rows.map(
  ({ date, anglers, chinook_kept }) => ({ date, anglers, chinook_kept }));
const wdfwSha = wdfwArtifact.source_html_sha256;

const clone = value => JSON.parse(JSON.stringify(value));
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function load(file, requires, env = {}, logs = []) {
  const exports = {};
  const sandbox = {
    exports, module: { exports },
    process: { cwd: () => process.cwd(), env },
    console: { error: (...args) => logs.push(args.join(' ')), log() {} },
    URL,
    require: name => {
      if (name in requires) return requires[name];
      throw new Error('Unexpected imported module: ' + name);
    },
  };
  vm.runInNewContext(compile(file), sandbox, { timeout: 4000 });
  return sandbox.module.exports;
}
const core = load('lib/chinook-tide-core.ts', { 'node:crypto': crypto });
const build = (data = noaa, rows = wdfwRows) => core.buildReviewedTideComparison(data, rows, wdfwSha);

// ---------------------------------------------------------------- hashing
test('canonical JSON + SHA-256 matches Python json.dumps(sort_keys, compact) on a fixture', () => {
  const fixture = { b: [1.5, -0.731, { z: 'q', a: null, t: true }], a: [], c: 'x"y', d: { k: 0.25 } };
  // Value generated with Python: sha256(json.dumps(fx, sort_keys=True, separators=(',', ':')))
  assert.equal(core.digest(fixture),
    '85d620e40c4a721b8d37c2b072f481496085d8c8b5906e4384d758163b43b566');
  assert.equal(core.canonical(fixture), '{"a":[],"b":[1.5,-0.731,{"a":null,"t":true,"z":"q"}],"c":"x\\"y","d":{"k":0.25}}');
});

test('committed NOAA artifact reproduces its approved normalized-row and identity fingerprints', () => {
  assert.equal(core.digest({ daily: noaa.daily, events: noaa.events }), core.APPROVED_ROWS);
  assert.equal(noaa.observations_sha256, core.APPROVED_ROWS);
  assert.equal(noaa.source_sha256, core.APPROVED_SOURCE);
});

test('hash canonicalization hazards are absent from the reviewed NOAA artifact', () => {
  // JS cannot distinguish 8.0 from 8 after JSON.parse (Python emits "8.0"); any
  // integer-valued float or non-ASCII character would silently break parity.
  assert.equal(/\d\.0+\s*[,}\]\n]/.test(noaaText), false, 'integer-valued float found');
  assert.equal(/[^\x00-\x7f]/.test(noaaText), false, 'non-ASCII character found');
});

// ---------------------------------------------------------------- pairing + r
test('pairs all 31 August 2026 civil dates, each tide day with the same WDFW day', () => {
  const result = build();
  assert.equal(result.points.length, 31);
  result.points.forEach((point, i) => {
    const day = '2026-08-' + String(i + 1).padStart(2, '0');
    const creel = wdfwRows.find(row => row.date === day);
    assert.equal(point.date, day);
    assert.equal(point.sampledAnglers, creel.anglers);
    assert.equal(point.chinookKept, creel.chinook_kept);
    assert.equal(point.retainedPerSampledAngler, creel.chinook_kept / creel.anglers);
    assert.equal(point.astoriaPredictedHighLowSpreadFt, noaa.daily[i].calendar_day_high_low_spread_ft);
  });
  assert.equal(result.points.reduce((s, p) => s + p.sampledAnglers, 0), 5087);
  assert.equal(result.points.reduce((s, p) => s + p.chinookKept, 0), 1373);
});

test('daily spread equals max predicted high minus min predicted low over the same local date', () => {
  for (const day of noaa.daily) {
    const ev = noaa.events.filter(e => e.local_time.startsWith(day.date));
    const hi = Math.max(...ev.filter(e => e.type === 'H').map(e => e.predicted_mllw_ft));
    const lo = Math.min(...ev.filter(e => e.type === 'L').map(e => e.predicted_mllw_ft));
    assert.ok(Math.abs(hi - lo - day.calendar_day_high_low_spread_ft) < 0.0011, day.date);
  }
});

test('Pearson r equals the independently computed Python value (-0.16833692...)', () => {
  assert.ok(Math.abs(build().pearsonR - (-0.1683369235284231)) < 1e-9);
});

test('pearson() is correct on hand-checkable inputs and rejects degenerate input', () => {
  assert.ok(Math.abs(core.pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-12);
  assert.ok(Math.abs(core.pearson([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-12);
  // x=[1,2,3,4,5], y=[2,1,4,3,5]: cov=8, sxx=10, syy=10 -> r=0.8
  assert.ok(Math.abs(core.pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]) - 0.8) < 1e-12);
  assert.throws(() => core.pearson([1, 1, 1], [1, 2, 3]), /no variation/);
  assert.throws(() => core.pearson([1, 2], [1, 2]), /at least three/);
  assert.throws(() => core.pearson([1, 2, 3], [1, 2]), /at least three/);
  assert.throws(() => core.pearson([1, 2, NaN], [1, 2, 3]), /no variation/);
});

// ---------------------------------------------------------------- invalid / missing data
test('an edited tide prediction, dropped event or reordered day fails closed', () => {
  const edited = clone(noaa); edited.events[10].predicted_mllw_ft += 0.001;
  assert.throws(() => build(edited), /altered after audit/);
  const dropped = clone(noaa); dropped.events.pop();
  assert.throws(() => build(dropped), /missing August tidal predictions/);
  const reordered = clone(noaa); reordered.daily.reverse();
  assert.throws(() => build(reordered), /altered after audit/);
});

test('changed station, datum, time zone, API host or parameters fail closed', () => {
  for (const [mutate, reason] of [
    [d => { d.station_id = '9439041'; }, /identity changed/],
    [d => { d.datum = 'MSL'; }, /time zone, datum or units/],
    [d => { d.time_zone = 'gmt'; }, /time zone, datum or units/],
    [d => { d.station_is_buoy_10 = true; }, /identity changed/],
    [d => { d.source_url = d.source_url.replace('api.tidesandcurrents.noaa.gov', 'example.com'); }, /untrusted NOAA API/],
    [d => { d.source_url = d.source_url.replace('time_zone=lst_ldt', 'time_zone=gmt'); }, /changed NOAA API request/],
    [d => { d.approved_for_public_display = false; }, /not approved/],
    [d => { d.approved_for_model_evaluation = true; }, /not approved/],
    [d => { d.observations_sha256 = 'f'.repeat(64); }, /hash changed/],
  ]) {
    const d = clone(noaa); mutate(d);
    assert.throws(() => build(d), reason);
  }
  assert.throws(() => build(null), /not a JSON object/);
  assert.throws(() => build([]), /not a JSON object/);
});

test('a missing, closed (null) or zero-effort WDFW day is never turned into a zero', () => {
  const missing = wdfwRows.filter(row => row.date !== '2026-08-17');
  assert.throws(() => build(noaa, missing), /WDFW sampling not available/);
  const gap = wdfwRows.map(row => row.date === '2026-08-17' ? { ...row, date: '2026-09-17' } : row);
  assert.throws(() => build(noaa, gap), /matching sampled Chinook catch missing/);
  const noEffort = wdfwRows.map(row => row.date === '2026-08-05' ? { ...row, anglers: 0 } : row);
  assert.throws(() => build(noaa, noEffort), /matching sampled Chinook catch missing/);
  const nullCatch = wdfwRows.map(row => row.date === '2026-08-05' ? { ...row, chinook_kept: null } : row);
  assert.throws(() => build(noaa, nullCatch), /matching sampled Chinook catch missing/); // null >= 0 is true in JS and would become a fabricated 0
});

// ---------------------------------------------------------------- chart axis guards
test('chartDomain never yields a zero-width or negative axis', () => {
  const pt = (x, y) => ({ astoriaPredictedHighLowSpreadFt: x, retainedPerSampledAngler: y });
  const real = core.chartDomain(build().points);
  assert.ok(real.highX > real.lowX && real.highY > 0);
  assert.deepEqual(Object.assign({}, core.chartDomain([pt(7, 0.2), pt(7, 0.3)])), { lowX: 7, highX: 8, highY: 0.3 });
  assert.equal(core.chartDomain([pt(7.5, 0), pt(7.9, 0)]).highY, 0.1);
  assert.equal(core.chartDomain([pt(8, 0.2)]).highX, 9);
  const empty = core.chartDomain([]);
  assert.ok(empty.highX > empty.lowX && empty.highY > 0);
  const bad = core.chartDomain([pt(NaN, NaN)]);
  assert.ok(Number.isFinite(bad.lowX) && Number.isFinite(bad.highY));
});

// ---------------------------------------------------------------- gate + graceful degradation
function loader(env, { history, fileText = noaaText } = {}) {
  const logs = []; let reads = 0;
  const gate = load('lib/chinook-reviewed-history.ts', {
    'server-only': {}, 'node:fs': { readFileSync: () => { throw new Error('unused'); } },
    'node:crypto': crypto, 'node:path': path,
    './chinook-intel': { chinookRelease: { historical_sample: { rows: [] } } },
  }, env);
  const mod = load('lib/chinook-tide-comparison.ts', {
    'server-only': {}, 'node:path': path,
    'node:fs': { readFileSync: () => { reads++; return fileText; } },
    './chinook-tide-core': core,
    './chinook-reviewed-history': {
      isReviewedReleaseVisible: gate.isReviewedReleaseVisible,
      reviewed2026ChinookHistory: () => history === undefined
        ? { rows: wdfwRows, source_sha256: wdfwSha, excluded_days: 0 } : history,
    },
  }, env, logs);
  return { run: mod.reviewedChinookTideComparison, logs, reads: () => reads, gate };
}

test('production main renders; production of another branch, previews and local builds do not', () => {
  assert.equal(loader({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' }).run().points.length, 31);
  for (const env of [
    { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'bot/noaa-astoria-2026-review' },
    { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'feature/x', INTEL_SHOW_REVIEWED_RELEASE: '1' },
    { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature/x' },
    { VERCEL_ENV: 'development' }, {},
  ]) {
    const l = loader(env);
    assert.equal(l.run(), null);
    assert.equal(l.reads(), 0, 'artifact must not be read while gated');
  }
});

test('INTEL_SHOW_REVIEWED_RELEASE=1 lets previews and local dev QA the reviewed artifact only', () => {
  for (const env of [
    { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature/reviewed-noaa-chinook-scatter', INTEL_SHOW_REVIEWED_RELEASE: '1' },
    { VERCEL_ENV: 'development', INTEL_SHOW_REVIEWED_RELEASE: '1' },
    { INTEL_SHOW_REVIEWED_RELEASE: '1' },
  ]) assert.equal(loader(env).run().points.length, 31);
  assert.equal(loader({ VERCEL_ENV: 'preview', INTEL_SHOW_REVIEWED_RELEASE: 'true' }).run(), null);
});

test('provenance failures withhold the panel and log instead of throwing (no page-wide 500)', () => {
  const env = { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' };
  const tampered = clone(noaa); tampered.events[3].predicted_mllw_ft = 99;
  let l = loader(env, { fileText: JSON.stringify(tampered) });
  assert.equal(l.run(), null);
  assert.match(l.logs.join('\n'), /comparison withheld: .*altered after audit/);
  l = loader(env, { fileText: '{not json' });
  assert.equal(l.run(), null);
  assert.equal(l.logs.length, 1);
  l = loader(env, { history: null });
  assert.equal(l.run(), null);
});
