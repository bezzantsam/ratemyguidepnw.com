import { directoryPageMetadata } from '@/lib/discoverability';

export const metadata = directoryPageMetadata('/about');

export default function About() {
  return <main>
    <h1>About</h1>
    <p className="lead">RateMyGuidePNW helps anglers find fishing guides, read reviews, and share their experiences. Our goal is to make choosing a fishing guide easier and more transparent.</p>
  </main>;
}
