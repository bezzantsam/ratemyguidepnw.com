import type { Metadata } from 'next';
import './chinook-intel.css';
import Link from 'next/link';
import {
  ArrowRight, ArrowUpRight, ChartNoAxesCombined, CheckCircle2,
  ClipboardList, Compass, Fish, LockKeyhole, ShieldCheck, Waves,
} from 'lucide-react';
import UnifiedSearch from '@/components/UnifiedSearch';
import { directoryEntries } from '@/lib/directory';
import { chinookRelease } from '@/lib/chinook-intel';

export const metadata: Metadata = {
  title: 'Buoy 10 Chinook Intel | RateMyGuidePNW × Chrome-AI',
  description:
    'Independent Buoy 10 Chinook research and fishing-guide experiences. Official WDFW creel data and NOAA tides, without paid rankings or invented ratings.',
};

const lowerColumbiaGuides = directoryEntries.filter(
  guide => guide.states.includes('Oregon') &&
    guide.areas.some(area => area.toLocaleLowerCase('en-US') === 'lower columbia river')
);

export default function Buoy10ChinookIntel() {
  const release = chinookRelease;

  return (
    <main className="intel-page">
      <div className="intel-breadcrumb">
        <Link href="/">RateMyGuidePNW</Link><span aria-hidden="true">/</span>
        <span>Chinook Intel</span>
      </div>

      <section className="intel-hero" aria-labelledby="intel-heading">
        <div className="intel-hero-content">
          <p className="intel-kicker"><Fish size={17} aria-hidden="true" /> THE INDEPENDENT FISHING INTEL PROJECT</p>
          <h1 id="intel-heading">Know the conditions.<br /><em>Know the captain.</em></h1>
          <p className="intel-hero-description">
            Official Buoy 10 Chinook evidence meets honest, independent fishing-guide experiences.
            No dockside hype masquerading as data. No pay-to-win guide ratings.
          </p>
          <div className="intel-hero-actions">
            <a className="intel-button intel-button-primary" href="#official-evidence">
              Explore Chinook research <ArrowRight size={17} aria-hidden="true" />
            </a>
            <a className="intel-button intel-button-outline" href="#guide-directory">
              Find Lower Columbia guides <Compass size={17} aria-hidden="true" />
            </a>
          </div>
        </div>
        <aside className="intel-hero-aside" aria-label="Research release status">
          <div className="intel-aside-heading">
            <span className="intel-label">CHROME-AI / V1</span>
            <span className="intel-stage">Research preview</span>
          </div>
          <div className="intel-horizon"><span>07</span><div><strong>Day forecast horizon</strong><small>Prospective test: August 2027</small></div></div>
          <div className="intel-aside-rule" />
          <div className="intel-aside-meta"><span>FISHERY</span><strong>Columbia estuary · Buoy 10</strong></div>
          <div className="intel-aside-meta"><span>SPECIES</span><strong>Chinook salmon only</strong></div>
          <div className="intel-aside-meta"><span>PUBLIC ACCURACY CLAIMS</span><strong>Not yet validated</strong></div>
          <p className="intel-aside-note"><LockKeyhole size={15} aria-hidden="true" /> Private model outputs are not published here.</p>
        </aside>
      </section>

      <section className="intel-principle" aria-label="Why these two kinds of information are separate">
        <span className="intel-label">TWO KINDS OF TRUTH</span>
        <div className="intel-principle-grid">
          <div>
            <div className="intel-identity"><span className="intel-identity-icon"><ChartNoAxesCombined size={20} /></span><span>01 / Official evidence</span></div>
            <h2>What the fishery data actually shows.</h2>
            <p>Government creel sampling, effort denominators, source dates and tide predictions. Measured catch rates are not advertisements or a promise you&apos;ll catch a fish.</p>
          </div>
          <div>
            <div className="intel-identity"><span className="intel-identity-icon"><ShieldCheck size={20} /></span><span>02 / Angler experience</span></div>
            <h2>What it was like to fish with a guide.</h2>
            <p>Firsthand, publicly anonymous reviews with moderation and fair captain responses. Guide relationships and paid placements must never alter the scientific data.</p>
          </div>
        </div>
      </section>

      <section className="intel-evidence" id="official-evidence" aria-labelledby="intel-evidence-heading">
        <div className="intel-section-top">
          <div>
            <p className="intel-label">01 / OFFICIAL EVIDENCE</p>
            <h2 id="intel-evidence-heading">Chinook, without the noise.</h2>
          </div>
          <span className="intel-research-marker">Methodology-only release · {release.released_on}</span>
        </div>
        <p className="intel-section-intro">
          Chrome-AI studies <strong>{release.target}</strong>. That is retained Chinook divided by
          sampled anglers on valid WDFW observation days. Missing days, zero sampling, and
          retention closures cannot silently become zero-catch days.
        </p>
        <div className="intel-number-grid">
          <article className="intel-number-card">
            <span className="intel-label">HISTORICAL MODEL PERIOD</span>
            <strong>2014–2026</strong>
            <p>Historical August WDFW observations used in the research model.</p>
          </article>
          <article className="intel-number-card">
            <span className="intel-label">REGISTERED TEST</span>
            <strong>7 days</strong>
            <p>Predictions will be evaluated against later-published official outcomes.</p>
          </article>
          <article className="intel-number-card">
            <span className="intel-label">VERIFIED 2027 RESULTS</span>
            <strong>Pending</strong>
            <p>No independently validated 2027 forecast accuracy is available yet.</p>
          </article>
        </div>
        <div className="intel-sources">
          <div className="intel-sources-heading"><Waves size={21} aria-hidden="true" /><div><h3>Check the primary sources</h3><p>Original agency records, not screenshots or anonymous catch reports.</p></div></div>
          <div className="intel-source-list">
            <a href={release.source_links.wdfw_creel} target="_blank" rel="noopener noreferrer">
              <div><strong>WDFW Buoy 10 creel reports</strong><span>Sampled effort, retained Chinook and report notes</span></div>
              <ArrowUpRight size={20} aria-hidden="true" />
            </a>
            <a href={release.source_links.noaa_astoria_tides} target="_blank" rel="noopener noreferrer">
              <div><strong>NOAA Astoria tide predictions</strong><span>Astronomical predictions, not a measured bite forecast</span></div>
              <ArrowUpRight size={20} aria-hidden="true" />
            </a>
          </div>
        </div>
        <div className="intel-status-line" role="status">
          <ClipboardList size={19} aria-hidden="true" />
          <span><strong>Publication gate is closed.</strong> This page deliberately contains no private model predictions or unapproved accuracy scores. The official WDFW results must be independently checked after publication.</span>
        </div>
      </section>

      <section className="intel-guide" id="guide-directory" aria-labelledby="intel-guide-heading">
        <div className="intel-section-top">
          <div>
            <p className="intel-label">02 / REAL-WORLD EXPERIENCES</p>
            <h2 id="intel-guide-heading">Choose a guide. Not a hype machine.</h2>
          </div>
          <Link href="/reviews" className="intel-text-link">Explore Dock Talk <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </div>
        <p className="intel-section-intro">
          Search actual Oregon guide-registry listings that include <strong>Lower Columbia River</strong> as a
          registered service area. That broad listing is <em>not</em> proof a guide fishes Buoy 10,
          targets Chinook, holds a current license, or has earned customer recommendations.
        </p>
        <div className="intel-directory-heading">
          <CheckCircle2 size={18} aria-hidden="true" />
          <strong>{lowerColumbiaGuides.length.toLocaleString('en-US')} directory listings include Lower Columbia River</strong>
          <span>Registration-source data · not verified Buoy 10 specialists</span>
        </div>
        <UnifiedSearch entries={lowerColumbiaGuides} />
        <p className="intel-directory-note">
          Directory presence cannot be purchased into a higher rating. Public guide reviews are
          separate from the WDFW statistics; identifiable reviewer accounts and private evidence
          must not enter the Chrome-AI dataset.
        </p>
      </section>

      <section className="intel-standards" aria-labelledby="standards-heading">
        <div className="intel-section-top"><div><p className="intel-label">HOW WE KEEP THIS HONEST</p><h2 id="standards-heading">Built for independent intel.</h2></div></div>
        <div className="intel-standard-grid">
          <article><span>01</span><h3>Sources over stories</h3><p>Every official-data claim needs traceable government source material and a date.</p></article>
          <article><span>02</span><h3>Privacy with accountability</h3><p>Reviews are anonymous to the public, but submissions require identity and moderation safeguards.</p></article>
          <article><span>03</span><h3>Advertising stays advertising</h3><p>Paid guide features will be labeled; payment cannot buy favorable ratings or alter scientific evidence.</p></article>
          <article><span>04</span><h3>Uncertainty stays visible</h3><p>Incomplete sampling, closures, missing observations and unverified model performance are clearly marked.</p></article>
        </div>
      </section>

      <section className="intel-next-step" aria-labelledby="next-step-heading">
        <div>
          <p className="intel-label">INDEPENDENT BY DESIGN</p>
          <h2 id="next-step-heading">Better intel begins with asking better questions.</h2>
          <p>Find a guide, read real experiences when published, and compare the hype with what official fishing observations actually support.</p>
        </div>
        <Link href="/guides" className="intel-button intel-button-primary">Browse the directory <ArrowRight size={18} /></Link>
      </section>
      <p className="intel-final-note">
        Research disclosure: Chrome-AI&apos;s frozen Ridge model and seven-day prospective evaluation are
        experimental. This page is not a real-time regulatory notice, a legal retention recommendation,
        a guide endorsement, or a guarantee of catching Chinook.
      </p>
    </main>
  );
}
