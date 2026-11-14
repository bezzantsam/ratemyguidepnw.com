import { reviewedChinookTideComparison } from '@/lib/chinook-tide-comparison';
import { chartDomain } from '@/lib/chinook-tide-core';

export default function ChinookTideComparison() {
  const result = reviewedChinookTideComparison();
  if (!result) return null;

  const points = result.points;
  const chart = {left: 75, right: 715, top: 26, bottom: 270};
  const { lowX, highX, highY } = chartDomain(points);
  const cx = (x: number) => chart.left +
    (x - lowX) * (chart.right - chart.left) / (highX - lowX);
  const cy = (y: number) => chart.bottom -
    y * (chart.bottom - chart.top) / highY;

  return (
    <section className="intel-tide" aria-labelledby="chinook-tides-heading">
      <div className="intel-tide-heading">
        <div>
          <p className="intel-label">EXPLORATORY RESEARCH / TWO INDEPENDENT SOURCES</p>
          <h3 id="chinook-tides-heading">Chinook sampling vs. predicted tidal spread</h3>
          <p>
            Each dot is one day in August 2026. Horizontal position is the NOAA
            astronomical high-to-low spread at <strong>Astoria</strong>, while vertical
            position is WDFW <strong>retained Chinook per sampled angler</strong> at Buoy 10.
          </p>
        </div>
        <div className="intel-tide-metric">
          <strong>{result.pearsonR.toFixed(2).replace('-', '−')}</strong>
          <span>Unadjusted Pearson r</span>
          <small>31 paired dates · descriptive only</small>
        </div>
      </div>

      <div className="intel-tide-chart">
        <svg viewBox="0 0 760 340" role="img"
          aria-label="Scatterplot of 31 daily NOAA Astoria predicted high-low spreads versus WDFW retained Chinook per sampled angler in August 2026. The observed association is weak and slightly negative.">
          {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
            const y = cy(highY * fraction);
            return (
              <g key={fraction}>
                <line x1={chart.left} x2={chart.right} y1={y} y2={y} stroke="#cadecf" strokeWidth={1}/>
                <text x={chart.left - 12} y={y + 4} textAnchor="end" fontSize={13} fill="#4a6555">
                  {(highY * fraction).toFixed(2)}
                </text>
              </g>
            );
          })}
          {Array.from({length: highX - lowX + 1}, (_, i) => lowX + i).map(value => (
            <g key={value}>
              <line x1={cx(value)} x2={cx(value)} y1={chart.top} y2={chart.bottom}
                stroke="#e2eae2" strokeWidth={1}/>
              <text x={cx(value)} y={chart.bottom + 23} textAnchor="middle" fontSize={13} fill="#4a6555">
                {value}
              </text>
            </g>
          ))}
          <line x1={chart.left} y1={chart.bottom} x2={chart.right} y2={chart.bottom}
            stroke="#769b87" strokeWidth={1.5}/>
          <line x1={chart.left} y1={chart.top} x2={chart.left} y2={chart.bottom}
            stroke="#769b87" strokeWidth={1.5}/>
          {points.map(row => (
            <circle key={row.date}
              cx={cx(row.astoriaPredictedHighLowSpreadFt)}
              cy={cy(row.retainedPerSampledAngler)}
              r={6} fill="#23634f" fillOpacity={0.78}
              stroke="#eaf1e9" strokeWidth={1.5}>
              <title>
                {'Aug ' + Number(row.date.slice(-2)) +
                  ': predicted spread ' + row.astoriaPredictedHighLowSpreadFt.toFixed(2) +
                  ' ft; ' + row.chinookKept + ' retained Chinook / ' +
                  row.sampledAnglers + ' sampled anglers (' +
                  row.retainedPerSampledAngler.toFixed(3) + '/angler)'}
              </title>
            </circle>
          ))}
          <text x={(chart.left + chart.right) / 2} y={322}
            fontSize={14} fill="#254b38" textAnchor="middle">
            Astoria predicted same-day high − low (feet, MLLW)
          </text>
          <text transform="translate(19 157) rotate(-90)"
            fontSize={14} fill="#254b38" textAnchor="middle">
            Retained Chinook per sampled angler
          </text>
        </svg>
      </div>

      <p className="intel-tide-warning">
        <strong>No demonstrated tide-driven bite effect.</strong> The simple unadjusted
        correlation is weak and reflects only 31 historical aggregate days. The
        data do not control for seasonal timing, regulations, sample effort,
        weekends or other conditions. Astoria is not Buoy 10; a same-day maximum
        high minus minimum low is not necessarily the actual adjacent tidal
        exchange or current speed, and NOAA predictions are not measured water levels.
      </p>

      <details className="intel-tide-details">
        <summary>Inspect the original paired 31-day WDFW and NOAA observations</summary>
        <div className="intel-observed-table-scroll">
          <table className="intel-observed-table">
            <caption>Reviewed August 2026 WDFW retained Chinook per sampled angler and NOAA Astoria predicted daily high-low spread</caption>
            <thead><tr>
              <th scope="col">August date</th>
              <th scope="col">Sampled anglers</th>
              <th scope="col">Retained Chinook</th>
              <th scope="col">Retained / angler</th>
              <th scope="col">Astoria spread (ft)</th>
            </tr></thead>
            <tbody>
              {points.map(row => (
                <tr key={row.date}>
                  <th scope="row">{Number(row.date.slice(-2))}</th>
                  <td>{row.sampledAnglers}</td>
                  <td>{row.chinookKept}</td>
                  <td>{row.retainedPerSampledAngler.toFixed(3)}</td>
                  <td>{row.astoriaPredictedHighLowSpreadFt.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="intel-tide-attribution">
        Primary sources: <a href={result.noaaSourceUrl} target="_blank" rel="noopener noreferrer">
          NOAA CO-OPS Astoria station 9439040 astronomical high/low predictions
        </a> and <a href="https://wdfw.wa.gov/fishing/reports/creel/buoy10"
          target="_blank" rel="noopener noreferrer">WDFW Buoy 10 creel report</a>.
        Both independently SHA-256 verified against the approved August 2026
        historical releases. The model was not retrained, and these 31 points
        do not validate its 2027 forecast accuracy.
      </p>
    </section>
  );
}
