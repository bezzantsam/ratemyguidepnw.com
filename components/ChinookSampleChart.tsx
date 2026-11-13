import { chinookRelease } from '@/lib/chinook-intel';

export default function ChinookSampleChart() {
  const { historical_sample: sample } = chinookRelease;
  const rows = sample.rows.map(row => ({
    ...row,
    retainedPerAngler: row.chinook_kept / row.anglers,
  }));
  const max = Math.max(...rows.map(row => row.retainedPerAngler));
  const totalAnglers = rows.reduce((sum, row) => sum + row.anglers, 0);
  const totalChinook = rows.reduce((sum, row) => sum + row.chinook_kept, 0);

  return (
    <section className="intel-sample" aria-labelledby="chinook-observed-title">
      <div className="intel-sample-heading">
        <div>
          <p className="intel-label">REAL PUBLIC OBSERVATIONS · AUGUST 2026</p>
          <h3 id="chinook-observed-title">What the first five sampled days looked like</h3>
          <p>
            WDFW preliminary creel observations, {sample.rows[0].date} to {sample.rows[rows.length - 1].date}.
            Each bar represents retained Chinook divided by sampled anglers, not a probability of success.
          </p>
        </div>
        <span className="intel-sample-badge">Agency data · preliminary</span>
      </div>
      <div className="intel-observed-table-scroll">
        <table className="intel-observed-table">
          <caption>Original WDFW Buoy 10 counts and computed retained Chinook per sampled angler, August 1–5, 2026.</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Anglers sampled</th>
              <th scope="col">Chinook kept</th>
              <th scope="col">Kept / sampled angler</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.date}>
                <th scope="row">Aug {Number(row.date.slice(-2))}</th>
                <td>{row.anglers}</td>
                <td>{row.chinook_kept}</td>
                <td>
                  <div className="intel-sample-bar-cell">
                    <div className="intel-sample-bar-track" aria-hidden="true">
                      <div style={{ width: String((row.retainedPerAngler / max) * 100) + '%' }} />
                    </div>
                    <strong>{row.retainedPerAngler.toFixed(3)}</strong>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="intel-sample-bottom">
        <p>
          <strong>{totalChinook} Chinook retained / {totalAnglers} sampled anglers</strong> across only these
          five dates. This is an aggregate of the displayed sample, not an entire-season estimate.
        </p>
        <p>
          Source: <a href={chinookRelease.source_links.wdfw_creel} target="_blank" rel="noopener noreferrer">
            Washington Department of Fish &amp; Wildlife, Buoy 10 creel reports
          </a>, updated {sample.source_updated}. Values may be revised by the agency.
          No relationship to guide ratings or 2027 forecast validation is implied.
        </p>
      </div>
    </section>
  );
}
