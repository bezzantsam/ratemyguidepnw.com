'use client';

import Link from 'next/link';
import {useEffect, useMemo, useRef, useState} from 'react';
import SaveGuideButton from './SaveGuideButton';
import {readSavedGuides, subscribeSavedGuides} from '@/lib/saved-guides';

export default function SavedGuides({entries}: {entries: [href: string, name: string][]}) {
  const [paths, setPaths] = useState<string[] | null | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const byPath = useMemo(() => new Map(entries), [entries]);

  useEffect(() => {
    function sync() {
      setPaths(readSavedGuides());
    }
    sync();
    return subscribeSavedGuides(sync);
  }, []);

  function removed() {
    heading.current?.focus();
    setNotice('Guide removed from Saved guides.');
  }

  return <section className="saved-guide-list" aria-labelledby="saved-guide-heading">
    <h2 id="saved-guide-heading" tabIndex={-1} ref={heading}>Your shortlist</h2>
    {paths === undefined && <p role="status">Loading saved guides…</p>}
    {paths === null && <p role="status">Saved guides can’t be read. Allow site storage and reload this page to try again.</p>}
    {paths?.length === 0 && <p>No saved guides yet. <Link href="/guides">Find guides to save</Link>.</p>}
    <div role="status">{notice}</div>
    {!!paths?.length && <ul>{paths.map(href => {
      const name = byPath.get(href);
      return <li className="saved-guide-row" key={href}>
        <div>{name ? <Link href={href}>{name}</Link> : 'Listing no longer in the directory'}
          {name && <p>{href.startsWith('/washington/') ? 'Washington' : 'Oregon'} listing</p>}
        </div>
        <SaveGuideButton href={href} name={name ?? 'unavailable listing'} onRemove={removed}/>
      </li>;
    })}</ul>}
  </section>;
}
