"""Source-check NOAA CO-OPS Astoria tidal predictions, Aug 2026 only.

Produces a review-only candidate, NEVER a live website release. The date-level
extrema spread is a descriptive astronomical tide proxy, not current speed,
slack time, observed water level, or a causal Chinook bite prediction.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
PARAMS = {
    "begin_date": "20260801",
    "end_date": "20260831",
    "station": "9439040",
    "product": "predictions",
    "datum": "MLLW",
    "time_zone": "lst_ldt",
    "units": "english",
    "interval": "hilo",
    "format": "json",
    "application": "RateMyGuidePNW_Chinook_Intel",
}
MAX_BYTES = 125000
EXPECTED_DATES = [f"2026-08-{day:02d}" for day in range(1, 32)]


class TideDataError(ValueError):
    pass


def require(condition: bool, msg: str) -> None:
    if not condition:
        raise TideDataError(msg)


def canonical(data: object) -> bytes:
    return json.dumps(data, ensure_ascii=True, allow_nan=False,
                      sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha(data: object) -> str:
    return hashlib.sha256(canonical(data)).hexdigest()


def source_url() -> str:
    return BASE + "?" + urlencode(PARAMS)


def fetch_official() -> bytes:
    request = Request(source_url(), headers={
        "User-Agent": "RateMyGuidePNWChinookResearch/0.1",
        "Accept": "application/json",
    })
    with urlopen(request, timeout=40) as response:
        target = urlsplit(response.geturl())
        require(target.scheme == "https" and target.hostname == "api.tidesandcurrents.noaa.gov",
                "NOAA request unexpectedly redirected off official HTTPS API")
        raw = response.read(MAX_BYTES + 1)
    require(150 < len(raw) <= MAX_BYTES, "NOAA response missing or too large")
    return raw


def parse_predictions(raw: bytes) -> tuple[list[dict], list[dict]]:
    require(150 < len(raw) <= MAX_BYTES, "Unexpected NOAA payload size")
    data = json.loads(raw)
    require(isinstance(data, dict) and "error" not in data,
            "NOAA returned an error rather than predictions")
    predictions = data.get("predictions")
    require(isinstance(predictions, list) and 90 <= len(predictions) <= 160,
            "NOAA August high/low events missing or unexpected count")
    groups = defaultdict(list)
    events = []
    previous_time = None
    for item in predictions:
        require(isinstance(item, dict) and {"t", "v", "type"}.issubset(item),
                "Unknown NOAA event shape")
        require(isinstance(item["t"], str) and bool(
            re.fullmatch(r"2026-08-(0[1-9]|[12]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d", item["t"])
        ), "NOAA timestamps not in August 2026 Pacific-local clock time")
        local_time = datetime.strptime(item["t"], "%Y-%m-%d %H:%M")
        if previous_time is not None:
            diff_minutes = (local_time - previous_time).total_seconds() / 60
            require(90 <= diff_minutes <= 900, "Missing/duplicate/unordered NOAA tides")
        previous_time = local_time
        require(item["type"] in ("H", "L"), "Unknown tide event type")
        require(isinstance(item["v"], (str, int, float))
                and re.fullmatch(r"-?\d{1,2}(\.\d{1,3})?", str(item["v"])) is not None,
                "Malformed NOAA predicted tide elevation")
        height = float(item["v"])
        require(math.isfinite(height) and -5 <= height <= 18,
                "Unreasonable predicted Astoria tide height")
        event = {"local_time": item["t"], "type": item["type"],
                 "predicted_mllw_ft": round(height, 3)}
        groups[item["t"][:10]].append(event)
        events.append(event)

    require(set(groups) == set(EXPECTED_DATES), "NOAA did not return all 31 August civil dates")
    daily = []
    for day in EXPECTED_DATES:
        values = groups[day]
        highs = [v["predicted_mllw_ft"] for v in values if v["type"] == "H"]
        lows = [v["predicted_mllw_ft"] for v in values if v["type"] == "L"]
        require(1 <= len(highs) <= 3 and 1 <= len(lows) <= 3
                and 2 <= len(values) <= 5,
                f"Missing high or low in NOAA {day}")
        high, low = max(highs), min(lows)
        require(0 < high - low < 20, "Unexpected NOAA high-low spread")
        daily.append({
            "date": day, "highest_predicted_high_mllw_ft": high,
            "lowest_predicted_low_mllw_ft": low,
            "calendar_day_high_low_spread_ft": round(high - low, 3),
            "high_events": len(highs), "low_events": len(lows),
        })
    return daily, events


def candidate(raw: bytes, *, now: datetime) -> dict:
    require(now.tzinfo is not None and now.utcoffset() is not None,
            "Tide source acceptance timestamp needs UTC offset")
    daily, events = parse_predictions(raw)
    require(len(daily) == 31, "Missing tidal days")
    return {
        "schema_version": 1,
        "source_url": source_url(),
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "observations_sha256": sha({"daily": daily, "events": events}),
        "captured_at_utc": now.astimezone(timezone.utc).isoformat(),
        "publication_status": "candidate_review_only",
        "source": "NOAA CO-OPS astronomical tide predictions",
        "station_id": "9439040",
        "station_name": "Astoria, Oregon",
        "station_is_buoy_10": False,
        "time_zone": "lst_ldt",
        "datum": "MLLW",
        "units": "feet",
        "date_scope": "2026-08-01 through 2026-08-31 (local civil dates)",
        "interpretation": "Daily max predicted H minus min predicted L; not measured water level, adjacent exchange, Columbia current speed, or fish bite forecast",
        "approved_for_public_display": False,
        "approved_for_model_evaluation": False,
        "daily": daily,
        "events": events,
    }


def write_if_changed(path: Path, data: dict, previous: Path | None = None) -> bool:
    if previous is None:
        previous = path
    if previous.exists():
        existing = json.loads(previous.read_text(encoding="utf-8"))
        if existing.get("observations_sha256") == data["observations_sha256"]:
            return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    os.replace(tmp, path)
    return True


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=Path("data/noaa-astoria-2026-candidate.json"))
    parser.add_argument("--compare", type=Path, default=None)
    args = parser.parse_args(argv)
    data = candidate(fetch_official(), now=datetime.now(timezone.utc))
    changed = write_if_changed(args.output, data, args.compare)
    print(json.dumps({
        "status": "new_tide_candidate_needs_review" if changed
                  else "unchanged_no_review_needed",
        "NOAA_station": "9439040",
        "daily_dates": len(data["daily"]),
        "events": len(data["events"]),
        "sha256": data["observations_sha256"],
        "site_data_updated": False,
        "private_forecasts_updated": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
