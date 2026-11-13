import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, BookOpen, Database, FlaskConical, LockKeyhole, ShieldCheck } from 'lucide-react';
import release from '@/lib/chinook-public-release.json';
import reviewedHistory from '@/data/chinook-2026-reviewed.json';
import './methodology.css';

export const metadata: Metadata = {
  title: 'How We Know | Chinook Intel Methodology | RateMyGuidePNW',
  description: 'Follow the sources behind Buoy 10 Chinook research: WDFW creel samples, NOAA tides, preliminary data checks, and transparent forecast validation.',
};

const rows = reviewedHistory.seasons[0].rows;
const totalKept = rows.reduce((sum, row) => sum + row.chinook_kept, 0);
const totalSampled = rows.reduce((sum, row) => sum + row.anglers, 0);
const pooledRatio = totalKept / totalSampled;

const statements = [
  {
    title: 'What we measure',
    body: 'Retained Chinook divided by the anglers sampled in official WDFW creel observations. This is a fish-per-sampled-angler rate, not an individual angler’s probability of success.',
  },
  {
    title: 'What we exclude',
    body: 'Days without valid sampling or with unverified Chinook retention rules must not be treated as zero-catch days. Neither paid guide listings nor anonymous reviews count as scientific observations.',
  },
  {
    title: 'What we have not proven',
    body: 'A seven-day-ahead Chinook forecast has not yet been prospectively evaluated against the August 2027 official results. Historical fit does not establish future forecasting accuracy.',
  },
];

export default function ChinookMethodology() {
  return (
    <main className="methodology-page">
      <nav className="methodology-breadcrumb" aria-label="Breadcrumb">
        <Link href="/intel/buoy-10-chinook"><ArrowLeft size={16} aria-hidden="true" /> Chinook Intel</Link>
        <span aria-hidden="true">/</span><span>How We Know</span>
      </nav>

      <section className="methodology-heading">
        <p className="methodology-eyebrow"><BookOpen size={16} aria-hidden="true" /> DATA TRANSPARENCY</p>
        <h1>Show the evidence.<br/><em>Explain the limits.</em></h1>
        <p>When you see a Chinook number on RateMyGuidePNW, you should be able to tell who measured it, what it means, and what we still do not know.</p>
      </section>

      <section className="methodology-number" aria-labelledby="method-example">
        <div>
          <p className="methodology-eyebrow">2026 EXAMPLE · OFFICIAL WDFW CREEL SAMPLE</p>
          <h2 id="method-example">Here's how a real catch-rate number works.</h2>
          <div className="methodology-equation" aria-label={String(totalKept) + ' retained Chinook divided by ' + String(totalSampled) + ' sampled anglers equals ' + pooledRatio.toFixed(3) + ' retained Chinook per sampled angler'}>
            <div><strong>{totalKept.toLocaleString('en-US')}</strong><span>Chinook retained</span></div>
            <span className="methodology-operator" aria-hidden="true">÷</span>
            <div><strong>{totalSampled.toLocaleString('en-US')}</strong><span>Anglers sampled</span></div>
            <span className="methodology-operator" aria-hidden="true">=</span>
            <div className="methodology-result"><strong>{pooledRatio.toFixed(3)}</strong><span>Chinook per sampled angler</span></div>
          </div>
        </div>
        <p className="methodology-caveat">
          This combines <strong>{rows.length} August 2026 observation dates</strong> from the preliminary WDFW Buoy 10 creel report.
          It does <strong>not</strong> mean {Math.round(pooledRatio * 100)}% of individual anglers caught a fish,
          and it is not the harvest total for the whole fishery.
        </p>
      </section>

      <section className="methodology-section" aria-labelledby="measurement-title">
        <p className="methodology-eyebrow">WHAT WE DO AND DO NOT CLAIM</p>
        <h2 id="measurement-title">Every metric needs a definition.</h2>
        <div className="methodology-card-grid">
          {statements.map((item, index) => (
            <article className="methodology-card" key={item.title}>
              <span className="methodology-step">0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="methodology-section" aria-labelledby="source-title">
        <p className="methodology-eyebrow">CHECK FOR YOURSELF</p>
        <h2 id="source-title">Original sources. Separate evidence.</h2>
        <div className="methodology-source-list">
          <a href={release.source_links.wdfw_creel} target="_blank" rel="noopener noreferrer">
            <Database size={23} aria-hidden="true"/>
            <span><strong>Washington Department of Fish & Wildlife</strong><small>Buoy 10 creel sampling, preliminary catch and angler effort</small></span>
            <ArrowUpRight size={20} aria-hidden="true"/>
          </a>
          <a href={release.source_links.noaa_astoria_tides} target="_blank" rel="noopener noreferrer">
            <Database size={23} aria-hidden="true"/>
            <span><strong>NOAA CO-OPS · Astoria Station 9439040</strong><small>Astronomical tide predictions, not direct Buoy 10 currents or recorded fish bites</small></span>
            <ArrowUpRight size={20} aria-hidden="true"/>
          </a>
          <a href={reviewedHistory.review.emergency_regulation_url} target="_blank" rel="noopener noreferrer">
            <ShieldCheck size={23} aria-hidden="true"/>
            <span><strong>Washington August 2026 emergency regulation</strong><small>Historical retention-rule context; always check current rules separately</small></span>
            <ArrowUpRight size={20} aria-hidden="true"/>
          </a>
        </div>
        <p className="methodology-source-caption">The 2026 WDFW example was cross-checked against the archived original agency response. Audit date: {reviewedHistory.review.reviewed_at_utc}. These data are preliminary and subject to revision.</p>
      </section>

      <section className="methodology-section" aria-labelledby="pipeline-title">
        <p className="methodology-eyebrow">HOW THE PIPELINE WORKS</p>
        <h2 id="pipeline-title">From agency report to a visible number.</h2>
        <div className="methodology-flow">
          <div><Database size={22} aria-hidden="true"/><strong>Official source</strong><span>WDFW report or NOAA prediction</span></div>
          <span className="methodology-flow-arrow" aria-hidden="true">→</span>
          <div><ShieldCheck size={22} aria-hidden="true"/><strong>Integrity checks</strong><span>Source hashes, dates, units and sampling rules</span></div>
          <span className="methodology-flow-arrow" aria-hidden="true">→</span>
          <div><BookOpen size={22} aria-hidden="true"/><strong>Reviewed release</strong><span>Only approved, clearly described public data</span></div>
        </div>
        <p className="methodology-source-caption">Newly retrieved observations enter a separate review queue. A new source capture does not automatically authorize a claim on this website.</p>
      </section>

      <section className="methodology-model" aria-labelledby="forecast-title">
        <div><FlaskConical size={26} aria-hidden="true"/><span className="methodology-eyebrow">CHROME-AI · EXPERIMENTAL FORECASTING</span></div>
        <h2 id="forecast-title">Research is not a promise.</h2>
        <p>Chrome-AI uses a frozen research model and plans to test predictions made <strong>{release.prospective_evaluation.predeclared_horizon_days} days ahead</strong> during {release.prospective_evaluation.season}. No verified prospective performance or official 2027 outcomes have been released.</p>
        <p className="methodology-model-status"><LockKeyhole size={17} aria-hidden="true"/> Public accuracy claims: <strong>not yet validated</strong></p>
      </section>

      <p className="methodology-footer-note">Fishing-guide experiences are a different kind of evidence. Publicly anonymous reviews may describe communication, preparation or safety; they are not WDFW catch samples, and paid guide placements must not influence scientific results.</p>
      <Link className="methodology-back" href="/intel/buoy-10-chinook"><ArrowLeft size={17} aria-hidden="true"/> Back to Chinook Intel</Link>
    </main>
  );
}
