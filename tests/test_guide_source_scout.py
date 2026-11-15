import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
from datetime import datetime, timezone

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "guide_source_scout.py"
spec = importlib.util.spec_from_file_location("guide_source_scout", SOURCE)
scout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scout)


def entry(guide="OG.0000315", url="https://www.fastactionfishing.com/"):
    from urllib.parse import urlsplit
    return {
        "guide_id": guide,
        "source_url": url,
        "allowed_host": urlsplit(url).hostname,
        "terms_reviewed_on": "2026-11-13",
        "approved_to_fetch": True,
    }


def fake_site(robots="User-agent: *\nAllow: /\n",
              html="<html><body>Buoy 10 Chinook and Coho fishing.</body></html>"):
    called = []

    def fetch(url, max_bytes):
        called.append((url, max_bytes))
        if url.endswith("/robots.txt"):
            return robots.encode()
        return html.encode()
    return fetch, called


class ScoutSafetyTests(unittest.TestCase):
    def test_manifest_defaults_are_not_approved(self):
        p = Path(__file__).resolve().parents[1] / "research" / "guide-source-manifest.json"
        rows = scout.validate_manifest(json.loads(p.read_text()))
        self.assertTrue(rows)
        self.assertTrue(all(not x["approved_to_fetch"] for x in rows))
        self.assertTrue(all(x["terms_reviewed_on"] is None for x in rows))

    def test_plan_only_never_requests_web_pages(self):
        completed = subprocess.run(
            [sys.executable, str(SOURCE),
             "--manifest", str(Path(__file__).resolve().parents[1] /
                               "research" / "guide-source-manifest.json")],
            check=True, capture_output=True, text=True
        )
        data = json.loads(completed.stdout)
        self.assertEqual(data["mode"], "plan_only_no_network")
        self.assertEqual(data["approved_for_future_fetch"], 0)
        self.assertEqual(data["total_sources"], 3)

    def test_explicit_approval_and_date_required(self):
        row = entry()
        row["approved_to_fetch"] = True
        row["terms_reviewed_on"] = None
        with self.assertRaises(scout.ScoutError):
            scout.validate_manifest([row])
        row["terms_reviewed_on"] = "2099-01-01"
        with self.assertRaises(scout.ScoutError):
            scout.validate_manifest([row])
        row["terms_reviewed_on"] = "2026-11-13"
        self.assertEqual(len(scout.validate_manifest([row])), 1)
        row["unsourced_rating"] = 5
        with self.assertRaises(scout.ScoutError):
            scout.validate_manifest([row])

    def test_social_media_and_private_hosts_are_blocked_even_with_approval(self):
        for url in [
            "https://www.facebook.com/fastaction/",
            "https://instagram.com/guide",
            "https://www.threads.net/guide",
            "https://tiktok.com/guide",
            "https://localhost/guide",
            "https://127.0.0.1/guide",
            "http://www.fastactionfishing.com/",
            "https://private.example.com:8080/guide",
            "https://user:password@private.example.com/",
            "https://private.example.com/path?token=secret",
            "https://private.example.com/../../internal",
        ]:
            with self.subTest(url=url):
                with self.assertRaises(scout.ScoutError):
                    scout.validate_manifest([entry(url=url)])

    def test_no_host_mismatch_or_overbroad_crawl(self):
        mismatch = entry()
        mismatch["allowed_host"] = "other.example.com"
        with self.assertRaises(scout.ScoutError):
            scout.validate_manifest([mismatch])
        three = [
            entry("OG.0000001", "https://example.com/a"),
            entry("OG.0000002", "https://example.com/b"),
            entry("OG.0000003", "https://example.com/c"),
        ]
        with self.assertRaises(scout.ScoutError):
            scout.validate_manifest(three)
        with self.assertRaises(scout.ScoutError):
            scout.validate_manifest([entry()] * 16)

    def test_no_fetch_when_permission_or_robots_disallows(self):
        row = entry()
        row["approved_to_fetch"] = False
        fetch, calls = fake_site()
        result = scout.scout([row], fetch)
        self.assertEqual(result[0]["status"], "skipped_no_permission")
        self.assertEqual(calls, [])

        robots_disallow, calls_disallow = fake_site(
            "User-agent: *\nDisallow: /\n")
        result = scout.scout([entry()], robots_disallow)
        self.assertEqual(result[0]["status"], "skipped_robots_or_unavailable")
        self.assertEqual(len(calls_disallow), 1)
        self.assertTrue(calls_disallow[0][0].endswith("/robots.txt"))

    def test_robots_unavailable_fails_closed(self):
        def fetch(url, max_bytes):
            raise scout.ScoutError("missing robots file")
        result = scout.scout([entry()], fetch)
        self.assertEqual(result[0]["status"], "skipped_robots_or_unavailable")

    def test_mentions_are_unverified_not_confirmed_trips(self):
        html = """
          <html><head><title>Sample Guide</title></head>
          <body>
            <nav>Secret Chinook items</nav>
            We no longer fish Buoy 10, but might mention Chinook in a FAQ.
            Our phone is 503-555-0148 and our bio is the copyrightable
            AMAZING GOLDEN CANYON CAPTAIN PERSPECTIVE written in 2026.
            <script>Coho Nehalem Bay Halibut</script>
            <p>Willamette River Sturgeon guide overview.</p>
          </body></html>
        """
        fetch, _ = fake_site(html=html)
        at = datetime(2026, 11, 14, 3, 0, tzinfo=timezone.utc)
        result = scout.scout([entry()], fetch, now=at)[0]
        self.assertEqual(result["status"], "needs_human_review")
        self.assertEqual(result["publication_state"], "unpublished_research_only")
        self.assertEqual(result["source_type"], "operator_website")
        self.assertIn("Buoy 10", result["candidate_mentions_not_offerings"]["waterway"])
        self.assertIn("Chinook", result["candidate_mentions_not_offerings"]["species"])
        self.assertIn("Sturgeon", result["candidate_mentions_not_offerings"]["species"])
        self.assertNotIn("Coho", result["candidate_mentions_not_offerings"]["species"])
        self.assertNotIn("Halibut", result["candidate_mentions_not_offerings"]["species"])
        self.assertNotIn("Nehalem Bay", result["candidate_mentions_not_offerings"]["waterway"])
        serialized = json.dumps(result)
        self.assertNotIn("503-555-0148", serialized)
        self.assertNotIn("AMAZING GOLDEN CANYON", serialized)
        self.assertNotIn("copyrightable", serialized)
        self.assertNotIn("verified_license", serialized)
        self.assertNotIn("approved", result.keys())
        self.assertRegex(result["content_sha256"], r"^[a-f0-9]{64}$")

    def test_rate_limit_on_same_host_and_no_cross_domain_redirects(self):
        one = entry("OG.0000001", "https://example.com/one")
        two = entry("OG.0000002", "https://example.com/two")
        fetch, calls = fake_site()
        waits = []
        result = scout.scout([one, two], fetch, sleep=waits.append)
        self.assertEqual(len(result), 2)
        self.assertEqual(len(waits), 1)
        self.assertGreaterEqual(waits[0], 3)
        self.assertEqual(len(calls), 4)  # robots+explicit page per row
        self.assertIsNone(scout.NoRedirects().redirect_request(
            None, None, 302, "Moved", {}, "https://evil.example/candidate"
        ))

    def test_private_output_only(self):
        self.assertEqual(
            str(scout.private_output_path("research-drafts/review.json")),
            "research-drafts/review.json",
        )
        for path in ["/tmp/guide.json", "../notes.json",
                     "data/public.json", "research-drafts/../../public.json"]:
            with self.subTest(path=path):
                with self.assertRaises(scout.ScoutError):
                    scout.private_output_path(path)

    def test_no_automatic_publication_or_copies_in_integration(self):
        root = Path(__file__).resolve().parents[1]
        script = SOURCE.read_text()
        ignored = (root / ".gitignore").read_text()
        workflow = (root / ".github/workflows/site-build.yml").read_text()
        self.assertIn("research-drafts/", ignored)
        self.assertNotIn("guide_source_scout.py --fetch", workflow)
        self.assertNotIn("guide_fishery_proposals", script)
        self.assertNotIn("supabase", script.lower())
        self.assertNotIn("meta_description", script.lower())
        self.assertNotIn("download_image", script.lower())


if __name__ == "__main__":
    unittest.main()
