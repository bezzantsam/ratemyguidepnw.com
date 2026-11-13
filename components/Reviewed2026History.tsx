import { reviewed2026ChinookHistory } from '@/lib/chinook-reviewed-history';
import { chinookRelease } from '@/lib/chinook-intel';

export default function Reviewed2026History() {
  const history = reviewed2026ChinookHistory();
  if (!history || history.rows.length <= chinookRelease.historical_sample.rows.length) {
    return null;
  }
  const count = history.rows.length;
  const anglers = history.rows.reduce((sum, row) => sum + row.anglers, 0);
  const retained = history.rows.reduce((sum, row) => sum + row.chinook_kept, 0);
  const max = Math.max(...history.rows.map(row => row.chinook_kept / row.anglers));
  return (
    <details className="intel-reviewed-history">
      <summary>
        <strong>Explore the reviewed August 2026 Chinook sample series</strong>
        <span>{count} sampled days · WDFW preliminary data</span>
      </summary>
      <div className="intel-reviewed-body">
        <p>
          These additional August 2026 agency observations are taken from a
          separately source-audited, SHA-pinned historical release explicitly
          approved on the production branch. These are historical creel observations, not a forecast,
          a legal retention notice or proof of prospective ML accuracy.
        </p>
        <div className="intel-observed-table-scroll">
          <table className="intel-observed-table">
            <caption>WDFW preliminary Buoy 10 observed retained Chinook per sampled angler, August 2026 only.</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Sampled anglers</th>
                <th scope="col">Chinook retained</th>
                <th scope="col">Retained / angler</th>
              </tr>
            </thead>
            <tbody>
              {history.rows.map(row => {
                const rate = row.chinook_kept / row.anglers;
                return (
                  <tr key={row.date}>
                    <th scope="row">Aug {Number(row.date.slice(-2))}</th>
                    <td>{row.anglers}</td>
                    <td>{row.chinook_kept}</td>
                    <td>
                      <div className="intel-sample-bar-cell">
                        <div className="intel-sample-bar-track" aria-hidden="true">
                          <div style={{width: String(rate / max * 100) + '%'}} />
                        </div>
                        <strong>{rate.toFixed(3)}</strong>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p>
          <strong>{retained.toLocaleString('en-US')} retained Chinook</strong> from
          {' '}{anglers.toLocaleString('en-US')} sampled anglers across these {count}
          reported dates. {history.excluded_days > 0
            ? String(history.excluded_days) + ' closed, unsampled or flagged dates excluded.'
            : 'No August days flagged in this released historical sample.'}
        </p>
        <p>
          Official source: <a target="_blank" rel="noopener noreferrer"
          href={chinookRelease.source_links.wdfw_creel}>WDFW Buoy 10 creel report</a>.
          Source SHA-256 fingerprint: {history.source_sha256.slice(0, 12)}…
          Values are agency preliminary and can be revised. No customer-review
          data or privately generated fishing predictions were used.
        </p>
      </div>
    </details>
  );
}
