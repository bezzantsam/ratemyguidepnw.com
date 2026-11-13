"""Official WDFW Buoy 10 Chinook candidate monitor for RateMyGuidePNW.

Only publicly available agency observations. The generated file is a
REVIEW-ONLY DATA CANDIDATE, never an automatic website release or a trained
model label. Fail closed on source drift, mixed species, implausible counts,
or changes to the independently pinned Aug 1-5 2026 example.

This runs separately from the private Chrome-AI Supabase archive. Github's
repository-scoped workflow token cannot read the private Chrome-AI repository;
never add a private database password to this public repository.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone, timedelta
from hashlib import sha256
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

WDFW_URL = "https://wdfw.wa.gov/fishing/reports/creel/buoy10"
MAX_SOURCE_BYTES = 2_000_000
PACIFIC = ZoneInfo("America/Los_Angeles")
SCHEMA_VERSION = 1
FIRST_YEAR = 2026
LAST_YEAR = 2027
ANCHOR = [
    {"date": "2026-08-01", "boats": 53, "anglers": 166, "chinook_kept": 38},
    {"date": "2026-08-02", "boats": 59, "anglers": 174, "chinook_kept": 25},
    {"date": "2026-08-03", "boats": 37, "anglers": 109, "chinook_kept": 19},
    {"date": "2026-08-04", "boats": 92, "anglers": 253, "chinook_kept": 90},
    {"date": "2026-08-05", "boats": 35, "anglers": 104, "chinook_kept": 45},
]


class SourceValidationError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SourceValidationError(message)


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("utf-8")


def digest(value: object) -> str:
    return sha256(canonical(value)).hexdigest()


def fetch_wdfw(*, url: str = WDFW_URL) -> bytes:
    require(url == WDFW_URL, "Only the exact HTTPS WDFW index may be fetched")
    req = Request(url, headers={
        "User-Agent": "ChromeAIResearch/0.2 (+https://github.com/bezzantsam/chrome-ai)",
        "Accept": "text/html,*/*;q=0.1",
    })
    with urlopen(req, timeout=35) as response:
        final = urlsplit(response.geturl())
        require(final.scheme == "https" and final.hostname == "wdfw.wa.gov",
                "Unexpected WDFW redirect destination")
        raw = response.read(MAX_SOURCE_BYTES + 1)
    require(100 < len(raw) <= MAX_SOURCE_BYTES,
            "WDFW page unavailable, truncated, or unexpectedly large")
    require(b"buoy" in raw.lower() and b"chinook" in raw.lower(),
            "Unexpected response instead of WDFW Buoy 10 report")
    return raw


def _year_table(soup: BeautifulSoup, year: int):
    headings = [
        h for h in soup.find_all(re.compile(r"^h[1-6]$"))
        if h.get_text(" ", strip=True) == str(year)
    ]
    if not headings:
        return None
    require(len(headings) == 1, f"Ambiguous WDFW year {year} heading")
    first = headings[0].find_next(["table", "h1", "h2", "h3", "h4", "h5", "h6"])
    require(first is not None and first.name == "table",
            f"WDFW {year} table structure changed")
    return first


def _headers(table) -> list[str]:
    head = table.find("tr")
    require(head is not None, "No report header")
    raw = [re.sub(r"\s+", " ", c.get_text(" ", strip=True).lower())
           for c in head.find_all(["th", "td"], recursive=False)]
    normalized = [
        re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", val)).strip()
        for val in raw
    ]
    require(normalized in (
        ["date", "boats", "anglers", "chinook kept", "coho kept", "retention allowed"],
        ["date", "boats", "anglers", "chinook kept", "coho kept", "comments"],
        ["date", "boats", "anglers", "chinook kept", "coho kept", "comment"],
    ), f"Unknown WDFW source columns: {normalized}")
    return normalized


def _number(value: str, *, field: str, allow_missing: bool = False) -> int | None:
    s = value.replace(",", "").strip()
    if allow_missing and s.lower() in {"—", "–", "-", "no sample"}:
        return None
    require(bool(re.fullmatch(r"[0-9]+", s)), f"Invalid {field} count")
    return int(s)


def parse_august(soup: BeautifulSoup, year: int, now: datetime) -> list[dict]:
    require(year in (2026, 2027), "Only WDFW 2026/2027 August allowed")
    require(now.tzinfo is not None and now.utcoffset() is not None,
            "Observation clock must be timezone aware")
    table = _year_table(soup, year)
    if table is None:
        if year == FIRST_YEAR:
            raise SourceValidationError("Pinned 2026 WDFW baseline disappeared")
        return []
    headers = _headers(table)
    cells_index = {field: i for i, field in enumerate(headers)}
    rows = []
    used_dates = set()
    today_pacific = now.astimezone(PACIFIC).date()
    for tr in table.find_all("tr")[1:]:
        cells = [c.get_text(" ", strip=True)
                 for c in tr.find_all(["th", "td"], recursive=False)]
        if not any(cells):
            continue
        require(len(cells) == len(headers),
                f"Unknown report stratum or malformed row for {year}; requires review")
        day = cells[cells_index["date"]]
        date_match = re.fullmatch(r"Aug\.?\s*(\d{1,2})\.?", day, re.I)
        if date_match is None:
            # This watcher intentionally never treats September coho rows as
            # August Chinook observations, but rejects unrecognized dates.
            require(bool(re.fullmatch(r"Sept?\.?\s*\d{1,2}\.?", day, re.I)),
                    f"Unexpected date row in {year} table: {day}")
            continue
        day_number = int(date_match.group(1))
        require(1 <= day_number <= 31, "Impossible August date")
        observed = date(year, 8, day_number)
        require(observed not in used_dates, "Duplicate August source stratum needs manual QA")
        used_dates.add(observed)
        if observed >= today_pacific:
            # Today's sample cannot be complete yet. Don't backfill or zero it.
            continue
        boats = _number(cells[cells_index["boats"]], field="boats", allow_missing=True)
        anglers = _number(cells[cells_index["anglers"]], field="anglers", allow_missing=True)
        chinook = _number(cells[cells_index["chinook kept"]],
                          field="chinook kept", allow_missing=True)
        note = cells[-1].strip()
        sample_missing = (not boats or not anglers or chinook is None
                          or "no sample" in note.lower())
        note_lower = note.lower()
        retention_declared = "chinook" in note_lower and not any(
            text in note_lower for text in (
                "release all chinook", "chinook retention closed", "coho only"
            )
        )
        if sample_missing:
            require(chinook is None or anglers is None or chinook <= anglers * 2,
                    "WDFW sample mismatch")
            status = "not_sampled"
        elif not retention_declared:
            status = "retention_closed_or_unverified"
        elif chinook > anglers * 2 or anglers > 5000 or boats > 1500:
            status = "implausible_needs_review"
        else:
            status = "observed_unverified_regulations"

        rows.append({
            "date": observed.isoformat(),
            "boats": boats,
            "anglers": anglers,
            "chinook_kept": chinook if status == "observed_unverified_regulations" else None,
            "sample_status": status,
            "source_retention_note": note[:180],
        })
    rows.sort(key=lambda row: row["date"])
    require(len(rows) <= 31, f"Too many August {year} observations")
    if not rows and year == LAST_YEAR:
        return []
    require(bool(rows), f"No August {year} observations")
    if year == FIRST_YEAR:
        anchors = [
            {field: row[field] for field in ("date", "boats", "anglers", "chinook_kept")}
            for row in rows[:len(ANCHOR)]
        ]
        require(anchors == ANCHOR, "Pinned Aug 1–5 2026 WDFW evidence was revised")
    return rows


def make_candidate(raw: bytes, *, now: datetime) -> dict:
    require(100 < len(raw) <= MAX_SOURCE_BYTES, "Unapproved WDFW payload size")
    require(now.tzinfo is not None and now.utcoffset() is not None,
            "Observation clock must be timezone aware")
    soup = BeautifulSoup(raw, "html.parser")
    require("buoy 10" in soup.get_text(" ", strip=True).lower(),
            "Buoy 10 report identification missing")
    seasons = []
    for year in (2026, 2027):
        rows = parse_august(soup, year, now)
        if rows:
            seasons.append({"year": year, "observed_days": len(rows), "rows": rows})
    require(bool(seasons) and seasons[0]["year"] == 2026,
            "Known 2026 source baseline was not found")
    normalized_digest = digest(seasons)
    return {
        "schema_version": SCHEMA_VERSION,
        "fishery": "WDFW Buoy 10",
        "species": "Chinook",
        "source_url": WDFW_URL,
        "source_html_sha256": sha256(raw).hexdigest(),
        "observations_sha256": normalized_digest,
        "captured_at_utc": now.astimezone(timezone.utc).isoformat(),
        "publication_status": "candidate_review_only",
        "model_prediction_values_included": False,
        "official_sample_regulations_verified": False,
        "site_automatically_publishes_candidate": False,
        "seasons": seasons,
    }


def write_if_changed(destination: Path, candidate: dict, *, compare_to: Path | None = None) -> bool:
    reference = compare_to if compare_to is not None else destination
    if reference.is_file():
        previous = json.loads(reference.read_text(encoding="utf-8"))
        if previous.get("observations_sha256") == candidate["observations_sha256"]:
            return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_suffix(destination.suffix + ".tmp")
    temp.write_text(json.dumps(candidate, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")
    os.replace(temp, destination)
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=Path("data/chinook-wdfw-candidate.json"))
    parser.add_argument("--compare", type=Path, help="Previously generated review candidate, if any")
    args = parser.parse_args(argv)
    now = datetime.now(timezone.utc)
    candidate = make_candidate(fetch_wdfw(), now=now)
    changed = write_if_changed(args.output, candidate, compare_to=args.compare)
    print(json.dumps({
        "status": "new_candidate_needs_manual_review" if changed
                  else "official_observations_unchanged",
        "species": "Chinook",
        "observations_sha256": candidate["observations_sha256"],
        "seasons_present": [season["year"] for season in candidate["seasons"]],
        "days_by_year": {str(s["year"]): s["observed_days"] for s in candidate["seasons"]},
        "site_metrics_modified": False,
        "model_predictions_modified": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
