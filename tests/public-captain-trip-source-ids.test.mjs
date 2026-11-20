import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as catalog from '../lib/captain-fishing/catalog.mjs';

const code = ts.transpileModule(
  readFileSync(new URL('../lib/public-captain-trips.ts', import.meta.url), 'utf8'),
  {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}},
).outputText;

function loadClient(responses, requests) {
  const exports = {};
  runInNewContext(code, {
    exports,
    require(name) {
      assert.equal(name, './captain-fishing/catalog.mjs');
      return catalog;
    },
    async fetch(url, options) {
      assert.equal(url, '/api/guide-offerings');
      requests.push(JSON.parse(options.body));
      assert.ok(responses.length, 'Unexpected extra request');
      return {ok: true, json: async () => responses.shift()};
    },
  });
  return exports;
}

const offering = {
  id: 'p1', title: 'Estuary trip', jurisdiction: 'OR', waterway: 'Columbia River',
  launchArea: 'Astoria', species: ['Sturgeon'], months: [], methodIds: [], gearIds: [],
  vesselId: null, duration: 'half_day', bookingStyle: 'call_to_confirm',
};
const profile = sourceId => ({
  jurisdiction: 'OR', sourceId, publishedVersion: 1, attribution: 'captain_declared',
  vessels: [], offerings: [offering],
});
const suffixed = 'OG.0001225.F&F';
const unsuffixed = 'OG.0001225';

test('an Oregon source ID with an ampersand round-trips through the approved batch and cursor', async () => {
  const requests = [];
  const client = loadClient([
    {items: [profile(unsuffixed), profile(suffixed)], nextCursor: suffixed},
    {items: [profile('OG.0001399.DJFL')], nextCursor: null},
  ], requests);
  const trips = await client.fetchCaptainTripsForDirectory(new AbortController().signal);
  assert.deepEqual(Array.from(trips.keys()), [
    `OR:${unsuffixed}`, `OR:${suffixed}`, 'OR:OG.0001399.DJFL',
  ]);
  assert.equal(trips.get(`OR:${suffixed}`)[0].title, offering.title);
  assert.deepEqual(requests.map(request => request.afterSourceId), [null, suffixed]);
});

test('the public profile path preserves the exact suffix and rejects another registration', async () => {
  const requests = [];
  const client = loadClient([{profile: profile(suffixed)}, {profile: profile(unsuffixed)}], requests);
  const signal = new AbortController().signal;
  const source = {jurisdiction: 'OR', sourceId: suffixed};
  assert.equal((await client.fetchCaptainTripsForProfile(source, signal)).sourceId, suffixed);
  assert.deepEqual(requests[0], {operation: 'public_profile', ...source});
  await assert.rejects(client.fetchCaptainTripsForProfile(source, signal), /Mismatched public trip profile/);
});
