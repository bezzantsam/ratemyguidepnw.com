import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const requireNode = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  vm.runInNewContext(js, {exports, URL, URLSearchParams, require: name => {
    if (name in dependencies) return dependencies[name];
    return requireNode(name);
  }});
  return exports;
}
const query = load('lib/directory-query.ts');
const url = load('lib/directory-url.ts', {'./directory-query': query});
const recovery = load('lib/directory-recovery.ts', {'./directory-query': query, './directory-url': url});
const {directoryRecoveryOptions: options} = recovery;
const defaults = url.DEFAULT_DIRECTORY_STATE;
const plain = value => JSON.parse(JSON.stringify(value));
const base = {business: 'Shared Business', areas: ['Coastal'], searchAliases: [], source: 'Oregon registry', href: '/guides/example'};
const rows = [
  {...base, id: 'OG.0000001', name: 'Alice Example', states: ['Oregon'], advertisedWaters: ['Columbia River'], advertisedSpecies: ['Salmon'], advertisedMethods: ['Fly fishing']},
  {...base, id: 'OG.0000002', name: 'Bob Example', states: ['Oregon'], advertisedWaters: ['Wilson River'], advertisedSpecies: ['Chinook Salmon'], advertisedMethods: ['Trolling']},
  {...base, id: 'wa-003', name: 'Alice Washington', states: ['Washington'], advertisedWaters: ['Columbia River'], advertisedSpecies: ['Salmon'], advertisedMethods: ['Trolling']},
];

test('recovery offers actual nonzero counts without mutating the active search or source entries', () => {
  const selection = {...defaults, state: 'Oregon', waterway: 'Wilson River', species: 'Salmon', page: 9};
  const before = JSON.stringify({selection, rows});
  const result = options(rows, selection);
  assert.deepEqual(Array.from(result, r => [r.key, r.count]), [['waterway', 1], ['species', 1], ['filters', 3]]);
  assert.equal(JSON.stringify({selection, rows}), before);
  for (const alternative of result) {
    assert.equal(alternative.selection.page, 1);
    assert.deepEqual(plain(url.parseDirectoryState(url.directoryUrl(alternative.selection).slice('/guides'.length), rows)), plain(alternative.selection));
  }
});

test('a single removed filter preserves every other choice, including exact species and query', () => {
  const selection = {...defaults, query: 'Bob Example', state: 'Oregon', species: 'Salmon', method: 'Trolling'};
  const result = options(rows, selection);
  const onlySpecies = result.find(r => r.key === 'species');
  assert.equal(onlySpecies.count, 1);
  assert.deepEqual(plain(onlySpecies.selection), {...selection, species: 'All species'});
  assert.ok(!result.some(r => r.key === 'method'), 'removing method cannot silently turn broad Salmon into Chinook');
  assert.ok(!result.some(r => r.key === 'query'), 'clearing text still leaves incompatible Oregon species and method');
});

test('both-state option retains the imported area, water and search text', () => {
  const selection = {...defaults, state: 'Washington', area: 'Coastal', waterway: 'Wilson River', query: 'Bob Example'};
  const result = options(rows, selection);
  assert.equal(result[0].key, 'state');
  assert.equal(result[0].count, 1);
  assert.deepEqual(plain(result[0].selection), {...selection, state: 'All'});
});

test('multiple conflicting filters can be removed together while preserving the search text', () => {
  const selection = {...defaults, query: 'Bob Example', state: 'Washington', waterway: 'Columbia River', species: 'Salmon'};
  const result = options(rows, selection);
  assert.ok(!result.some(r => ['state', 'waterway', 'species'].includes(r.key)));
  const all = result.find(r => r.key === 'filters');
  assert.equal(all.count, 1);
  assert.equal(all.label, 'Keep search text, remove all filters');
  assert.deepEqual(plain(all.selection), {...plain(defaults), query: 'Bob Example'});
});

test('registration searches never suggest a substituted identity or silently erase the identifier', () => {
  const selection = {...defaults, query: 'OG.9999999', state: 'Oregon', waterway: 'Columbia River'};
  const result = options(rows, selection);
  assert.deepEqual(Array.from(result, r => r.key), ['query']);
  assert.equal(result[0].label, 'Clear search text');
  assert.equal(result[0].count, 1);
  assert.equal(result[0].selection.state, 'Oregon');
  assert.equal(result[0].selection.waterway, 'Columbia River');
});

test('recovery is absent for valid results and empty data; equal businesses remain separate listings', () => {
  assert.equal(options(rows, defaults).length, 0);
  assert.equal(options([], {...defaults, query: 'Alice'}).length, 0);
  const result = options(rows, {...defaults, query: 'NoSuchPerson'});
  assert.equal(result.length, 1);
  assert.equal(result[0].count, 3);
});

test('removing the only active filter is not repeated as an all-filters suggestion', () => {
  const result = options(rows, {...defaults, method: 'Unsupported method'});
  assert.deepEqual(Array.from(result, r => r.key), ['method']);
  assert.equal(result[0].count, 3);
});

const EmptyState = load('components/DirectoryEmptyState.tsx', {
  '@/lib/directory-recovery': recovery, './DirectoryEmptyState.module.css': {},
}).default;
test('empty state renders explicit accessible changes with counts and honest coverage guidance', () => {
  const markup = renderToStaticMarkup(React.createElement(EmptyState, {
    entries: rows, selection: {...defaults, state: 'Oregon', species: 'Salmon', method: 'Trolling'},
    onChoose: () => assert.fail('rendering must never apply a recovery action'),
  }));
  assert.match(markup, /No matching guides\./);
  assert.match(markup, /missing results do not mean no guide offers that trip/);
  assert.match(markup, /aria-label="Ways to adjust your search"/);
  assert.match(markup, /Search both states/);
  assert.match(markup, /1 listing</);
  assert.doesNotMatch(markup, />0 listings|verified guide|No guides offer/);
});

test('empty directory renders a useful fallback with no false match counts', () => {
  const markup = renderToStaticMarkup(React.createElement(EmptyState, {
    entries: [], selection: {...defaults, query: '<script>alert(1)</script>'}, onChoose: () => {},
  }));
  assert.match(markup, /Try a different name or registration number/);
  assert.doesNotMatch(markup, /<button|<script|Ways to adjust/);
});
