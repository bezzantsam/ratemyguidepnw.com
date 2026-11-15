import Link from 'next/link';
import {directoryEntries} from '@/lib/directory';
import {relatedOutfitterGroup} from '@/lib/guide-identity';

/**
 * A shared outfitter label NEVER merges people, reviews, account claims or IDs.
 * Only the two or more known imported public captain profiles are linked.
 */
export default function RelatedOutfitterCaptains({publicId}:{publicId:string}){
  const group=relatedOutfitterGroup(publicId);
  if(!group)return null;
  const otherCaptains=group.profileIds
    .filter(id=>id!==publicId)
    .map(id=>directoryEntries.find(entry=>entry.id===id))
    .filter(entry=>entry!==undefined);

  if(otherCaptains.length===0)return null;
  return <section className="section card" aria-label="Other captains listed under this outfitter">
    <p className="eyebrow">SHARED OUTFITTER NAME · SEPARATE CAPTAIN PROFILES</p>
    <h2>Other captains listed with {group.displayName}</h2>
    <p className="muted">Public sources associate these listings with the same outfitter name. This does not establish shared ownership, an active license, a current working arrangement, or that these are the same person. Ratings and captain claims stay separate.</p>
    <ul>
      {otherCaptains.map(captain=><li key={captain.id}>
        <Link href={captain.href}>{captain.name}</Link>
        {captain.business&&<span className="muted"> · {captain.business}</span>}
      </li>)}
    </ul>
    {group.sourceUrl&&<p className="muted">Outfitter roster source: <a href={group.sourceUrl} target="_blank" rel="noopener noreferrer">{group.displayName}</a></p>}
  </section>;
}
