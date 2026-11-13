"""Offline, synthetic WDFW source-watch tests; no network or private credentials."""
import json
from datetime import datetime, timezone
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import chinook_wdfw_watch as w


def report(year2027="", extra2026=""):
    base = [
        ("Aug. 1", 53, 166, 38),
        ("Aug. 2", 59, 174, 25),
        ("Aug. 3", 37, 109, 19),
        ("Aug 4.", 92, 253, 90),
        ("Aug. 5", 35, 104, 45),
    ]
    rows = "".join(
        f"<tr><td>{day}</td><td>{boats}</td><td>{anglers}</td>"
        f"<td>{fish}</td><td>0</td><td>Chinook and hatchery coho</td></tr>"
        for day, boats, anglers, fish in base
    )
    return (
        "<html><head><title>WDFW report</title></head><body>"
        "<h1>Buoy 10 creel report</h1>"
        "<h2>2026</h2><table><thead><tr><th>Date</th><th>Boats</th>"
        "<th>Anglers</th><th>Chinook kept</th><th>Coho kept</th>"
        "<th>Retention allowed</th></tr></thead><tbody>"
        + rows + extra2026 +
        "</tbody></table>" + year2027 + "</body></html>"
    ).encode("utf-8")


NOW = datetime(2026, 11, 13, 12, tzinfo=timezone.utc)
AFTER_2027 = datetime(2027, 8, 5, 14, tzinfo=timezone.utc)


class ChinookWatchTests(unittest.TestCase):
    def test_first_five_real_historical_rows_pinned(self):
        candidate = w.make_candidate(report(), now=NOW)
        self.assertEqual(candidate["species"], "Chinook")
        self.assertEqual(candidate["publication_status"], "candidate_review_only")
        self.assertFalse(candidate["site_automatically_publishes_candidate"])
        self.assertFalse(candidate["model_prediction_values_included"])
        self.assertEqual(len(candidate["seasons"]), 1)
        season = candidate["seasons"][0]
        self.assertEqual(season["observed_days"], 5)
        self.assertEqual(
            sum(r["chinook_kept"] for r in season["rows"]), 217
        )
        self.assertEqual(
            sum(r["anglers"] for r in season["rows"]), 806
        )
        self.assertTrue(all(
            r["sample_status"] == "observed_unverified_regulations"
            for r in season["rows"]
        ))

    def test_source_change_only_emits_review_candidate_when_data_changes(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d, "candidate.json")
            first = w.make_candidate(report(), now=NOW)
            self.assertTrue(w.write_if_changed(path, first))
            original = path.read_bytes()
            second = w.make_candidate(report() + b"<!-- editorial update -->", now=NOW)
            self.assertFalse(w.write_if_changed(path, second))
            self.assertEqual(original, path.read_bytes())
            third = w.make_candidate(report(extra2026=(
                "<tr><td>Aug. 6</td><td>28</td><td>78</td>"
                "<td>39</td><td>7</td><td>Chinook and hatchery coho</td></tr>"
            )), now=NOW)
            self.assertTrue(w.write_if_changed(path, third))
            self.assertEqual(len(json.loads(path.read_text())["seasons"][0]["rows"]), 6)

    def test_coho_only_not_scored_as_zero_chinook(self):
        extra = ("<tr><td>Aug. 6</td><td>30</td><td>80</td>"
                 "<td>0</td><td>50</td><td>Hatchery coho</td></tr>")
        rows = w.make_candidate(report(extra2026=extra), now=NOW)["seasons"][0]["rows"]
        self.assertEqual(rows[-1]["sample_status"], "retention_closed_or_unverified")
        self.assertIsNone(rows[-1]["chinook_kept"])

    def test_valid_zero_is_observed_only_with_chinook_retention_and_sample(self):
        extra = ("<tr><td>Aug. 6</td><td>30</td><td>80</td>"
                 "<td>0</td><td>50</td><td>Hatchery Chinook and hatchery coho</td></tr>")
        rows = w.make_candidate(report(extra2026=extra), now=NOW)["seasons"][0]["rows"]
        self.assertEqual(rows[-1]["sample_status"], "observed_unverified_regulations")
        self.assertEqual(rows[-1]["chinook_kept"], 0)

    def test_no_sample_never_zero(self):
        extra = ("<tr><td>Aug. 6</td><td>—</td><td>—</td>"
                 "<td>—</td><td>—</td><td>No sample</td></tr>")
        rows = w.make_candidate(report(extra2026=extra), now=NOW)["seasons"][0]["rows"]
        self.assertEqual(rows[-1]["sample_status"], "not_sampled")
        self.assertIsNone(rows[-1]["chinook_kept"])
        self.assertIsNone(rows[-1]["anglers"])

    def test_later_2027_not_auto_published(self):
        future = (
            "<h2>2027</h2><table><tr><th>Date</th><th>Boats</th>"
            "<th>Anglers</th><th>Chinook kept</th><th>Coho kept</th>"
            "<th>Retention allowed</th></tr>"
            "<tr><td>Aug. 1</td><td>20</td><td>50</td><td>11</td>"
            "<td>0</td><td>Chinook only</td></tr>"
            "<tr><td>Aug. 5</td><td>20</td><td>50</td><td>11</td>"
            "<td>0</td><td>Chinook only</td></tr>"
            "</table>"
        )
        candidate = w.make_candidate(report(year2027=future), now=AFTER_2027)
        self.assertEqual([s["year"] for s in candidate["seasons"]], [2026, 2027])
        self.assertEqual(candidate["seasons"][1]["observed_days"], 1)
        self.assertEqual(candidate["seasons"][1]["rows"][0]["date"], "2027-08-01")
        self.assertFalse(candidate["official_sample_regulations_verified"])
        self.assertEqual(candidate["publication_status"], "candidate_review_only")

    def test_future_2027_dates_without_completed_rows_do_not_error(self):
        future = (
            "<h2>2027</h2><table><tr><th>Date</th><th>Boats</th>"
            "<th>Anglers</th><th>Chinook kept</th><th>Coho kept</th>"
            "<th>Retention allowed</th></tr>"
            "<tr><td>Aug. 1</td><td>20</td><td>50</td><td>11</td>"
            "<td>0</td><td>Chinook only</td></tr></table>"
        )
        candidate = w.make_candidate(report(year2027=future), now=NOW)
        self.assertEqual([s["year"] for s in candidate["seasons"]], [2026])

    def test_unexpected_revisions_to_known_real_rows_refused(self):
        corrupted = report().replace(
            b"<td>53</td><td>166</td><td>38</td>",
            b"<td>53</td><td>166</td><td>50</td>"
        )
        with self.assertRaisesRegex(w.SourceValidationError, "revised"):
            w.make_candidate(corrupted, now=NOW)

    def test_duplicate_dates_refused(self):
        extra = ("<tr><td>Aug. 3</td><td>30</td><td>80</td>"
                 "<td>10</td><td>50</td><td>Chinook only</td></tr>")
        with self.assertRaisesRegex(w.SourceValidationError, "Duplicate"):
            w.make_candidate(report(extra2026=extra), now=NOW)

    def test_unknown_rows_do_not_silently_disappear(self):
        extra = ("<tr><td>Fishy Tuesday</td><td>30</td><td>80</td>"
                 "<td>10</td><td>50</td><td>Chinook only</td></tr>")
        with self.assertRaisesRegex(w.SourceValidationError, "Unexpected date"):
            w.make_candidate(report(extra2026=extra), now=NOW)

    def test_malformed_columns_and_extreme_catches_quarantined(self):
        giant = ("<tr><td>Aug. 6</td><td>28</td><td>78</td>"
                 "<td>500</td><td>0</td><td>Chinook only</td></tr>")
        rows = w.make_candidate(report(extra2026=giant), now=NOW)["seasons"][0]["rows"]
        self.assertEqual(rows[-1]["sample_status"], "implausible_needs_review")
        self.assertIsNone(rows[-1]["chinook_kept"])
        with self.assertRaisesRegex(w.SourceValidationError, "columns"):
            w.make_candidate(report().replace(
                b"<th>Chinook kept</th>", b"<th>Unknown catches</th>"
            ), now=NOW)

    def test_wrong_identity_cannot_be_imported(self):
        with self.assertRaisesRegex(w.SourceValidationError, "Buoy 10"):
            w.make_candidate(report().replace(b"Buoy 10", b"unrelated fishery"), now=NOW)


if __name__ == "__main__":
    unittest.main()
