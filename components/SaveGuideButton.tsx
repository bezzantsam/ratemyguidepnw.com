'use client';

import {useEffect, useState} from 'react';
import {MAX_SAVED_GUIDES, readSavedGuides, subscribeSavedGuides, toggleSavedGuide} from '@/lib/saved-guides';

export default function SaveGuideButton({href, name, onRemove}: {
  href: string;
  name: string;
  onRemove?: () => void;
}) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    function sync() {
      setSaved(readSavedGuides()?.includes(href) ?? false);
    }
    sync();
    return subscribeSavedGuides(sync);
  }, [href]);

  function toggle() {
    switch (toggleSavedGuide(href)) {
      case 'saved': setMessage('Guide saved in this browser.'); break;
      case 'removed':
        setMessage('Guide removed from Saved guides.');
        onRemove?.();
        break;
      case 'full': setMessage(`Your shortlist is full (${MAX_SAVED_GUIDES} guides maximum).`); break;
      case 'unavailable': setMessage('Could not update Saved guides. Check that this browser allows site storage.'); break;
    }
  }

  return <div className="save-guide-control">
    <button type="button" className={saved ? 'save-guide-button saved' : 'save-guide-button'}
      onClick={toggle} disabled={saved === null} aria-pressed={onRemove ? undefined : saved ?? false}
      aria-label={onRemove ? `Remove ${name}` : `Save guide: ${name}`}>
      {!onRemove && saved && <span aria-hidden="true">✓ </span>}
      {onRemove ? 'Remove' : 'Save guide'}
    </button>
    <div className="saved-guide-status" role="status">{message}</div>
  </div>;
}
