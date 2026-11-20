'use client';

import {useState} from 'react';
import AuthPanel from './AuthPanel';
import useAccountSavedGuides from './useAccountSavedGuides';
import {MAX_SAVED_GUIDES, savedGuideKey, type SavedGuideIdentity} from '@/lib/saved-guides';

export default function SaveGuideButton({href, name, guide}: {
  href: string;
  name: string;
  guide: SavedGuideIdentity;
}) {
  const {account, items, pending, change, retry} = useAccountSavedGuides();
  const [signIn, setSignIn] = useState(false);
  const [notice, setNotice] = useState<{account: typeof account; text: string} | null>(null);
  const saved = items?.some(item => savedGuideKey(item) === savedGuideKey(guide)) ?? false;

  async function toggle() {
    if (!account) { setSignIn(value => !value); return; }
    const result = await change(saved ? 'remove' : 'save', [guide]);
    switch (result) {
      case 'saved': setNotice({account, text: 'Guide saved to your account.'}); break;
      case 'removed': setNotice({account, text: 'Guide removed from Saved guides.'}); break;
      case 'full': setNotice({account, text: `Your shortlist is full (${MAX_SAVED_GUIDES} guides maximum).`}); break;
      case 'unavailable': setNotice({account, text: 'Could not confirm the update. Reload Saved guides to check.'}); break;
    }
  }

  return <div className="save-guide-control">
    {account && items === null
      ? <button type="button" className="save-guide-button" onClick={retry}>Reload Saved guides</button>
      : <button type="button" className={saved ? 'save-guide-button saved' : 'save-guide-button'}
          onClick={() => void toggle()} disabled={account === undefined || !!account && (items === undefined || pending)}
          aria-expanded={account === null ? signIn : undefined}
          aria-pressed={account ? saved : undefined}
          aria-label={account === null ? `Sign in to save ${name}` : `Save guide: ${name}`}>
          {saved && <span aria-hidden="true">✓ </span>}
          {account === null ? 'Sign in to save' : 'Save guide'}
        </button>}
    {account === null && signIn && <AuthPanel profilePath={href} emailOnly/>}
    <div className="saved-guide-status" role="status">
      {account && items === null ? 'Saved guides are unavailable.' : notice && notice.account === account ? notice.text : ''}
    </div>
  </div>;
}
