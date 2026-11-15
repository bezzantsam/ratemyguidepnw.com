'use client';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import type {DirectoryEntry} from '@/lib/directory';
import SaveGuideButton from './SaveGuideButton';
import {readSavedGuides, SAVED_GUIDES_CHANGED} from '@/lib/saved-guides';

export default function SavedGuides({entries}:{entries:DirectoryEntry[]}) {
  const [paths,setPaths]=useState<string[]|null>(null);
  useEffect(() => {
    const sync=()=>setPaths(readSavedGuides());
    sync();
    window.addEventListener(SAVED_GUIDES_CHANGED,sync);
    window.addEventListener('storage',sync);
    return ()=>{window.removeEventListener(SAVED_GUIDES_CHANGED,sync);window.removeEventListener('storage',sync);};
  },[]);
  const byPath=new Map(entries.map(entry=>[entry.href,entry]));
  const saved=(paths||[]).map(href=>byPath.get(href)).filter((entry):entry is DirectoryEntry=>!!entry);
  return <section className="directory-panel" aria-label="Saved captain shortlist">
    <h2>Your saved captains</h2>
    {paths===null?<p className="empty-results" role="status">Loading your browser shortlist…</p>:
      saved.length===0?<div className="empty-results"><p>No saved guides in this browser yet.</p><Link href="/guides">Find guides to save</Link></div>:
      <div className="guide-results">{saved.map(entry=><div className="saved-guide-row" key={entry.href}>
        <Link className="guide-result" href={entry.href}>
          <div className="guide-result-body"><h3>{entry.name}</h3><p className="outfit-name">{entry.business||'Fishing guide'}</p>
            <p className="guide-meta">{entry.states.join(' + ')} · {entry.areas.slice(0,2).join(' · ')||'Regional listing'}</p>
            <p className="guide-submeta">Imported source listing · Credentials not live-verified</p>
          </div>
        </Link><SaveGuideButton href={entry.href} name={entry.name}/>
      </div>)}</div>}
  </section>;
}
