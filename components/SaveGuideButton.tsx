'use client';
import {useEffect, useState} from 'react';
import {readSavedGuides, SAVED_GUIDES_CHANGED, toggleSavedGuide} from '@/lib/saved-guides';

export default function SaveGuideButton({href, name}:{href:string;name:string}) {
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const sync = () => setSaved(readSavedGuides().includes(href));
    sync();
    window.addEventListener(SAVED_GUIDES_CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {window.removeEventListener(SAVED_GUIDES_CHANGED, sync); window.removeEventListener('storage', sync);};
  }, [href]);
  function toggle() {
    const result = toggleSavedGuide(href);
    setSaved(result.saved);
    setMessage(result.full ? 'Shortlist full (50 guides maximum).' : result.saved ? 'Saved to this browser.' : 'Removed from shortlist.');
  }
  return <span className="save-guide-control">
    <button type="button" className={saved ? 'save-guide-button saved' : 'save-guide-button'} onClick={toggle}
      aria-pressed={saved} aria-label={saved ? `Remove ${name} from saved guides` : `Save ${name} to shortlist`}>
      {saved ? '★ Saved' : '☆ Save'}
    </button>
    <span className="sr-only" role="status">{message}</span>
  </span>;
}
