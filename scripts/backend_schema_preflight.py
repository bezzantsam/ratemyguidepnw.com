#!/usr/bin/env python3
"""RateMyGuidePNW backend contract preflight. LOCAL SOURCE INSPECTION ONLY.

A green Next.js build does not establish that inactive Supabase has matching
schema, grants, JWT roles, RLS, storage, policies, or publishing safeguards.
No network connection, SQL writes or restoration is performed here.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
INITIAL = ROOT / "supabase/migrations/0001_initial.sql"
MEDIA = ROOT / "supabase/migrations/0002_captain_media.sql"
FLEET = ROOT / "supabase/migrations/0003_pending_captain_fishery_proposals.sql"

REVIEW_INSERT = {
    "guide_id", "author_id", "quality", "firsthand_attested", "communication",
    "safety", "effort", "equipment", "professionalism", "knowledge",
    "value_rating", "would_book_again", "catch_outcome", "body",
    "trip_month", "trip_context",
}
PUBLIC_REVIEWS_READ = {
    "id", "guide_id", "body", "quality", "published_at",
    "would_book_again", "communication", "professionalism", "safety",
    "equipment", "knowledge", "effort", "value_rating", "trip_context",
}
CLIENT_NEEDS = {
    "guide_claims": {"guide_id", "claimant_id"},
    "claim_evidence": {"claim_id", "claimant_name", "business_name", "public_evidence"},
    "reviews": REVIEW_INSERT,
    "public_angler_reviews": PUBLIC_REVIEWS_READ,
}
CLIENT_FILES = {
    "claim": ROOT / "components/ClaimForm.tsx",
    "review": ROOT / "components/ReviewComposer.tsx",
    "public": ROOT / "components/CaptainReviews.tsx",
    "fleet": ROOT / "components/CaptainFisheryEditor.tsx",
}
SQL_TYPES = ("uuid", "text", "smallint", "boolean", "timestamptz", "numeric",
             "integer", "int", "date", "jsonb")


def create_table_body(sql: str, name: str) -> str | None:
    pattern = rf"\bcreate\s+table\s+public\.{re.escape(name)}\s*\((.*?)\n[ \t]*\);"
    match = re.search(pattern, sql, re.I | re.S)
    return match.group(1) if match else None


def initial_table_columns(sql: str, name: str) -> set[str]:
    body = create_table_body(sql, name)
    if body is None:
        return set()
    types = "|".join(SQL_TYPES)
    return set(re.findall(
        rf"^\s*([a-z_][a-z_0-9]*)\s+(?:{types})\b",
        body, re.I | re.M,
    ))


def has_view(sql: str, name: str) -> bool:
    return re.search(rf"\bcreate\s+(?:or\s+replace\s+)?view\s+public\.{re.escape(name)}\b",
                     sql, re.I) is not None


def has_insert_policy(sql: str, name: str) -> bool:
    return re.search(
        rf"\bcreate\s+policy\b[^;]*\bon\s+public\.{re.escape(name)}\b"
        rf"[^;]*\bfor\s+insert\b", sql, re.I | re.S,
    ) is not None


def risk_report() -> dict:
    initial = INITIAL.read_text(encoding="utf-8")
    media = MEDIA.read_text(encoding="utf-8")
    fleet = FLEET.read_text(encoding="utf-8")
    files = {name: path.read_text(encoding="utf-8") for name, path in CLIENT_FILES.items()}

    # Fail closed if later edits bypass the contracts this audit inspects.
    observed = {
        "claim_write": "client.rpc('request_guide_claim'" in files["claim"],
        "private_claim_evidence_write": "p_public_evidence:publicEvidence" in files["claim"],
        "no_direct_orphan_claim_writes": (
            "from('guide_claims').insert" not in files["claim"] and
            "from('claim_evidence').insert" not in files["claim"]
        ),
        "pending_review_write": "from('reviews').insert" in files["review"],
        "published_review_view_read": "from('public_angler_reviews')" in files["public"],
        "private_captain_fleet_write": "from('guide_fishery_proposals').insert" in files["fleet"],
    }
    if not all(observed.values()):
        raise ValueError("Client integration contract changed; manual security audit is required.")
    if re.search(r"\bstatus\s*:\s*['\"](?:approved|published|pending)['\"]", files["review"]):
        raise ValueError("Review client is supplying a moderation status.")
    if re.search(r"\bstatus\s*:\s*['\"](?:approved|published|pending)['\"]", files["claim"]):
        raise ValueError("Claim client is supplying a moderation status.")
    source_review = (ROOT / "lib/review-submission.ts").read_text(encoding="utf-8")
    if "firsthand_attested: draft.attested === true" not in source_review or
        "intensity: 3" in source_review:
        raise ValueError("Firsthand self-report contract changed or false intensity returned.")

    gaps: list[dict[str, object]] = []
    for name, required in CLIENT_NEEDS.items():
        if name == "public_angler_reviews":
            exists = has_view(initial, name)
            columns: set[str] = set()
        else:
            exists = create_table_body(initial, name) is not None
            columns = initial_table_columns(initial, name)
        if not exists:
            gaps.append({
                "object": name, "code": "not_defined_in_initial_scaffold",
                "needed_fields": sorted(required),
            })
        elif name != "public_angler_reviews" and required - columns:
            gaps.append({
                "object": name, "code": "fields_absent_from_initial_scaffold",
                "needed_fields": sorted(required - columns),
            })

    for name in ("guide_claims", "reviews"):
        body = create_table_body(initial, name) or ""
        if not re.search(r"\bstatus\s+text\s+not\s+null\s+default\s+'pending'", body, re.I):
            gaps.append({
                "object": name, "code": "pending_default_not_in_initial_scaffold",
            })
        if not has_insert_policy(initial, name):
            gaps.append({
                "object": name,
                "code": "no_client_insert_policy_in_initial_scaffold",
            })

    if "pointer" not in media.lower() or "do not rerun" not in media.lower():
        raise ValueError("Media migration status changed; inspect it before running migrations.")
    if "PROPOSED UNAPPLIED SCHEMA" not in fleet:
        raise ValueError("Captain fleet migration status changed; inspect before any DB operation.")
    if create_table_body(fleet, "guide_fishery_proposals") is None:
        raise ValueError("Captain fleet proposal contract changed.")

    return {
        "status": "BLOCKED_PENDING_REMOTE_SCHEMA_AND_JWT_RLS_VERIFICATION",
        "production_ready": False,
        "remote_project_accessed": False,
        "remote_schema_verified": False,
        "live_project_status_at_last_read": "INACTIVE",
        "initial_scaffold_is_live_schema": False,
        "client_integrations_inspected": observed,
        "local_scaffold_gaps": gaps,
        "media_0002": "historical_pointer_not_replayable_sql",
        "captain_0003": "unapplied_review_only",
        "claim_review_proposal": "draft_staging_only_not_migrated_or_verified",
        "activation_actions_performed": 0,
        "next_action": (
            "Owner-approved project restoration, read-only deployed schema + grants "
            "and policy inventory, isolated staging JWT role tests, then reviewed migration."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-ready", action="store_true",
                        help="Strict deployment gate: always blocked without external attestation.")
    args = parser.parse_args()
    report = risk_report()
    print(json.dumps(report, sort_keys=True, indent=2))
    if args.require_ready:
        print("BLOCKED: source inspection cannot establish deployed backend readiness.",
              file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError) as exc:
        print(f"Preflight assumptions invalid: {exc}", file=sys.stderr)
        sys.exit(3)
