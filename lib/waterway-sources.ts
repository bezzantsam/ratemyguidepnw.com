/** Supported pilot government data sources, not spot/boat condition predictions. */
export const WATERWAY_SOURCES = {
  'wilson-river':{
    label:'Wilson River near Tillamook',
    jurisdiction:'US-OR',agency:'USGS',kind:'river',
    stationId:'14301500',
    sourceUrl:'https://waterdata.usgs.gov/monitoring-location/USGS-14301500/',
  },
  'cowlitz-river':{
    label:'Cowlitz River at Castle Rock',
    jurisdiction:'US-WA',agency:'USGS',kind:'river',
    stationId:'14243000',
    sourceUrl:'https://waterdata.usgs.gov/monitoring-location/USGS-14243000/',
  },
  'astoria-tides':{
    label:'Astoria / Tongue Point tide predictions',
    jurisdiction:'US-OR',agency:'NOAA',kind:'tides',
    stationId:'9439040',
    sourceUrl:'https://tidesandcurrents.noaa.gov/stationhome.html?id=9439040',
  },
  'garibaldi-tides':{
    label:'Garibaldi / Tillamook Bay tide predictions',
    jurisdiction:'US-OR',agency:'NOAA',kind:'tides',
    stationId:'9437540',
    sourceUrl:'https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=9437540',
  },
} as const;
export type WaterwaySourceKey=keyof typeof WATERWAY_SOURCES;
export const WATERWAY_CACHE_SECONDS=1800;
export const OBSERVATION_STALE_AFTER_MINUTES=180;
export const WATERWAY_EXCLUDED_SOURCES={
  'kalama-river':'No currently active continuous USGS reading verified. Historic sites 14223000 and 14223500 are NOT live gauges.',
} as const;
