import type {Metadata} from 'next';
import SavedGuides from '@/components/SavedGuides';
import {guideSlug, oregonGuides} from '@/lib/registry';
import {washingtonGuides} from '@/lib/washington';
import type {SavedGuideEntry} from '@/lib/saved-guides';

export const metadata: Metadata = {title: 'Saved guides | Rate Your Guide', robots: {index: false, follow: false}};

export default function SavedPage() {
  const entries: SavedGuideEntry[] = [
    ...oregonGuides.map((guide): SavedGuideEntry => ({
      guide:{jurisdiction:'OR',sourceId:guide.registration}, href:`/guides/${guideSlug(guide)}`, name:guide.preferredName ?? guide.name,
    })),
    ...washingtonGuides.map((guide): SavedGuideEntry => ({
      guide:{jurisdiction:'WA',sourceId:guide.id}, href:`/washington/${guide.id}`, name:guide.name,
    })),
  ];

  return <main>
    <h1>Saved guides</h1>
    <p className="lead">Your private shortlist follows your account across devices.</p>
    <SavedGuides entries={entries}/>
  </main>;
}
