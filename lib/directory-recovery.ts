import type {DirectoryEntry} from './directory';
import {filterDirectoryEntries} from './directory-query';
import {DEFAULT_DIRECTORY_STATE, directoryUrl, type DirectoryState} from './directory-url';

type RecoveryKey = 'state' | 'area' | 'waterway' | 'species' | 'method' | 'gear' | 'month' | 'query' | 'filters';
export type DirectoryRecovery = {
  key: RecoveryKey;
  label: string;
  count: number;
  selection: DirectoryState;
};

function countMatches(entries: DirectoryEntry[], value: DirectoryState): number {
  return filterDirectoryEntries(entries, {
    query: value.query, state: value.state, sourceZone: value.area,
    advertisedWater: value.waterway, species: value.species, method: value.method, gear: value.gear, month: value.month,
  }).length;
}

/** Offer explicit alternatives; never broaden the active search automatically. */
export function directoryRecoveryOptions(entries: DirectoryEntry[], selection: DirectoryState): DirectoryRecovery[] {
  if (countMatches(entries, selection) > 0) return [];

  const candidates: {key: RecoveryKey; label: string; patch: Partial<DirectoryState>}[] = [];
  if (selection.state !== 'All') candidates.push({key: 'state', label: 'Search both states', patch: {state: 'All'}});
  if (selection.area !== 'All areas') candidates.push({key: 'area', label: 'Remove imported area filter', patch: {area: 'All areas'}});
  if (selection.waterway !== 'All advertised waters') candidates.push({key: 'waterway', label: 'Remove water filter', patch: {waterway: 'All advertised waters'}});
  if (selection.species !== 'All species') candidates.push({key: 'species', label: 'Remove species filter', patch: {species: 'All species'}});
  if (selection.method !== 'All methods') candidates.push({key: 'method', label: 'Remove fishing method filter', patch: {method: 'All methods'}});

  if (selection.gear) candidates.push({key: 'gear', label: 'Remove gear filter', patch: {gear: undefined}});
  if (selection.month) candidates.push({key: 'month', label: 'Remove month filter', patch: {month: undefined}});

  // If multiple filters conflict, preserve the person's search text as a fallback.
  if (candidates.length > 1) candidates.push({
    key: 'filters', label: selection.query.trim() ? 'Keep search text, remove all filters' : 'Remove all filters',
    patch: {...DEFAULT_DIRECTORY_STATE, query: selection.query, gear: undefined, month: undefined},
  });
  if (selection.query.trim()) candidates.push({key: 'query', label: 'Clear search text', patch: {query: ''}});

  const seen = new Set<string>();
  const options: DirectoryRecovery[] = [];
  for (const candidate of candidates) {
    const next = {...selection, ...candidate.patch, page: 1};
    const url = directoryUrl(next);
    if (seen.has(url)) continue;
    seen.add(url);
    const count = countMatches(entries, next);
    if (count > 0) options.push({key: candidate.key, label: candidate.label, count, selection: next});
  }
  return options;
}
