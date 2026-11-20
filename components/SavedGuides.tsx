'use client';

import Link from 'next/link';
import {useEffect, useMemo, useRef, useState} from 'react';
import AuthPanel from './AuthPanel';
import useAccountSavedGuides from './useAccountSavedGuides';
import {
  deviceGuidesForImport, MAX_SAVED_GUIDES, readSavedGuides, savedGuideKey, subscribeSavedGuides,
  type SavedGuideEntry, type SavedGuideIdentity,
} from '@/lib/saved-guides';

export default function SavedGuides({entries}: {entries: SavedGuideEntry[]}) {
  const {account, items, pending, change, retry} = useAccountSavedGuides();
  const [devicePaths, setDevicePaths] = useState<string[]>([]);
  const [previewAccount, setPreviewAccount] = useState<typeof account>(null);
  const [notice, setNotice] = useState<{account: typeof account; text: string} | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const byPath = useMemo(() => new Map(entries.map(entry => [entry.href, entry])), [entries]);
  const byGuide = useMemo(() => new Map(entries.map(entry => [savedGuideKey(entry.guide), entry])), [entries]);

  useEffect(() => {
    if (!account) return;
    const sync = () => setDevicePaths(readSavedGuides() ?? []);
    sync();
    return subscribeSavedGuides(sync);
  }, [account]);

  const copyable = items && account ? deviceGuidesForImport(devicePaths, byPath).filter(entry =>
    !items.some(item => savedGuideKey(item) === savedGuideKey(entry.guide))) : [];
  const preview = account && previewAccount === account;

  async function remove(guide: SavedGuideIdentity) {
    const result = await change('remove', [guide]);
    if (result === 'removed') {
      heading.current?.focus();
      setNotice({account, text: 'Guide removed from Saved guides.'});
    } else if (result === 'unavailable') {
      setNotice({account, text: 'Could not confirm removal. Reload Saved guides to check.'});
    }
  }

  async function importDeviceGuides() {
    const result = await change('import', copyable.map(entry => entry.guide));
    if (result === 'imported') {
      setPreviewAccount(null);
      setNotice({account, text: 'Device saves copied to this account.'});
    } else if (result === 'full') {
      setNotice({account, text: `All of these guides won’t fit. Your shortlist holds up to ${MAX_SAVED_GUIDES} guides.`});
    } else if (result === 'unavailable') {
      setNotice({account, text: 'Could not confirm the copy. Your device saves are still here.'});
    }
  }

  return <section className="saved-guide-list" aria-labelledby="saved-guide-heading">
    <h2 id="saved-guide-heading" tabIndex={-1} ref={heading}>Your shortlist</h2>
    {account !== undefined && <AuthPanel key={account?.id ?? 'signed-out'} emailOnly/>}
    {account === null && <p>Sign in to see your shortlist.</p>}
    {(account === undefined || account && items === undefined) && <p role="status">Loading saved guides…</p>}
    {account && items === null && <>
      <p role="status">Saved guides can’t be read right now.</p>
      <button type="button" onClick={retry}>Retry</button>
    </>}
    {account && items?.length === 0 && <p>No saved guides yet. <Link href="/guides">Find guides to save</Link>.</p>}
    <div role="status">{notice && notice.account === account ? notice.text : ''}</div>
    {!!items?.length && <ul>{items.map(guide => {
      const key = savedGuideKey(guide);
      const entry = byGuide.get(key);
      return <li className="saved-guide-row" key={key}>
        <div>{entry ? <Link href={entry.href}>{entry.name}</Link> : 'Listing no longer in the directory'}
          <p>{guide.jurisdiction === 'WA' ? 'Washington' : 'Oregon'} listing</p>
        </div>
        <button type="button" className="save-guide-button" disabled={pending}
          onClick={() => void remove(guide)} aria-label={`Remove ${entry?.name ?? 'unavailable listing'}`}>Remove</button>
      </li>;
    })}</ul>}
    {copyable.length > 0 && (preview ? <section aria-label="Guides saved on this device">
      <p>Anyone using this browser could have saved these guides. Copy them only if you want them in this account.</p>
      <ul>{copyable.map(entry => <li key={savedGuideKey(entry.guide)}>{entry.name}</li>)}</ul>
      <button type="button" onClick={() => void importDeviceGuides()} disabled={pending}>Copy to this account</button>
      <button type="button" onClick={() => setPreviewAccount(null)} disabled={pending}>Cancel</button>
    </section> : <button type="button" onClick={() => setPreviewAccount(account)}>Review device saves</button>)}
  </section>;
}
