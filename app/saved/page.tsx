import type {Metadata} from 'next';
import SavedGuides from '@/components/SavedGuides';
import {guideSlug, oregonGuides} from '@/lib/registry';
import {washingtonGuides} from '@/lib/washington';

export const metadata: Metadata = {title: 'Saved guides | Rate Your Guide', robots: {index: false, follow: false}};

export default function SavedPage() {
  const entries: [string, string][] = [
    ...oregonGuides.map((guide): [string, string] => [`/guides/${guideSlug(guide)}`, guide.name]),
    ...washingtonGuides.map((guide): [string, string] => [`/washington/${guide.id}`, guide.name]),
  ];

  return <main>
    <h1>Saved guides</h1>
    <p className="lead">Keep a shortlist of fishing guides in this browser. No account required.</p>
    <p>Anyone using this browser can see your shortlist. Clearing site storage removes it.</p>
    <SavedGuides entries={entries}/>
  </main>;
}
