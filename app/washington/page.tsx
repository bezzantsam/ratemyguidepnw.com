import Link from 'next/link';
import WashingtonSearch from '@/components/WashingtonSearch';
import {washingtonGuides,oregonWashingtonMatches} from '@/lib/washington';
import { directoryPageMetadata } from '@/lib/discoverability';

export const metadata = directoryPageMetadata('/washington');

export default function Page(){return <main>
 <p className="eyebrow">WASHINGTON FISHING GUIDE DIRECTORY</p>
 <h1>Washington captains.</h1>
 <p className="lead">{washingtonGuides.length} Washington source listings. Source records do not verify current licensing or establish identity across states.</p>
 <WashingtonSearch guides={washingtonGuides}/>
 {oregonWashingtonMatches.length>0&&<section className="section"><h2>Reviewed cross-state links</h2><div className="grid">{oregonWashingtonMatches.map(c=><Link className="card" key={c.oregonRegistration} href={`/guides/${c.oregonRegistration.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`}><h3>{c.name}</h3><p>{c.source.business}</p><p>Oregon + Washington source listings →</p></Link>)}</div></section>}
 </main>}
