import { useState } from "react";
import { CAVEATS, DEMOGRAPHICS, allYears, firstYear, fmt, lastYear, overall, seriesFor, topicById } from "../lib/data";
import { changeOf } from "../lib/trends";
import { formatChange } from "../lib/narrative";
import { Card, Segmented, type Go } from "../components/ui";

const COLUMNS = [
  { topic: "correspondence", label: "Correspondence" },
  { topic: "transactions", label: "Transactions" },
  { topic: "advertising", label: "Advertising" },
  { topic: "periodicals", label: "Periodicals" },
  { topic: "packages_received", label: "Packages received" },
  { topic: "packages_sent", label: "Packages sent" },
  { topic: "bills_received_mail_share", label: "Bills received by mail" },
  { topic: "bills_paid_mail_share", label: "Bills paid by mail" },
];

type Mode = "change" | "level";

/** Diverging fill: negative → red, positive → blue, mixed with a neutral midpoint in OKLab. */
function fill(x: number, domain: number) {
  const k = Math.max(-1, Math.min(1, x / domain));
  const pct = Math.round(Math.abs(k) * 100);
  const pole = k < 0 ? "var(--div-neg)" : "var(--div-pos)";
  return { background: `color-mix(in oklab, ${pole} ${pct}%, var(--div-mid))`, strong: Math.abs(k) > 0.6 };
}

export function Demographics({ go }: { go: Go }) {
  const [mode, setMode] = useState<Mode>("change");
  const [from, setFrom] = useState(firstYear);
  const to = lastYear;
  const periods = allYears.filter((y) => y < to).map((y) => ({ value: y, label: `${y} → ${to}` }));

  const value = (topic: string, dim: string, segment: string): { v: number; label: string; title: string } | null => {
    const t = topicById[topic];
    const s = seriesFor(topic, dim).find((x) => x.segment === segment);
    const a = s?.points.find((p) => p.year === from);
    const b = s?.points.find((p) => p.year === to);
    if (!s || !a || !b) return null;
    if (mode === "change") {
      const c = changeOf(t.unit, a.value, b.value);
      // Shares chart in points, volumes in percent, so both fit one ±domain colour scale.
      const v = t.unit === "percent" ? c : c * 100;
      const label = `${v > 0 ? "+" : ""}${v.toFixed(0)}${t.unit === "percent" ? "" : "%"}`;
      return { v, label, title: `${fmt(a.value, t.unit)} → ${fmt(b.value, t.unit)}${t.unit === "pieces" ? " pieces" : ""} (${formatChange(t.unit, c)})` };
    }
    const all = overall(topic)?.points.find((p) => p.year === to);
    if (!all) return null;
    const idx = (b.value / all.value) * 100 - 100;
    return { v: idx, label: `${(idx + 100).toFixed(0)}`, title: `${fmt(b.value, t.unit)} vs ${fmt(all.value, t.unit)} for all households (index ${(idx + 100).toFixed(0)})` };
  };

  const domain = mode === "change" ? 60 : 50;

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Who is changing fastest?</h2>
          <p className="text-[13px] text-muted">Each cell is one household group in one mail market. Click a cell to open its trend.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Segmented label="Measure" value={mode} onChange={setMode}
            options={[{ value: "change", label: "Change over time" }, { value: "level", label: `FY${to} level vs average` }]} />
          {mode === "change" && periods.length > 1 && (
            <Segmented label="Period" value={from} onChange={setFrom} options={periods} />
          )}
        </div>
      </div>

      <Card>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate text-[13px]" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="w-[210px]" />
                {COLUMNS.map((c) => (
                  <th key={c.topic} className="px-1 pb-2 text-center align-bottom text-[12px] font-medium text-muted">
                    {c.label}
                    <div className="text-[11px] font-normal">{topicById[c.topic].unit === "percent" ? (mode === "change" ? "pts" : "index") : mode === "change" ? "%" : "index"}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMOGRAPHICS.map((dim) => {
                const segs = seriesFor(COLUMNS[0].topic, dim).map((s) => s.segment);
                return [
                  <tr key={dim}>
                    <td colSpan={COLUMNS.length + 1} className="pt-3 pb-1 text-[12px] font-semibold uppercase tracking-wide text-muted">
                      {dim}{CAVEATS[dim] && <span title={CAVEATS[dim]} className="ml-1 cursor-help normal-case">ⓘ definition changed in 2025</span>}
                    </td>
                  </tr>,
                  ...segs.map((seg) => (
                    <tr key={dim + seg}>
                      <td className="pr-2 text-ink-2">{seg}</td>
                      {COLUMNS.map((c) => {
                        const x = value(c.topic, dim, seg);
                        if (!x) return <td key={c.topic} className="text-center text-muted">—</td>;
                        const f = fill(x.v, domain);
                        return (
                          <td key={c.topic} className="p-0">
                            <button
                              title={`${seg} · ${c.label}: ${x.title}`}
                              onClick={() => go(c.topic, dim)}
                              className="tnum h-9 w-full rounded-[4px] text-center font-medium transition-transform hover:scale-[1.04]"
                              style={{ background: f.background, color: f.strong ? "#fff" : "var(--ink)" }}
                            >
                              {x.label}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px] text-muted">
          <span>{mode === "change" ? `Fell ${domain}%+ / ${domain} pts` : `${domain}% below average`}</span>
          <span className="h-2.5 w-48 rounded-full" style={{ background: "linear-gradient(90deg, var(--div-neg), var(--div-mid), var(--div-pos))" }} />
          <span>{mode === "change" ? `Grew ${domain}%+` : `${domain}% above average`}</span>
          <span className="ml-auto">{mode === "change" ? "Volumes: % change. Shares: percentage-point change." : "Index: group ÷ all households × 100."}</span>
        </div>
      </Card>
    </div>
  );
}
