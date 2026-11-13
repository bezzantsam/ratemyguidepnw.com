import Link from 'next/link';

export default function About() {
  return (
    <main>
      <p className="eyebrow">OUR MISSION</p>
      <h1>Real trips. Real talk.</h1>
      <p className="lead">
        Independent fishing-guide experiences paired with transparent, source-backed Pacific Northwest fishing intel.
      </p>
      <h2>Beyond the catch count</h2>
      <p>
        Guide quality includes clear communication, safety, preparation, instruction, effort and fairness,
        not just whether the fishing was good on any particular day.
      </p>
      <h2>Independence</h2>
      <p>
        Guides cannot purchase better ratings or removal of legitimate negative experiences.
        Paid features will be labeled, and anonymous reviews are not inputs to our scientific models.
      </p>
      <h2>Chinook research</h2>
      <p>
        Our first research focus is Buoy 10 Chinook using official WDFW creel data and NOAA tides.
        The 2027 seven-day-ahead experimental forecast has not been independently scored yet.
        <Link href="/intel/buoy-10-chinook"> Explore the source-backed Chinook Intel preview.</Link>
      </p>
      <h2>Fairness and moderation</h2>
      <p>
        Reviews should reflect real firsthand experiences. We use account-based submissions,
        moderation and a captain response and dispute process as these features are rolled out.
        Public anonymity is not a promise of absolute anonymity.
      </p>
      <h2>Launch status</h2>
      <p>
        The directory uses real Oregon and Washington source listings, not fictional captain ratings.
        Registration information can become outdated and is not proof of current licensing.
        Public reviews, guide verification and commercial features are being rolled out separately.
      </p>
    </main>
  );
}
