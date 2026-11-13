import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const release = JSON.parse(readFileSync('lib/chinook-public-release.json', 'utf8'));
const source = readFileSync('lib/chinook-reviewed-history.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

function runGate(data, {environment='production', branch='main'}={}) {
  let reads = 0;
  const exports = {};
  const sandbox = {
    exports,
    module: {exports},
    process: {
      cwd: () => '/tmp/ratemyguidepnw',
      env: {
        VERCEL_ENV: environment,
        VERCEL_GIT_COMMIT_REF: branch,
      },
    },
    require: name => {
      if (name === 'server-only') return {};
      if (name === './chinook-intel') return {chinookRelease: release};
      if (name === 'node:path') return path;
      if (name === 'node:fs') return {
        readFileSync: () => {
          reads++;
          if (data === undefined) {
            const err = new Error('ENOENT');
            err.code = 'ENOENT';
            throw err;
          }
          return JSON.stringify(data);
        },
      };
      throw new Error('Unexpected module: ' + name);
    },
  };
  vm.runInNewContext(compiled, sandbox, {timeout:2000});
  const result = sandbox.module.exports.reviewed2026ChinookHistory();
  return {result, reads};
}

function candidate({sixth, future=false}={}) {
  const rows = release.historical_sample.rows.map(row => ({
    ...row,
    sample_status: 'observed_unverified_regulations',
    source_retention_note: 'Chinook and hatchery coho',
  }));
  if (sixth) rows.push(sixth);
  const seasons = [{year:2026, observed_days:rows.length, rows}];
  if (future) seasons.push({
    year:2027, observed_days:1, rows:[{
      date:'2027-08-01', anglers:44, boats:22, chinook_kept:14,
      sample_status:'observed_unverified_regulations',
      source_retention_note:'Chinook and hatchery coho',
    }],
  });
  return {
    schema_version:1,
    species:'Chinook',
    source_url:'https://wdfw.wa.gov/fishing/reports/creel/buoy10',
    source_html_sha256:'f'.repeat(64),
    observations_sha256:'a'.repeat(64),
    publication_status:'candidate_review_only',
    model_prediction_values_included:false,
    official_sample_regulations_verified:false,
    site_automatically_publishes_candidate:false,
    seasons,
  };
}

test('unmerged preview data is never read or rendered', () => {
  const data = candidate({sixth:{
    date:'2026-08-06', anglers:78, boats:28, chinook_kept:39,
    sample_status:'observed_unverified_regulations',
    source_retention_note:'Chinook and hatchery coho'
  }});
  for (const mode of [
    {environment:'preview',branch:'bot/wdfw-chinook-review'},
    {environment:'production',branch:'bot/wdfw-chinook-review'},
    {environment:'development',branch:'main'},
  ]) {
    const {result,reads} = runGate(data,mode);
    assert.equal(result,null);
    assert.equal(reads,0);
  }
});

test('production main renders only a validated 2026 historical row, not 2027', () => {
  const data = candidate({
    sixth:{
      date:'2026-08-06', anglers:78, boats:28, chinook_kept:39,
      sample_status:'observed_unverified_regulations',
      source_retention_note:'Chinook and hatchery coho',
    },
    future:true,
  });
  const {result,reads} = runGate(data);
  assert.equal(reads,1);
  assert.equal(result.rows.length,6);
  assert.equal(result.rows[5].chinook_kept,39);
  assert.equal(result.rows.filter(r=>r.date.startsWith('2027')).length,0);
  assert.equal(result.excluded_days,0);
});

test('an actual sampled zero survives; a closed day never becomes a zero', () => {
  const zero = candidate({sixth:{
    date:'2026-08-06', anglers:78, boats:28, chinook_kept:0,
    sample_status:'observed_unverified_regulations',
    source_retention_note:'Chinook and hatchery coho'
  }});
  assert.equal(runGate(zero).result.rows[5].chinook_kept,0);
  const closed = candidate({sixth:{
    date:'2026-08-06', anglers:78, boats:28, chinook_kept:null,
    sample_status:'retention_closed_or_unverified',
    source_retention_note:'Hatchery coho'
  }});
  const result = runGate(closed).result;
  assert.equal(result.rows.length,5);
  assert.equal(result.excluded_days,1);
});

test('missing merged candidate keeps existing pinned five-day example', () => {
  assert.equal(runGate(undefined).result, null);
});

test('tampered first five official WDFW numbers fail closed', () => {
  const data = candidate();
  data.seasons[0].rows[0].chinook_kept = 900;
  assert.throws(() => runGate(data), /Unapproved WDFW history/);
});

test('wrong source, future model predictions and unrecognized rows fail closed', () => {
  const data = candidate();
  data.source_url='https://fake.example.com';
  assert.throws(() => runGate(data), /official WDFW source/);
  const changed = candidate();
  changed.model_prediction_values_included=true;
  assert.throws(() => runGate(changed), /private predictions/);
  const invalid = candidate({sixth:{
    date:'2026-08-06', anglers:78, boats:28, chinook_kept:0,
    sample_status:'retention_closed_or_unverified',
    source_retention_note:'Hatchery coho',
  }});
  assert.throws(() => runGate(invalid), /turned into a zero/);
});
