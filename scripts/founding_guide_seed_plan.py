#!/usr/bin/env python3
"""Founder-selected PNW captain profile seed planner. No outreach, no publishing.

Reads already imported public records and reviewed source citations. Only the
founder can select known public profile IDs. This never claims a guide is a
friend, has consented, has a current license, or will run any particular trip.
The output is a *private* local checklist, not a database migration.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
MARKETS = ROOT / "research/market-adapters.json"
DEFAULT_SELECTION = ROOT / "research/founding-guide-selection.template.json"
MAX_PILOT = 15


class SeedError(ValueError):
    """Input is unsafe or not backed by a known public directory identity."""


def norm(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).strip()).lower()


def public_washington_ids() -> dict[str, dict]:
    """Mirror the exact public WA source-key filter; never resurrect suppressed IDs."""
    code = (ROOT / "lib/washington.ts").read_text(encoding="utf-8")
    match = re.search(r"const crossStateNames=new Set\(\[(.*?)\]\);", code, re.S)
    if not match:
        raise SeedError("Washington suppression contract changed; manual review required.")
    blocked = set(re.findall(r"'([^']+)'", match.group(1)))
    if not blocked:
        raise SeedError("Washington source exclusion contract unexpectedly empty.")
    mapping = json.loads((ROOT / "lib/washington-stable-ids.json").read_text())
    raw = json.loads((ROOT / "lib/washington-raw.json").read_text())
    result = {}
    seen_keys = set()
    for row in raw:
        if norm(row["name"]) in blocked:
            continue
        key = json.dumps(
            [norm(row["name"]), norm(row["business"] or ""), norm(row["source"])],
            ensure_ascii=False, separators=(",", ":"),
        )
        if key in seen_keys:
            raise SeedError("Duplicate Washington imported source key.")
        seen_keys.add(key)
        record_id = mapping.get(key)
        if not record_id or not re.fullmatch(r"wa-\d{3,}", record_id):
            raise SeedError("WA source row has no reviewed stable public ID.")
        if record_id in result:
            raise SeedError("Duplicate public Washington guide ID.")
        result[record_id] = {
            "public_id": record_id,
            "registered_name": row["name"],
            "business": row["business"],
            "source_label": row["source"],
            "jurisdiction": "US-WA",
            "profile_href": "/washington/" + record_id,
        }
    return result


def known_public_records() -> dict[str, dict]:
    result = {}
    for record in json.loads((ROOT / "lib/oregon-guides.json").read_text()):
        record_id = record["registration"]
        if not re.fullmatch(r"OG\.\d{7}", record_id) or record_id in result:
            raise SeedError("Invalid or duplicated historical Oregon public ID.")
        result[record_id] = {
            "public_id": record_id,
            "registered_name": record["name"],
            "business": record["business"],
            "source_label": "Oregon historical registration snapshot",
            "jurisdiction": "US-OR",
            "profile_href": "/guides/" + re.sub(r"[^a-z0-9]+", "-", record_id.lower()).strip("-"),
            "historical_status_text_not_live_verified": record["sourceStatus"],
        }
    result.update(public_washington_ids())
    return result


def permitted_https_url(url: str) -> bool:
    if not isinstance(url, str) or len(url) > 2048:
        return False
    try:
        p = urlsplit(url)
        return (p.scheme == "https" and bool(p.hostname) and
                p.username is None and p.password is None and p.port in (None, 443))
    except ValueError:
        return False


def source_backed_mentions(guide_id: str) -> list[dict]:
    if not guide_id.startswith("OG."):
        return []
    data = json.loads((ROOT / "lib/guide-enrichment.json").read_text())
    evidence = data.get(guide_id)
    if not evidence:
        return []
    result = []
    for row in evidence.get("advertisedWaters", []):
        if not permitted_https_url(row.get("sourceUrl", "")):
            raise SeedError("Preexisting operator source citation is unsafe.")
        if row.get("sourceType") not in ("operator_site", "third_party_directory"):
            raise SeedError("Unexpected preexisting public-source type.")
        result.append({
            "mentioned_waterway": row["name"],
            "source_url": row["sourceUrl"],
            "source_type": row["sourceType"],
            "interpretation": "historically_editorial_source_link_not_confirmed_current_trip",
        })
    return result


def validate_market_config() -> dict:
    data = json.loads(MARKETS.read_text())
    if set(data) != {"schema_version", "markets", "source_adapters"} or data["schema_version"] != 1:
        raise SeedError("Market configuration version changed: manual review required.")
    if not isinstance(data["markets"], dict) or not isinstance(data["source_adapters"], dict):
        raise SeedError("Invalid market configuration.")
    for jurisdiction, adapter in data["source_adapters"].items():
        if not re.fullmatch(r"[A-Z]{2}-[A-Z]{2}", jurisdiction):
            raise SeedError("Malformed state jurisdiction.")
        if not isinstance(adapter, dict) or adapter.get("live_credential_verified") is not False:
            raise SeedError("Source adapter cannot claim verified current credentials.")
        if not isinstance(adapter.get("adapter"), str):
            raise SeedError("Missing source adapter type.")
    return data


def validate_selection(value: object, markets: dict, existing: dict) -> tuple[str, list[str]]:
    if not isinstance(value, dict) or set(value) != {"market_id", "selected_public_ids"}:
        raise SeedError("Selection must specify only market_id and selected_public_ids.")
    market_id = value["market_id"]
    if not isinstance(market_id, str) or market_id not in markets["markets"]:
        raise SeedError("Unknown market; new markets require explicit reviewed configuration.")
    market = markets["markets"][market_id]
    if not isinstance(market, dict) or market.get("status") != "pilot":
        raise SeedError("Market is not open for a controlled pilot.")
    selected = value["selected_public_ids"]
    if not isinstance(selected, list) or len(selected) > MAX_PILOT:
        raise SeedError("Select no more than 15 public IDs for a founder cohort.")
    if len(selected) != len(set(map(str, selected))):
        raise SeedError("Duplicate public ID in founder selection.")
    for record_id in selected:
        if not isinstance(record_id, str) or record_id not in existing:
            raise SeedError("Unknown or suppressed public ID. Do not invent a guide profile.")
        if existing[record_id]["jurisdiction"] not in market["jurisdictions"]:
            raise SeedError("Selected record is outside the configured market.")
        if existing[record_id]["jurisdiction"] not in markets["source_adapters"]:
            raise SeedError("Jurisdiction lacks a reviewed source adapter.")
    return market_id, selected


def identity_review_hints(guide: dict, known: dict) -> list[dict]:
    current_name = norm(guide["registered_name"])
    current_business = norm(guide["business"] or "")
    hints = []
    for other in known.values():
        if other["public_id"] == guide["public_id"]:
            continue
        similar_name = bool(current_name and norm(other["registered_name"]) == current_name)
        similar_brand = bool(current_business and norm(other["business"] or "") == current_business)
        if similar_name or similar_brand:
            hints.append({
                "other_public_id": other["public_id"],
                "reason": "same_imported_person_name" if similar_name else "shared_imported_business_name",
                "instruction": "manual_identity_review_only_never_merge_by_name_or_business",
            })
    return hints[:20]


def build_plan(selection: dict, *, generated_at: str | None = None) -> dict:
    markets = validate_market_config()
    known = known_public_records()
    market_id, ids = validate_selection(selection, markets, known)
    if generated_at is None:
        generated_at = datetime.now(timezone.utc).isoformat()
    market = markets["markets"][market_id]
    profiles = []
    for record_id in ids:
        g = known[record_id]
        country = market["country"]
        if g["jurisdiction"].split("-")[0] != country:
            raise SeedError("Market country and source jurisdiction do not match.")
        row = {
            "global_source_record_key": f"{country}:{g['jurisdiction']}:{record_id}",
            "existing_public_id": record_id,
            "jurisdiction": g["jurisdiction"],
            "display_name_from_imported_source": g["registered_name"],
            "business_name_from_imported_source": g["business"],
            "import_source": g["source_label"],
            "historical_status_not_license_proof": g.get("historical_status_text_not_live_verified"),
            "existing_profile_href": g["profile_href"],
            "claim_route_after_backend_activation": "/claim/" + record_id,
            "invitation_status": "not_contacted_no_consent_claimed",
            "ownership_status": "not_verified",
            "editing_rights": "no_access_granted",
            "publication_action": "none",
            "owner_provided_vessels": [],
            "owner_provided_seasonal_packages": [],
            "source_linked_mentions_for_editor_review": source_backed_mentions(record_id),
            "identity_review_hints": identity_review_hints(g, known),
            "editorial_checklist": [
                "founder_confirms_the_actual_person_to_invite_offline",
                "independent_identity_and_current_affiliation_review",
                "captain_explicitly_agrees_and_claims_profile_after_backend_activation",
                "captain_reviews_source_backed_facts_no_fabricated_trip_fields",
                "human_moderation_before_any_new_public_information",
            ],
        }
        profiles.append(row)
    return {
        "schema_version": 1,
        "market_id": market_id,
        "market_country": market["country"],
        "market_label": market["label"],
        "generated_at": generated_at,
        "status": "private_local_review_plan_not_a_live_directory_update",
        "outreach_performed": False,
        "publication_performed": False,
        "selected_count": len(profiles),
        "profiles": profiles,
    }


def private_output_path(value: str) -> Path:
    target = Path(value)
    if target.is_absolute() or ".." in target.parts or not target.parts or target.parts[0] != "research-drafts":
        raise SeedError("Output must be under ignored research-drafts/.")
    root = ROOT.resolve()
    path = (root / target).resolve()
    if not path.is_relative_to(root / "research-drafts"):
        raise SeedError("Output path escapes ignored research draft directory.")
    if path.exists() and path.is_symlink():
        raise SeedError("Cannot overwrite a symbolic link.")
    return path


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--selection", default=str(DEFAULT_SELECTION))
    p.add_argument("--write-draft", action="store_true", help="Explicitly save the offline plan.")
    p.add_argument("--output", default="research-drafts/founding-guide-plan.json")
    args = p.parse_args()
    selection = json.loads(Path(args.selection).read_text(encoding="utf-8"))
    plan = build_plan(selection)
    if not args.write_draft:
        print(json.dumps({
            "mode": "plan_only_no_outreach_or_publication",
            "market": plan["market_id"],
            "selected_count": plan["selected_count"],
            "next_step": "Select existing public IDs; --write-draft saves private pack only.",
        }, indent=2))
        return 0
    if not plan["profiles"]:
        raise SeedError("No selected guides. Refuse to write empty seed pack.")
    target = private_output_path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "private_draft_saved", "path": str(target.relative_to(ROOT)),
        "profiles": len(plan["profiles"]), "invites_sent": 0, "published": 0,
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (SeedError, OSError, json.JSONDecodeError, TypeError) as exc:
        print("Founding guide seed planner refused: " + str(exc), file=sys.stderr)
        sys.exit(2)
