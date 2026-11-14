import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname, extname} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';

const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  const path = resolve(file);
  if (cache.has(path)) return cache.get(path);
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
  const exports = {};
  cache.set(path, exports);
  const js = ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  vm.runInNewContext(js, {exports, require: name => {
    if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
    let dependency = name.startsWith('@/') ? resolve(name.slice(2)) : resolve(dirname(path), name);
    if (!extname(dependency)) dependency += existsSync(dependency + '.ts') ? '.ts' : '.tsx';
    return load(dependency);
  }}, {filename: path});
  return exports;
}

const {directoryEntries} = load('lib/directory.ts');
const {filterDirectoryEntries} = load('lib/directory-query.ts');
const {charterCrewFor, CHARTER_CREW_ASSIGNMENTS} = load('lib/charter-crew.ts');
const CrewPanel = load('components/CharterCrewPanel.tsx').default;
const Search = load('components/UnifiedSearch.tsx').default;
const filters = {state: 'All', sourceZone: 'All areas', advertisedWater: 'All advertised waters', query: ''};

test('Austin search resolves to Walt with a separate crew identity, never a captain alias', () => {
  const before = JSON.stringify(directoryEntries);
  const matches = filterDirectoryEntries(directoryEntries, {...filters, query: '  AUSTIN ROWE  '});
  assert.equal(matches.length, 1);
  const captain = matches[0];
  assert.equal(captain.id, 'OG.0003297');
  assert.equal(captain.name, 'Walter Rowe');
  assert.equal(captain.href, '/guides/og-0003297');
  assert.equal(captain.searchAliases.some(name => /austin/i.test(name)), false);
  assert.equal(captain.crew[0].personId, 'crew-austin-rowe');
  assert.equal(captain.crew[0].role, 'deckhand');
  assert.equal(directoryEntries.some(entry => entry.id === captain.crew[0].personId), false);
  assert.equal(JSON.stringify(directoryEntries), before);
  assert.equal(filterDirectoryEntries(directoryEntries, {...filters, query: 'Walt Rowe'})[0].id, captain.id);
});

test('crew search still respects state and advertised-water filters', () => {
  assert.equal(filterDirectoryEntries(directoryEntries, {...filters, query: 'Austin Rowe', state: 'Washington'}).length, 0);
  assert.equal(filterDirectoryEntries(directoryEntries, {...filters, query: 'Austin Rowe', advertisedWater: 'Buoy 10'}).length, 0);
  const legacy = {id: 'legacy', name: 'Old listing', business: null, states: ['Oregon'],
    areas: [], searchAliases: [], advertisedWaters: [], href: '/guides/legacy', source: 'test'};
  assert.equal(filterDirectoryEntries([legacy], {...filters, query: 'Austin'}).length, 0);
  assert.equal(filterDirectoryEntries([legacy], {...filters, query: 'Old listing'}).length, 1);
});

test('every crew assignment has a known captain, separate person ID and explicit evidence limits', () => {
  const keys = new Set();
  for (const assignment of CHARTER_CREW_ASSIGNMENTS) {
    assert.ok(directoryEntries.some(entry => entry.id === assignment.captainProfileId));
    assert.notEqual(assignment.personId, assignment.captainProfileId);
    const key = assignment.personId + ':' + assignment.captainProfileId;
    assert.equal(keys.has(key), false);
    keys.add(key);
    assert.equal(assignment.context, 'saltwater_charter');
    assert.equal(assignment.credentialStatus, 'unknown');
    assert.equal(assignment.evidence.basis, 'firsthand_founder_report');
    assert.match(assignment.evidence.reportedOn, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(charterCrewFor('unknown').length, 0);
  assert.equal(charterCrewFor('OG.0000410').length, 0);
});

test('rendered profile explains the deckhand role, optional feedback and unverified assignment', () => {
  const html = renderToStaticMarkup(CrewPanel({publicId: 'OG.0003297'}));
  assert.match(html, /Austin Rowe/);
  assert.match(html, /Deckhand/);
  assert.match(html, /trip participant/);
  assert.match(html, /credentials have not been independently checked/);
  assert.match(html, /Naming a crew member is optional/);
  assert.match(html, /do not receive a separate rating/);
  assert.match(html, /href="#reviews"/);
  assert.doesNotMatch(html, /<select|<input|<form|Verified Trip/);
  assert.equal(renderToStaticMarkup(CrewPanel({publicId: 'OG.0000410'})), '');
  assert.equal(renderToStaticMarkup(CrewPanel({publicId: 'unknown'})), '');
});

test('rendered search card distinguishes reported crew from captain aliases', () => {
  const matches = filterDirectoryEntries(directoryEntries, {...filters, query: 'Austin Rowe'});
  // Render through React so UnifiedSearch hooks execute normally.
  const html = renderToStaticMarkup(require('react').createElement(Search, {entries: matches}));
  assert.match(html, /Walter Rowe/);
  assert.match(html, /Reported crew: Austin Rowe \(deckhand\)/);
  assert.match(html, /current assignment unconfirmed/);
  assert.doesNotMatch(html, /Also listed publicly as:[^<]*Austin/);
  assert.match(html, /href="\/guides\/og-0003297"/);
});
