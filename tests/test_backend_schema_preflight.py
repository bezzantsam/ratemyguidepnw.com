import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "backend_schema_preflight.py"
spec = importlib.util.spec_from_file_location("backend_schema_preflight", SCRIPT)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class BackendPreflightTests(unittest.TestCase):
    def test_reports_actual_source_gaps_without_claiming_remote_status(self):
        report = preflight.risk_report()
        self.assertEqual(
            report["status"], "BLOCKED_PENDING_REMOTE_SCHEMA_AND_JWT_RLS_VERIFICATION"
        )
        self.assertFalse(report["production_ready"])
        self.assertFalse(report["remote_project_accessed"])
        self.assertFalse(report["remote_schema_verified"])
        self.assertEqual(report["activation_actions_performed"], 0)
        self.assertEqual(report["live_project_status_at_last_read"], "INACTIVE")
        self.assertTrue(all(report["client_integrations_inspected"].values()))
        gap_codes = {(g["object"], g["code"]) for g in report["local_scaffold_gaps"]}
        self.assertIn(("claim_evidence", "not_defined_in_initial_scaffold"), gap_codes)
        self.assertIn(("public_angler_reviews", "not_defined_in_initial_scaffold"), gap_codes)
        self.assertIn(("reviews", "fields_absent_from_initial_scaffold"), gap_codes)
        self.assertIn(("reviews", "no_client_insert_policy_in_initial_scaffold"), gap_codes)
        self.assertIn(("guide_claims", "no_client_insert_policy_in_initial_scaffold"), gap_codes)
        review_gaps = [
            g for g in report["local_scaffold_gaps"]
            if g["object"] == "reviews" and "needed_fields" in g
        ]
        self.assertEqual(len(review_gaps), 1)
        self.assertIn("communication", review_gaps[0]["needed_fields"])
        self.assertIn("value_rating", review_gaps[0]["needed_fields"])
        self.assertIn("trip_context", review_gaps[0]["needed_fields"])

    def test_parses_columns_from_declaration_not_unrelated_sql(self):
        sql = """
        create table public.reviews (
          id uuid primary key,
          guide_id uuid not null,
          quality smallint not null,
          status text not null
        );
        select communication, trip_context from public.reviews;
        """
        self.assertEqual(preflight.initial_table_columns(sql, "reviews"),
                         {"id", "guide_id", "quality", "status"})
        self.assertEqual(preflight.initial_table_columns(sql, "claim_evidence"), set())

    def test_requires_explicit_insert_policies(self):
        scaffold = """
        create policy public_reviews on public.reviews for select using(status='published');
        create policy owners_can_insert on public.reviews for insert to authenticated
          with check (author_id=auth.uid());
        """
        self.assertTrue(preflight.has_insert_policy(scaffold, "reviews"))
        self.assertFalse(preflight.has_insert_policy(scaffold, "guide_claims"))
        self.assertFalse(preflight.has_insert_policy(
            "create policy visible on public.reviews for select using(true);", "reviews"
        ))

    def test_readonly_cli_does_not_use_supabase_network(self):
        result = subprocess.run([sys.executable, str(SCRIPT)],
                                text=True, check=True, capture_output=True)
        report = json.loads(result.stdout)
        self.assertFalse(report["production_ready"])
        self.assertFalse(report["remote_schema_verified"])
        self.assertGreaterEqual(len(report["local_scaffold_gaps"]), 5)
        source = SCRIPT.read_text(encoding="utf-8")
        for forbidden in ("supabase create", "apply_migration", "execute_sql",
                          "import requests", "import httpx", "subprocess.run([""supabase"""):
            self.assertNotIn(forbidden, source)

    def test_strict_release_gate_fails_closed(self):
        result = subprocess.run([sys.executable, str(SCRIPT), "--require-ready"],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("BLOCKED", result.stderr)
        self.assertIn('"production_ready": false', result.stdout)

    def test_client_cannot_set_review_or_claim_status_and_db_has_pending_default(self):
        report = preflight.risk_report()
        self.assertTrue(report["client_integrations_inspected"]["pending_review_write"])
        reviews = (ROOT / "lib/review-submission.ts").read_text()
        claims = (ROOT / "components/ClaimForm.tsx").read_text()
        self.assertNotIn("status: 'pending'", reviews)
        self.assertNotIn("status:'pending'", claims)
        self.assertNotIn("status:'approved'", claims)
        schema = (ROOT / "supabase/migrations/0001_initial.sql").read_text()
        for table in ("reviews", "guide_claims"):
            declaration = preflight.create_table_body(schema, table)
            self.assertIsNotNone(declaration)
            self.assertRegex(declaration, r"status\s+text\s+not\s+null\s+default\s+'pending'")

    def test_audit_cannot_be_silently_satisfied_by_pointer_or_draft_migration(self):
        report = preflight.risk_report()
        self.assertEqual(report["media_0002"], "historical_pointer_not_replayable_sql")
        self.assertEqual(report["captain_0003"], "unapplied_review_only")
        self.assertFalse(report["initial_scaffold_is_live_schema"])


if __name__ == "__main__":
    unittest.main()
