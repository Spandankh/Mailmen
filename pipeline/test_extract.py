"""Checks the extraction against known values from the FY2025 report.

Run from the repo root:
    .venv/bin/python -m unittest discover pipeline
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class ExtractFY2025(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "hms.json"
            subprocess.run([sys.executable, str(ROOT / "extract_hms.py"), "--out", str(out)],
                           check=True, capture_output=True, text=True)
            cls.data = json.loads(out.read_text())

    def series(self, topic, dimension="Overall", segment=None):
        for s in self.data["series"]:
            if s["topic"] == topic and s["dimension"] == dimension and (segment is None or s["segment"] == segment):
                return s
        self.fail(f"no series {topic} / {dimension} / {segment}")

    def values(self, *args):
        return {p["year"]: p["value"] for p in self.series(*args)["points"]}

    def test_reports(self):
        fy2025 = next(r for r in self.data["reports"] if r["fiscal_year"] == 2025)
        self.assertGreater(fy2025["values"], 800)

    def test_total_mail(self):
        self.assertEqual(self.values("total_mail"), {2015: 1040.6, 2020: 837.0, 2025: 637.3})

    def test_market_volumes(self):
        self.assertEqual(self.values("correspondence"), {2015: 142.4, 2020: 125.1, 2025: 98.6})
        self.assertEqual(self.values("packages_total"), {2015: 32.1, 2020: 47.0, 2025: 41.5})

    def test_shares(self):
        self.assertEqual(self.values("bills_paid_mail_share"), {2015: 31, 2020: 21, 2025: 14})

    def test_every_point_is_cited(self):
        for s in self.data["series"]:
            for p in s["points"]:
                self.assertTrue(p["table"] and p["page"] > 0, f"{s['topic']} {p}")

    def test_demographic_breakdowns(self):
        dims = {s["dimension"] for s in self.data["series"] if s["topic"] == "correspondence"}
        self.assertLessEqual({"Age", "Income", "Education", "Homeownership", "Metro area"}, dims)

    def test_conflicting_tables_are_noted(self):
        # Table E.2 and Table 1.3 disagree on 2020 total mail; the first is kept and the clash is noted.
        self.assertTrue(any("Total household mail" in n and "2020" in n and "839" in n for n in self.data["notes"]))


if __name__ == "__main__":
    unittest.main()
