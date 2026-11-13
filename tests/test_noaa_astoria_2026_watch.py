"""NOAA Astoria August 2026 high/low source QA, entirely offline."""
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import noaa_astoria_2026_watch as n


def make_events():
    events = []
    for day in range(1, 32):
        stamp = f"2026-08-{day:02d}"
        for time, height, label in [
            ("01:00", "7.200", "H"),
            ("07:00", "1.100", "L"),
            ("13:00", "8.100", "H"),
            ("19:00", "-0.200", "L"),
        ]:
            events.append({"t": f"{stamp} {time}", "v": height, "type": label})
    return events


def payload(events=None):
    return json.dumps({"predictions": events if events is not None else make_events()}).encode()


class NOAAWatchTests(unittest.TestCase):
    def test_request_pinned_official_api_station_and_units(self):
        self.assertTrue(n.source_url().startswith("https://api.tidesandcurrents.noaa.gov/"))
        self.assertEqual(n.PARAMS["station"], "9439040")
        self.assertEqual(n.PARAMS["product"], "predictions")
        self.assertEqual(n.PARAMS["time_zone"], "lst_ldt")
        self.assertEqual(n.PARAMS["datum"], "MLLW")
        self.assertEqual(n.PARAMS["interval"], "hilo")
        self.assertEqual(n.PARAMS["units"], "english")

    def test_31_complete_civil_day_high_low_spreads(self):
        rows, events = n.parse_predictions(payload())
        self.assertEqual(len(rows), 31)
        self.assertEqual(len(events), 124)
        self.assertEqual(rows[0]["date"], "2026-08-01")
        self.assertEqual(rows[-1]["date"], "2026-08-31")
        self.assertEqual(rows[0]["highest_predicted_high_mllw_ft"], 8.1)
        self.assertEqual(rows[0]["lowest_predicted_low_mllw_ft"], -0.2)
        self.assertEqual(rows[0]["calendar_day_high_low_spread_ft"], 8.3)

    def test_provenance_restricts_to_research_candidate_no_public_or_ml_accuracy(self):
        obj = n.candidate(payload(), now=datetime(2026, 11, 13, tzinfo=timezone.utc))
        self.assertEqual(obj["publication_status"], "candidate_review_only")
        self.assertEqual(obj["station_id"], "9439040")
        self.assertFalse(obj["station_is_buoy_10"])
        self.assertFalse(obj["approved_for_public_display"])
        self.assertFalse(obj["approved_for_model_evaluation"])
        self.assertIn("not measured", obj["interpretation"])
        self.assertEqual(obj["observations_sha256"],
                         n.sha({"daily": obj["daily"], "events": obj["events"]}))

    def test_missing_day_fails_closed(self):
        raw = payload([v for v in make_events() if not v["t"].startswith("2026-08-17")])
        with self.assertRaisesRegex(n.TideDataError, "31 August"):
            n.parse_predictions(raw)

    def test_missing_low_tide_fails(self):
        events = [v for v in make_events() if not (v["t"].startswith("2026-08-10") and v["type"] == "L")]
        with self.assertRaisesRegex(n.TideDataError, "Missing high or low"):
            n.parse_predictions(payload(events))

    def test_duplicate_or_unordered_event_fails(self):
        events = make_events()
        events[4] = copy.copy(events[3])
        with self.assertRaisesRegex(n.TideDataError, "Missing/duplicate/unordered"):
            n.parse_predictions(payload(events))

    def test_wrong_year_and_unknown_tide_type_fail(self):
        changed = make_events()
        changed[4]["t"] = "2027-08-02 01:00"
        with self.assertRaisesRegex(n.TideDataError, "timestamps"):
            n.parse_predictions(payload(changed))
        changed = make_events()
        changed[5]["type"] = "unknown"
        with self.assertRaisesRegex(n.TideDataError, "event type"):
            n.parse_predictions(payload(changed))

    def test_api_error_and_unrealistic_height_fail(self):
        with self.assertRaisesRegex(n.TideDataError, "NOAA returned an error"):
            n.parse_predictions(json.dumps({"error": {"message": "bad key"}}).encode() + b" " * 200)
        changed = make_events()
        changed[1]["v"] = "-900.0"
        with self.assertRaisesRegex(n.TideDataError, "Unreasonable"):
            n.parse_predictions(payload(changed))

    def test_no_repetitive_candidate_for_same_predictions(self):
        first = n.candidate(payload(), now=datetime(2026, 11, 13, tzinfo=timezone.utc))
        second = n.candidate(payload(), now=datetime(2026, 11, 14, tzinfo=timezone.utc))
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"noaa.json"
            self.assertTrue(n.write_if_changed(path, first))
            before=path.read_bytes()
            self.assertFalse(n.write_if_changed(path, second))
            self.assertEqual(before,path.read_bytes())

    def test_source_correction_changes_digest_and_requires_review(self):
        first = n.candidate(payload(), now=datetime(2026, 11, 13, tzinfo=timezone.utc))
        changed = make_events()
        changed[0]["v"] = "7.201"
        second = n.candidate(payload(changed), now=datetime(2026, 11, 13, tzinfo=timezone.utc))
        self.assertNotEqual(first["observations_sha256"], second["observations_sha256"])


if __name__ == "__main__":
    unittest.main()
