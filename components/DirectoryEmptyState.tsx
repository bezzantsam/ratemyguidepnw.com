'use client';

import {useMemo} from 'react';
import type {DirectoryEntry} from '@/lib/directory';
import type {DirectoryState} from '@/lib/directory-url';
import {directoryRecoveryOptions} from '@/lib/directory-recovery';
import styles from './DirectoryEmptyState.module.css';

export default function DirectoryEmptyState({entries, selection, onChoose}: {
  entries: DirectoryEntry[];
  selection: DirectoryState;
  onChoose: (selection: DirectoryState) => void;
}) {
  const options = useMemo(() => directoryRecoveryOptions(entries, selection), [entries, selection]);
  return <div className={styles.panel}>
    <h3>No matching guides.</h3>
    <p>Your search and filters are still applied. Our source-linked fishing information is incomplete, so missing results do not mean no guide offers that trip.</p>
    {options.length > 0 ? <>
      <p>Choose a change to see matching listings:</p>
      <ul className={styles.options} aria-label="Ways to adjust your search">
        {options.map(option => <li key={option.key}>
          <button type="button" onClick={() => onChoose(option.selection)}>
            <span>{option.label}</span>
            <span className={styles.count}>{option.count.toLocaleString()} {option.count === 1 ? 'listing' : 'listings'}</span>
          </button>
        </li>)}
      </ul>
    </> : <p>Try a different name or registration number, or clear all filters above.</p>}
  </div>;
}
