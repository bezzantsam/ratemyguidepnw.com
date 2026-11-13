# NOAA Astoria high/low predictions · August 2026 source QA

**Goal:** compare WDFW Buoy 10 sampled retained Chinook per angler to **NOAA astronomical high/low tidal predictions** at Astoria, Oregon (station `9439040`) for the same historical Pacific-local calendar dates.

## Authoritative NOAA source

NOAA CO-OPS Data API, station 9439040, 2026-08-01 through 2026-08-31, `product=predictions`, `interval=hilo`, `datum=MLLW`, `time_zone=lst_ldt`, `units=english` and `format=json`.

[NOAA prediction page](https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=9439040) · [Official NOAA Data API documentation](https://api.tidesandcurrents.noaa.gov/api/prod/)

**Explicit interpretation:** max predicted high tide minus min predicted low tide **within the same Pacific civil calendar day**, feet above/below mean lower low water datum. This can differ from the physical tidal **exchange between adjacent high and low** because the chosen extrema may not be consecutive. These are ***astronomical predictions***, not actual water-level observations, river current velocity, tide-induced bite windows or a model of individual fishing success. Astoria is a reference location, **not a tide station at Buoy 10**.

## Safety rules

1. The NOAA HTTP request is hard-coded to official HTTPS CO-OPS hostname and query parameters; off-domain redirects or API errors cause failure, not fake results.
2. The parser requires all 31 August 2026 civil dates, realistic tide events and valid high/low counts. It rejects duplicate, out-of-order, impossible or future-dated records.
3. Preserve the complete original NOAA API response's SHA-256 and a second SHA-256 of normalized day and event rows. No weather or river flow proxy is invented from the tides.
4. The monthly GitHub Action and manual workflow may **update only** `bot/noaa-astoria-2026-review`, a proposed **review candidate**, and upload a 30-day run artifact. It **never updates the public display file** or the frozen Chrome-AI model, never uses Supabase credentials and creates no routine PR/issue notifications.
5. Compare normalized observations before pushing. An unchanged prediction set makes no revision commit.
6. A future **separate reviewed 2026 historical NOAA release** may be added after cross-source verification and paired with the already approved WDFW `data/chinook-2026-reviewed.json`. A UI must clearly state the prediction vintage, units, station, dates, and **no causal conclusion or forecast skill claim**.

## What the comparison can mean

A descriptive scatterplot of *NOAA predicted daily high-to-low spread (ft)* versus *WDFW sampled retained Chinook per angler* can show whether the 31 historical paired dates have an obvious association. It does not control for weekends, fishing pressure, location, temperature, stock abundance, restrictions, tides and current speed, and other confounding factors. It is **not** a valid independent 2027 forecasting evaluation and cannot justify claims of a causal effect of tidal exchange on the Chinook bite. No anonymous guide review is an outcome label.

## Test and release

```bash
python -m unittest discover -s tests -p 'test_noaa_astoria_2026_watch.py' -v
```

Automated GitHub CI validates the source watcher and the website build. Once the official 2026 NOAA event list has been acquired and verified, review its SHA and 31-day completeness before adding a **separately approved** public historical tide comparison. The new source automation runs monthly for historical tide prediction revisions, not to continuously publish an unreviewed result.
