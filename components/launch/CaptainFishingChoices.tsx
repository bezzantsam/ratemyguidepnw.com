'use client';

import {useState} from 'react';
import {fishingOptions} from '@/lib/captain-fishing/catalog.mjs';
const commonIds = new Set(['trolling','jigging','fly-fishing','mooching','bottom-fishing','drift-fishing',
  'electric-fishing-reels','downriggers','manual-pot-pullers','electric-pot-pullers','crab-pots','spinning-tackle']);

export function FishingChoices({kind, ids, disabled, onToggle}: {
  kind: 'method' | 'gear'; ids: readonly string[]; disabled: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const label = kind === 'method' ? 'Fishing methods' : 'Gear';
  const options = fishingOptions.filter(option => option.kind === kind);
  const query = search.trim().toLowerCase().replace(/^mixed\s+/, '');
  const visible = options.filter(option => query
    ? [option.label, ...option.aliases].some(text => text.toLowerCase().includes(query)) ||
      (option.id==='bottom-fishing'&&['bottom fish','groundfish','ground fish'].includes(query))
    : expanded || commonIds.has(option.id) || ids.includes(option.id));

  return <fieldset disabled={disabled}>
    <legend>{label}</legend>
    <details>
      <summary>{ids.length ? `${ids.length} selected` : `Choose ${label.toLowerCase()}`}</summary>
      <div>
        <label>Find {label.toLowerCase()}<input type="search" value={search}
          onChange={event => setSearch(event.target.value)}/></label>
        {visible.map(option =>
          <label key={option.id}><input type="checkbox" checked={ids.includes(option.id)}
            onChange={event => onToggle(option.id, event.target.checked)}/>{option.label}</label>
        )}
        {visible.length === 0 && <p>No matching options.</p>}
        {!query && <button type="button" onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Show common options' : `Show all ${options.length} options`}
        </button>}
      </div>
    </details>
  </fieldset>;
}
