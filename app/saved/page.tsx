import Link from 'next/link';
import type {Metadata} from 'next';
import SavedGuides from '@/components/SavedGuides';
import {directoryEntries} from '@/lib/directory';

export const metadata:Metadata={title:'Saved fishing guides | RateMyGuidePNW',robots:{index:false,follow:false}};
export default function SavedPage(){
  return <main><p className="eyebrow">YOUR PRIVATE BROWSER SHORTLIST</p><h1>Saved guides</h1>
    <p className="lead">Keep captains you want to compare in one place. No account required.</p>
    <p className="muted">Saved guides stay only in this browser on this device. Clearing browser storage removes them. Other people using this browser may see your shortlist; it is not an account-backed private vault.</p>
    <SavedGuides entries={directoryEntries}/><p className="muted" style={{marginTop:20}}>Directory records are historical source listings, not current license checks or endorsements. <Link href="/guides/verification">How verification works</Link>.</p>
  </main>;
}
