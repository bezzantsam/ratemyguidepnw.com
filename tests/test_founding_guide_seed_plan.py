import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/founding_guide_seed_plan.py"
spec = importlib.util.spec_from_file_location("founding_guide_seed_plan", SOURCE)
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)


class FoundingGuideSeedPlanTests(unittest.TestCase):
    def test_empty_template_does_not_write_or_invite_anyone(self):
        template = ROOT / "research/founding-guide-selection.template.json"
        value = json.loads(template.read_text())
        self.assertEqual(value, {"market_id": "pnw", "selected_public_ids": []})
        result = subprocess.run([sys.executable, str(SOURCE)],
                                capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        self.assertEqual(data["selected_count"], 0)
        self.assertEqual(data["mode"], "plan_only_no_outreach_or_publication")

    def test_historical_oregon_registration_suffixes_preserve_public_identity(self):
        existing = seed.known_public_records()
        for public_id, name in [
            ("OG.0000484.BRO", "Martin Sheppard"),
            ("OG.0001225.F&F", "Scott Cook"),
            ("OG.0001399.DJFL", "David Jones"),
            ("OG.0001583.SRA", "Justin Luther"),
            ("OG.0003194.SG", "Scott Cook"),
        ]:
            with self.subTest(public_id=public_id):
                self.assertIn(public_id, existing)
                self.assertEqual(existing[public_id]["registered_name"], name)
                plan = seed.build_plan({"market_id": "pnw", "selected_public_ids": [public_id]})
                self.assertEqual(plan["profiles"][0]["existing_public_id"], public_id)
                self.assertEqual(plan["profiles"][0]["jurisdiction"], "US-OR")
                self.assertEqual(plan["profiles"][0]["existing_profile_href"],
                                 "/guides/" + seed.re.sub(r"[^a-z0-9]+", "-", public_id.lower()).strip("-"))

    def test_proven_public_profiles_are_distinct_and_wa_suppressed_records_stay_out(self):
        existing = seed.known_public_records()
        self.assertGreater(len(existing), 1000)
        self.assertEqual(existing["OG.0000053"]["registered_name"], "Casey Weigel")
        self.assertEqual(existing["wa-005"]["registered_name"], "Andy Lockey")
        self.assertEqual(existing["wa-062"]["registered_name"], "Neils Humphries")
        self.assertEqual(existing["wa-050"]["registered_name"], "Mark Coleman")
        self.assertEqual(existing["wa-059"]["registered_name"], "Mitchell Coleman")
        self.assertNotIn("wa-153-forged", existing)
        # WA Nicholas Ney was explicitly curated into OR and hidden from distinct WA URLs
        raw_ids = json.loads((ROOT / "lib/washington-stable-ids.json").read_text())
        raw_key = json.dumps(["nicholas ney", "neys fishing adventures", "wsga"],
                             separators=(",", ":"))
        self.assertIn(raw_key, raw_ids)
        self.assertNotIn(raw_ids[raw_key], existing)
        self.assertEqual(existing["OG.0000053"]["jurisdiction"], "US-OR")
        self.assertEqual(existing["wa-005"]["jurisdiction"], "US-WA")

    def test_founder_selection_never_claims_friendship_approval_or_current_license(self):
        plan = seed.build_plan({
            "market_id": "pnw", "selected_public_ids": ["OG.0000315", "wa-005"]
        }, generated_at="2026-11-14T04:00:00+00:00")
        self.assertEqual(plan["selected_count"], 2)
        self.assertFalse(plan["outreach_performed"])
        self.assertFalse(plan["publication_performed"])
        self.assertEqual(plan["status"], "private_local_review_plan_not_a_live_directory_update")
        records = plan["profiles"]
        self.assertEqual(records[0]["existing_public_id"], "OG.0000315")
        self.assertEqual(records[0]["existing_profile_href"], "/guides/og-0000315")
        self.assertEqual(records[0]["claim_route_after_backend_activation"], "/claim/OG.0000315")
        self.assertEqual(records[1]["existing_profile_href"], "/washington/wa-005")
        self.assertEqual(records[1]["global_source_record_key"], "US:US-WA:wa-005")
        for profile in records:
            self.assertEqual(profile["invitation_status"], "not_contacted_no_consent_claimed")
            self.assertEqual(profile["ownership_status"], "not_verified")
            self.assertEqual(profile["editing_rights"], "no_access_granted")
            self.assertEqual(profile["publication_action"], "none")
            self.assertEqual(profile["owner_provided_vessels"], [])
            self.assertEqual(profile["owner_provided_seasonal_packages"], [])
            self.assertTrue(profile["editorial_checklist"])
        full = json.dumps(plan)
        self.assertNotIn('"founder_friend": true', full)
        self.assertNotIn('"approved": true', full)
        self.assertNotIn('"license_verified": true', full)
        self.assertNotIn('"actual_bookings"', full)
        self.assertNotIn('"review_score"', full)

    def test_existing_pilot_public_evidence_is_provenance_not_a_verified_trip(self):
        plan = seed.build_plan({"market_id": "pnw", "selected_public_ids": ["OG.0000315"]})
        mentions = plan["profiles"][0]["source_linked_mentions_for_editor_review"]
        self.assertGreater(len(mentions), 0)
        for row in mentions:
            self.assertIn(row["mentioned_waterway"], ["Buoy 10", "Columbia River",
                                                         "Willamette River", "Tillamook Bay"])
            self.assertEqual(row["interpretation"],
                             "historically_editorial_source_link_not_confirmed_current_trip")
            self.assertEqual(row["source_type"], "operator_site")
            self.assertTrue(row["source_url"].startswith("https://"))
        wa = seed.build_plan({"market_id": "pnw", "selected_public_ids": ["wa-005"]})
        self.assertEqual(wa["profiles"][0]["source_linked_mentions_for_editor_review"], [])

    def test_shared_outfitter_is_a_research_hint_not_a_person_merge(self):
        plan = seed.build_plan({
            "market_id": "pnw", "selected_public_ids": ["wa-005", "wa-062"]
        })
        andy, neils = plan["profiles"]
        self.assertNotEqual(andy["global_source_record_key"], neils["global_source_record_key"])
        self.assertEqual(andy["identity_review_hints"][0]["other_public_id"], "wa-062")
        self.assertEqual(andy["identity_review_hints"][0]["reason"],
                         "shared_imported_business_name")
        self.assertEqual(neils["identity_review_hints"][0]["other_public_id"], "wa-005")
        self.assertIn("never_merge", andy["identity_review_hints"][0]["instruction"])

    def test_selection_rejects_unmatched_missing_duplicates_and_synthetic_records(self):
        valid = {"market_id": "pnw", "selected_public_ids": ["OG.0000315"]}
        markets = seed.validate_market_config()
        known = seed.known_public_records()
        bad = [
            {"market_id": "pnw", "selected_public_ids": ["OG.9999999"]},
            {"market_id": "pnw", "selected_public_ids": ["wa-999"]},
            {"market_id": "pnw", "selected_public_ids": ["wa-000000fake"]},
            {"market_id": "pnw", "selected_public_ids": ["OG.0000315", "OG.0000315"]},
            {"market_id": "pnw", "selected_public_ids": ["OG.0000315"] * 16},
            {"market_id": "us-all", "selected_public_ids": ["OG.0000315"]},
            {"market_id": "pnw", "selected_public_ids": [{"id": "OG.0000315"}]},
            {"market_id": "pnw", "selected_public_ids": "OG.0000315"},
            {**valid, "captain_consented": True},
        ]
        for sample in bad:
            with self.subTest(sample=sample):
                with self.assertRaises(seed.SeedError):
                    seed.validate_selection(sample, markets, known)

    def test_market_adapters_require_unverified_sources_and_mapped_jurisdiction(self):
        markets = seed.validate_market_config()
        self.assertEqual(markets["markets"]["pnw"]["jurisdictions"], ["US-OR", "US-WA"])
        self.assertFalse(markets["source_adapters"]["US-OR"]["live_credential_verified"])
        self.assertFalse(markets["source_adapters"]["US-WA"]["live_credential_verified"])
        tampered = json.loads((ROOT / "research/market-adapters.json").read_text())
        tampered["source_adapters"]["US-WA"]["live_credential_verified"] = True
        with patch.object(seed, "MARKETS", ROOT / "research/does-not-exist.json"):
            with self.assertRaises(FileNotFoundError):
                seed.validate_market_config()
        with tempfile.TemporaryDirectory() as temp:
            candidate = Path(temp) / "markets.json"
            candidate.write_text(json.dumps(tampered))
            with patch.object(seed, "MARKETS", candidate):
                with self.assertRaises(seed.SeedError):
                    seed.validate_market_config()

    def test_private_output_rejects_path_traversal_and_symlinks(self):
        for value in ["/tmp/public.json", "../leak.json", "public/export.json",
                      "research-drafts/../../public.json", "research-drafts/../public.json"]:
            with self.subTest(value=value):
                with self.assertRaises(seed.SeedError):
                    seed.private_output_path(value)
        safe = seed.private_output_path("research-drafts/founder-seed.json")
        self.assertTrue(str(safe).startswith(str(ROOT / "research-drafts")))

    def test_offline_end_to_end_draft_write_never_changes_source_or_public_data(self):
        drafts = ROOT / "research-drafts"
        drafts.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=drafts) as temp:
            selection = Path(temp) / "selected.json"
            output = Path(temp) / "private-plan.json"
            selection.write_text(json.dumps({
                "market_id": "pnw", "selected_public_ids": ["OG.0000315", "wa-005"]
            }))
            rel_output = str(output.relative_to(ROOT))
            result = subprocess.run([
                sys.executable, str(SOURCE), "--selection", str(selection),
                "--write-draft", "--output", rel_output
            ], capture_output=True, text=True, cwd=ROOT, check=True)
            printed = json.loads(result.stdout)
            self.assertEqual(printed["published"], 0)
            self.assertEqual(printed["invites_sent"], 0)
            self.assertTrue(output.exists())
            actual = json.loads(output.read_text())
            self.assertEqual(actual["selected_count"], 2)
            self.assertTrue(all(p["publication_action"] == "none" for p in actual["profiles"]))
            self.assertNotIn("source_html", json.dumps(actual))
            self.assertNotIn("scraped_bio", json.dumps(actual))
            self.assertNotIn("personal_email", json.dumps(actual))

    def test_no_remote_mutation_outreach_or_social_scraping(self):
        source = SOURCE.read_text()
        workflow = (ROOT / ".github/workflows/site-build.yml").read_text()
        ignored = (ROOT / ".gitignore").read_text()
        self.assertIn("research-drafts/", ignored)
        for word in ["import requests", "import httpx", "import supabase",
                     "import boto3", "from urllib.request import urlopen",
                     "smtp", "send_email(", "apply_migration(", "verified_trip=True"]:
            self.assertNotIn(word, source)
        self.assertNotIn("founding_guide_seed_plan.py --write-draft", workflow)


if __name__ == "__main__":
    unittest.main()
