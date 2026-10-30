import { useMemo, useState } from "react";
import { data, fmt, topicById } from "../lib/data";
import { Card, csvCell, download } from "../components/ui";
import { ReportManager } from "../components/ReportManager";

export function DataView() {
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      data.series.flatMap((s) =>
        s.points.map((p) => ({ topic: topicById[s.topic], dimension: s.dimension, segment: s.segment, ...p })),
      ),
    [],
  );
  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter((r) => {
      const hay = `${r.topic.label} ${r.topic.market} ${r.dimension} ${r.segment} ${r.year} table ${r.table}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [q, rows]);

  const exportCsv = () => {
    const head = ["market", "topic", "unit", "dimension", "segment", "fiscal_year", "value", "report", "table", "page"];
    const body = filtered.map((r) => [r.topic.market, r.topic.label, r.topic.unit, r.dimension, r.segment, r.year, r.value, `FY${r.report}`, r.table, r.page]);
    download("household_mail_survey.csv", [head, ...body].map((r) => r.map(csvCell).join(",")).join("\n"));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Reports loaded">
          <ReportManager />
        </Card>
        <Card title="Data notes" className="md:col-span-2">
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
            {data.notes.map((n, i) => <li key={i}>{n}</li>)}
            {data.warnings.map((n, i) => <li key={`w${i}`}>{n}</li>)}
            <li>Every row's printed “% change” columns were checked against the levels during extraction; mismatches beyond rounding are listed here.</li>
            <li>Volumes are pieces per household per year (weekly diary × 52, averaged over four quarters). Shares exclude households that did not answer.</li>
          </ul>
        </Card>
      </div>

      <Card
        title="All values"
        subtitle={`${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} values`}
        actions={<button className="btn" onClick={exportCsv}>Download CSV</button>}
      >
        <input
          className="select mb-3 w-full bg-none"
          style={{ backgroundImage: "none", paddingRight: 12 }}
          placeholder="Filter — try “packages age”, “2015 income” or “Table A-9”"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Filter values"
        />
        <div className="-mx-1 max-h-[560px] overflow-auto">
          <table className="data">
            <thead className="sticky top-0" style={{ background: "var(--surface)" }}>
              <tr>
                <th>Topic</th><th>Breakdown</th><th>Group</th><th className="num">FY</th><th className="num">Value</th><th>Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 600).map((r, i) => (
                <tr key={i}>
                  <td className="text-ink">{r.topic.label}</td>
                  <td>{r.dimension}</td>
                  <td>{r.segment}</td>
                  <td className="num">{r.year}</td>
                  <td className="num">{fmt(r.value, r.topic.unit)}</td>
                  <td className="whitespace-nowrap text-muted">FY{r.report} report · Table {r.table} · p.{r.page}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 600 && <p className="p-3 text-[12px] text-muted">Showing the first 600 rows. Narrow the filter or download the CSV for everything.</p>}
        </div>
      </Card>
    </div>
  );
}
