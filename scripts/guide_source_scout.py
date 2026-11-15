#!/usr/bin/env python3
"""RateMyGuidePNW operator-site scouting. OFFLINE BY DEFAULT; never publishes.

This deliberately does NOT mirror/copy source biographies, images or reviews.
It generates human-review-only *keyword mentions* with source provenance, not
assertions that a guide actually offers those trips.

Automated Facebook/Instagram/Meta collection is explicitly unsupported.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import ipaddress
import json
from pathlib import Path
import re
import sys
import time
from typing import Callable
from urllib import error, parse, request, robotparser
from datetime import date, datetime, timezone

BOT = "RateMyGuidePNWResearch"
USER_AGENT = "RateMyGuidePNWResearch/0.1 (+https://ratemyguidepnw.com; source-scoping)"
MAX_PAGES = 15
MAX_PER_HOST = 2
MAX_HTML_BYTES = 512_000
MAX_ROBOTS_BYTES = 128_000
MIN_HOST_INTERVAL_SECONDS = 3
BLOCKED_HOST_SUFFIXES = (
    "facebook.com", "fb.com", "fbcdn.net", "instagram.com",
    "threads.net", "meta.com", "tiktok.com", "linkedin.com",
    "youtube.com", "youtu.be", "x.com", "twitter.com",
    "linktr.ee",
)
SOURCE_TERMS = {
    "species": {
        "Chinook": ("chinook", "king salmon"),
        "Coho": ("coho", "silver salmon"),
        "Steelhead": ("steelhead",),
        "Sturgeon": ("sturgeon",),
        "Albacore": ("albacore",),
        "Halibut": ("halibut",),
        "Walleye": ("walleye",),
        "Shad": ("shad",),
        "Crab": ("crabbing", "dungeness crab"),
        "Bottomfish": ("rockfish", "lingcod", "bottomfish"),
    },
    "waterway": {
        "Buoy 10": ("buoy 10", "buoy ten"),
        "Lower Columbia River": ("lower columbia river",),
        "Willamette River": ("willamette river",),
        "Tillamook Bay": ("tillamook bay",),
        "Nehalem River": ("nehalem river",),
        "Nehalem Bay": ("nehalem bay",),
        "Cowlitz River": ("cowlitz river",),
        "Kalama River": ("kalama river",),
        "Lewis River": ("lewis river",),
        "Lower Deschutes River": ("lower deschutes",),
        "Drano Lake": ("drano lake",),
        "Grays Harbor": ("grays harbor",),
        "Pacific Ocean": ("pacific ocean",),
    },
}


class ScoutError(ValueError):
    """A source did not pass a safety or permissions gate."""


class TextOnlyHTML(HTMLParser):
    """Plain visible text only; never save the source HTML to the output."""

    OMIT = {"script", "style", "noscript", "template", "svg", "nav", "footer"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ignored = []
        self.parts = []
        self.characters = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.OMIT:
            self.ignored.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag in self.OMIT and tag in self.ignored:
            self.ignored.remove(tag)

    def handle_data(self, data: str) -> None:
        if self.ignored or not data.strip() or self.characters > 100_000:
            return
        self.characters += len(data)
        self.parts.append(data)

    def get_text(self) -> str:
        return re.sub(r"\s+", " ", " ".join(self.parts))[:100_000]


def source_url(value: str, allowed_host: str) -> str:
    if not isinstance(value, str) or not isinstance(allowed_host, str):
        raise ScoutError("A source URL and its exact approved hostname are required.")
    parsed = parse.urlsplit(value)
    host = parsed.hostname
    if parsed.scheme != "https" or not host or parsed.username or parsed.password:
        raise ScoutError("Only anonymous public HTTPS operator pages are accepted.")
    if parsed.port not in (None, 443) or parsed.query or parsed.fragment:
        raise ScoutError("No alternate ports, query credentials, or fragments are accepted.")
    if host.lower() != allowed_host.lower() or not re.fullmatch(r"[a-z0-9.-]+", host.lower()):
        raise ScoutError("The URL must match its exact manually approved hostname.")
    if ".." in parse.unquote(parsed.path).split("/"):
        raise ScoutError("Ambiguous parent-directory URLs are not accepted.")
    if any(host == suffix or host.endswith("." + suffix) for suffix in BLOCKED_HOST_SUFFIXES):
        raise ScoutError("Social-network scraping is disabled. Use permitted/manual review.")
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ScoutError("Nonpublic internal hosts are not eligible.")
    try:
        ipaddress.ip_address(host)
        raise ScoutError("IP-address targets are not eligible for operator-site scouting.")
    except ValueError as exc:
        if isinstance(exc, ScoutError):
            raise
    return value


def validate_manifest(rows: object) -> list[dict]:
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_PAGES:
        raise ScoutError("Provide between 1 and 15 explicit operator source records.")
    seen = set()
    host_counts: dict[str, int] = {}
    result = []
    for row in rows:
        if not isinstance(row, dict) or set(row) != {
            "guide_id", "source_url", "allowed_host", "terms_reviewed_on", "approved_to_fetch"
        }:
            raise ScoutError("Every manifest row must use only the five documented fields.")
        guide_id = row["guide_id"]
        if not isinstance(guide_id, str) or not re.fullmatch(r"(?:OG\.\d{7}|wa-\d{3})", guide_id):
            raise ScoutError("Unknown or malformed guide identity; don't guess a match.")
        url = source_url(row["source_url"], row["allowed_host"])
        if type(row["approved_to_fetch"]) is not bool:
            raise ScoutError("approved_to_fetch must be a boolean; never implied by a URL.")
        reviewed = row["terms_reviewed_on"]
        if reviewed is not None:
            if not isinstance(reviewed, str):
                raise ScoutError("terms_reviewed_on must be null or YYYY-MM-DD.")
            try:
                when = date.fromisoformat(reviewed)
            except ValueError as exc:
                raise ScoutError("Invalid terms review date.") from exc
            if when > date.today():
                raise ScoutError("Terms review date cannot be in the future.")
        if row["approved_to_fetch"] and reviewed is None:
            raise ScoutError("Explicitly approved fetches require prior site-terms review.")
        key = (guide_id, url)
        if key in seen:
            raise ScoutError("Duplicate source for one guide.")
        seen.add(key)
        host = parse.urlsplit(url).hostname
        host_counts[host] = host_counts.get(host, 0) + 1
        if host_counts[host] > MAX_PER_HOST:
            raise ScoutError("At most two explicit pages per host are allowed.")
        result.append(row)
    return result


class NoRedirects(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_public_html(url: str, *, max_bytes: int) -> bytes:
    """No cookies, no authentication, no off-domain redirects or retries."""
    opener = request.build_opener(NoRedirects)
    req = request.Request(url, headers={
        "User-Agent": USER_AGENT, "Accept": "text/html, text/plain;q=0.4",
    })
    try:
        with opener.open(req, timeout=8) as response:
            if response.status != 200:
                raise ScoutError(f"Non-200 response: {response.status}")
            data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise ScoutError("Page exceeded safe download size.")
            content_type = response.headers.get("Content-Type", "").lower()
            if "text/html" not in content_type and "text/plain" not in content_type:
                raise ScoutError("Only public HTML/text pages are accepted.")
            return data
    except (error.HTTPError, error.URLError, TimeoutError) as exc:
        raise ScoutError("Cannot fetch public source safely (refused, redirected or unavailable).") from exc


def robots_allowed(url: str, fetch: Callable[[str, int], bytes]) -> tuple[bool, int]:
    """Fail closed if robots.txt is unavailable. Returns (allowed, crawl delay)."""
    parts = parse.urlsplit(url)
    robots_url = f"https://{parts.hostname}/robots.txt"
    try:
        raw = fetch(robots_url, MAX_ROBOTS_BYTES)
        directives = raw.decode("utf-8", errors="replace").splitlines()
        rules = robotparser.RobotFileParser()
        rules.parse(directives)
        allowed = rules.can_fetch(BOT, url)
        raw_delay = rules.crawl_delay(BOT)
        delay = max(MIN_HOST_INTERVAL_SECONDS, raw_delay or 0)
        return allowed, delay
    except (ScoutError, OSError, UnicodeError, ValueError):
        return False, MIN_HOST_INTERVAL_SECONDS


def extract_mentions(html: bytes) -> dict[str, list[str]]:
    text_parser = TextOnlyHTML()
    text_parser.feed(html.decode("utf-8", errors="replace"))
    normalized = text_parser.get_text().casefold()
    hits: dict[str, list[str]] = {}
    for kind, categories in SOURCE_TERMS.items():
        found = []
        for name, phrases in categories.items():
            if any(re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", normalized) for term in phrases):
                found.append(name)
        hits[kind] = found
    return hits


def scout(rows: list[dict], fetch: Callable[[str, int], bytes],
          now: datetime | None = None, sleep: Callable[[float], None] = time.sleep) -> list[dict]:
    captured_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).isoformat()
    records = []
    last_host_access: dict[str, float] = {}
    # The actual transfer function is injectable for *offline* CI. No network on tests.
    for row in validate_manifest(rows):
        if not row["approved_to_fetch"]:
            records.append({"guide_id": row["guide_id"], "source_url": row["source_url"],
                            "status": "skipped_no_permission"})
            continue
        host = parse.urlsplit(row["source_url"]).hostname
        allowed, delay = robots_allowed(row["source_url"], fetch)
        if not allowed:
            records.append({"guide_id": row["guide_id"], "source_url": row["source_url"],
                            "status": "skipped_robots_or_unavailable"})
            continue
        if host in last_host_access:
            sleep(delay)
        try:
            body = fetch(row["source_url"], MAX_HTML_BYTES)
        except (ScoutError, OSError, ValueError):
            records.append({"guide_id": row["guide_id"], "source_url": row["source_url"],
                            "status": "skipped_unavailable"})
            continue
        last_host_access[host] = time.monotonic()
        mentions = extract_mentions(body)
        records.append({
            "guide_id": row["guide_id"],
            "source_url": row["source_url"],
            "observed_at": captured_at,
            "source_type": "operator_website",
            "status": "needs_human_review",
            "content_sha256": hashlib.sha256(body).hexdigest(),
            "candidate_mentions_not_offerings": mentions,
            "rights_note": "No source prose, photos, reviews or contact details retained.",
            "publication_state": "unpublished_research_only",
        })
    return records


def private_output_path(path: str) -> Path:
    out = Path(path)
    if out.is_absolute() or ".." in out.parts or not out.parts or out.parts[0] != "research-drafts":
        raise ScoutError("Output must remain under ignored research-drafts/ inside this checkout.")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="research/guide-source-manifest.json")
    parser.add_argument("--output", default="research-drafts/scout-evidence.json")
    parser.add_argument("--fetch", action="store_true",
                        help="Explicit opt-in to fetch only approved rows and obey robots.")
    args = parser.parse_args()
    rows = validate_manifest(json.loads(Path(args.manifest).read_text(encoding="utf-8")))
    if not args.fetch:
        print(json.dumps({
            "mode": "plan_only_no_network",
            "total_sources": len(rows),
            "approved_for_future_fetch": sum(bool(row["approved_to_fetch"]) for row in rows),
            "note": "No pages requested. --fetch requires reviewed site terms and robots permission.",
        }, indent=2))
        return 0
    def fetch_url(url: str, max_bytes: int) -> bytes:
        return read_public_html(url, max_bytes=max_bytes)
    output = scout(rows, fetch_url)
    path = private_output_path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "mode": "draft_capture_only", "output_path": str(path),
        "ready_for_editor_review": sum(r["status"] == "needs_human_review" for r in output),
        "published": 0,
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ScoutError, json.JSONDecodeError, FileNotFoundError) as exc:
        print(f"Guide source scout refused: {exc}", file=sys.stderr)
        sys.exit(2)
