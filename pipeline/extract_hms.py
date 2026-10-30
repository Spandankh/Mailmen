"""Extract Household Mail Survey tables from report PDFs into the dashboard dataset.

Usage:
    python pipeline/extract_hms.py                 # all PDFs in pipeline/reports/
    python pipeline/extract_hms.py --out web/src/data/hms.json

Reports must be named hms_fyYYYY.pdf. Newer reports win when two reports give a
value for the same series and year (later reports restate earlier years).
Every value keeps its source table and page so the dashboard can cite it.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

from tables import TABLES, TOPICS

ROOT = Path(__file__).resolve().parent
NUM = re.compile(r"^-?[\d,]*\.?\d+%?$")
YEAR = re.compile(r"^(19|20)\d\d$")
PAGE_HEADER = re.compile(r"H O U S E H O L D\s+M A I L|^\s*=== PAGE")
FOOTNOTE = re.compile(r"(?<=[A-Za-z])\d$")
OVERALL = ("Overall", "All households")


def read_lines(pdf: Path) -> list[tuple[int, str]]:
    """Return (page_number, line) for every text line in the report."""
    out = []
    for i, page in enumerate(PdfReader(str(pdf)).pages, start=1):
        for line in (page.extract_text() or "").splitlines():
            out.append((i, line))
    return out


def table_block(lines, table_id):
    """Lines between 'Table <id>:' (not the table of contents) and its 'Source:' line."""
    start = None
    for idx, (_, line) in enumerate(lines):
        if line.startswith(f"Table {table_id}:") and "...." not in line:
            start = idx
            break
    if start is None:
        return None, None
    block = []
    for page, line in lines[start + 1:]:
        if line.strip().startswith("Source:"):
            break
        if PAGE_HEADER.search(line):
            continue
        block.append(line)
    return lines[start][0], block


def to_number(tok: str):
    pct = tok.endswith("%")
    return float(tok.rstrip("%").replace(",", "")), pct


def split_row(line: str, ncols: int):
    """Split 'Label 1.0 2.0 3%' into (label, [numbers]). Extra leading numbers stay in the label."""
    toks = line.split()
    n = 0
    while n < len(toks) and NUM.match(toks[-1 - n]):
        n += 1
    if n == 0:
        return line.strip(), []
    if n > ncols:  # e.g. "Under 45 116.7 87.5 71.5 -39% -18%"
        n = ncols
    label = " ".join(toks[: len(toks) - n])
    return FOOTNOTE.sub("", label).strip(), toks[len(toks) - n:]


def parse_table(cfg, lines, fiscal_year, warnings):
    page, block = table_block(lines, cfg["id"])
    if block is None:
        warnings.append(f"FY{fiscal_year}: Table {cfg['id']} not found")
        return []

    years_mode = cfg["mode"] == "years"
    if years_mode:
        hdr_idx = next((i for i, l in enumerate(block) if sum(bool(YEAR.match(t)) for t in l.split()) >= 2), None)
        if hdr_idx is None:
            warnings.append(f"FY{fiscal_year}: Table {cfg['id']} has no year header")
            return []
        header = block[hdr_idx]
        years = []
        for t in header.split():
            if YEAR.match(t) and int(t) not in years:
                years.append(int(t))
        ncols = len(years) + (2 if "change" in header.lower() else 0)
        body = block[hdr_idx + 1:]
    else:
        years = [fiscal_year]
        ncols = len(cfg["columns"])
        body = block

    groups = cfg.get("groups", {})
    role = cfg.get("group_role", "dimension")
    rename = cfg.get("rename", {})
    row_topics = cfg.get("row_topics", {})
    include, skip = cfg.get("include"), set(cfg.get("skip", []))

    cur = {"dimension": cfg.get("dimension"), "topic": cfg.get("topic"), "segment": None}
    pending = ""
    rows = []
    for raw in body:
        text = FOOTNOTE.sub("", raw.strip())
        if not text:
            continue
        if cfg.get("stop") and text.startswith(cfg["stop"]):
            break
        if text in groups:
            cur[role] = groups[text]
            pending = ""
            continue
        label, toks = split_row(text, ncols)
        if not toks:
            pending = label
            continue
        if pending and label[:1].islower():  # wrapped label, e.g. "Some college or technical / school graduate"
            label = f"{pending} {label}"
        pending = ""
        if label in skip or (include and label not in include and label != cfg.get("total")):
            continue

        values = [to_number(t) for t in toks]
        if years_mode:
            yvals = values[: len(years)]
            check_changes(cfg, fiscal_year, label, years, yvals, values[len(years):], warnings)
            targets = [(row_topics.get(label, cur["topic"]), [(y, v) for y, (v, _) in zip(years, yvals)])]
        else:
            targets = [(col, [(fiscal_year, values[i][0])]) for i, col in enumerate(cfg["columns"])
                       if col and i < len(values)]

        if label == cfg.get("total"):
            dimension, segment = OVERALL
        elif role == "segment":
            dimension, segment = cur["dimension"], cur["segment"]
            if segment == "All households":
                dimension = "Overall"
        elif label in row_topics:
            dimension, segment = OVERALL
        else:
            dimension, segment = cur["dimension"] or "Overall", rename.get(label, label)

        for topic, pts in targets:
            if not topic:
                continue
            for year, value in pts:
                rows.append(dict(topic=topic, dimension=dimension, segment=segment, year=year, value=value,
                                 source=dict(report=fiscal_year, table=cfg["id"], page=page)))
    if not rows:
        warnings.append(f"FY{fiscal_year}: Table {cfg['id']} produced no rows")
    return rows


def check_changes(cfg, fiscal_year, label, years, yvals, changes, warnings):
    """Compare the report's printed '% change' columns with values computed from the levels."""
    if len(changes) != 2 or len(years) < 3 or any(p for _, p in yvals):
        return
    first, mid, last = yvals[0][0], yvals[-2][0], yvals[-1][0]
    for base, (printed, _) in zip((first, mid), changes):
        if base == 0:
            continue
        # Levels are printed to 0.1, so allow for rounding of both numbers.
        lo = ((last - 0.05) / (base + 0.05) - 1) * 100
        hi = ((last + 0.05) / max(base - 0.05, 1e-9) - 1) * 100
        computed = (last / base - 1) * 100
        if not (lo - 1.0 <= printed <= hi + 1.0):
            warnings.append(f"FY{fiscal_year}: Table {cfg['id']} '{label}': printed {printed:+.0f}% "
                            f"vs computed {computed:+.1f}%")


def merge(all_rows, notes):
    """Collapse rows into series. Later reports override earlier ones; duplicates inside a report keep the first."""
    best = {}
    for r in sorted(all_rows, key=lambda r: -r["source"]["report"]):
        key = (r["topic"], r["dimension"], r["segment"], r["year"])
        if key in best:
            prev = best[key]
            if abs(prev["value"] - r["value"]) > 1e-9:
                notes.append(f"{TOPICS[r['topic']]['label']} / {r['segment']} / {r['year']}: "
                             f"Table {prev['source']['table']} gives {prev['value']:g}, "
                             f"Table {r['source']['table']} (FY{r['source']['report']}) gives {r['value']:g}; "
                             f"kept {prev['value']:g}")
            continue
        best[key] = r
    series = {}
    for (topic, dim, seg, year), r in best.items():
        s = series.setdefault((topic, dim, seg), dict(topic=topic, dimension=dim, segment=seg, points=[]))
        s["points"].append(dict(year=year, value=r["value"], **r["source"]))
    out = list(series.values())
    for s in out:
        s["points"].sort(key=lambda p: p["year"])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reports", default=str(ROOT / "reports"))
    ap.add_argument("--out", default=str(ROOT.parent / "web" / "src" / "data" / "hms.json"))
    args = ap.parse_args()

    pdfs = sorted(Path(args.reports).glob("hms_fy*.pdf"))
    if not pdfs:
        sys.exit(f"No hms_fyYYYY.pdf files in {args.reports}")

    rows, warnings, reports = [], [], []
    for pdf in pdfs:
        fy = int(re.search(r"fy(\d{4})", pdf.name).group(1))
        lines = read_lines(pdf)
        before = len(rows)
        for cfg in TABLES:
            rows.extend(parse_table(cfg, lines, fy, warnings))
        reports.append(dict(fiscal_year=fy, file=pdf.name, values=len(rows) - before))
        print(f"{pdf.name}: {len(rows) - before} values")

    notes = []
    series = merge(rows, notes)
    used = {s["topic"] for s in series}
    data = dict(
        generated_at=dt.datetime.now().isoformat(timespec="seconds"),
        reports=reports,
        topics={k: v for k, v in TOPICS.items() if k in used},
        series=series,
        notes=notes,
        warnings=warnings,
    )
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(data, indent=1, ensure_ascii=False))
    print(f"{len(series)} series, {len(used)} topics -> {args.out}")
    for w in warnings + notes:
        print("  !", w)


if __name__ == "__main__":
    main()
