import { useEffect, useMemo, useState } from "react";
import {
  CAVEATS, DEMOGRAPHICS, MARKETS, allYears, dimensionsFor, firstYear, fmt, isTimeSeries, lastYear, seriesFor, topics, unitLabel,
  type Point, type Topic, type Unit,
} from "../lib/data";
import { changeOf, isFlat } from "../lib/trends";
import { formatChange as showChange } from "../lib/narrative";
import { Card, Segmented, csvCell, download, type Go } from "../components/ui";

const NONE = "None";
const DETAIL = "Sub-category";
const BREAKDOWNS = [NONE, DETAIL, ...DEMOGRAPHICS];
const ALL = "All";

interface Row {
  topic: Topic;
  dimension: string;
  label: string;
  a: Point;
  b: Point;
  change: number;
}

/** Rows for one topic under the chosen breakdown, keeping only series measured in both years. */
function rowsFor(topic: Topic, breakdown: string, ya: number, yb: number): Row[] {
  const dims =
    breakdown === NONE ? ["Overall"]
    : breakdown === DETAIL ? dimensionsFor(topic.id).filter((d) => d !== "Overall" && !DEMOGRAPHICS.includes(d))
    : [breakdown];
  return dims.flatMap((dim) =>
    seriesFor(topic.id, dim).flatMap((s) => {
      const a = s.points.find((p) => p.year === ya);
      const b = s.points.find((p) => p.year === yb);
      if (!a || !b) return [];
      const label = breakdown === NONE ? topic.label : dims.length > 1 ? `${dim}: ${s.segment}` : s.segment;
      return [{ topic, dimension: dim, label, a, b, change: changeOf(topic.unit, a.value, b.value) }];
    }),
  );
}

/** First year (hollow dot) to second year (filled dot) on a scale that starts at zero. */
function Dumbbell({ a, b, max, unit }: { a: number; b: number; max: number; unit: Unit }) {
  const x = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const c = changeOf(unit, a, b);
  const color = isFlat(unit, c) ? "var(--muted)" : c > 0 ? "var(--div-pos)" : "var(--div-neg)";
  return (
    <div className="relative h-4" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: "var(--grid)" }} />
      <div className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
        style={{ left: x(Math.min(a, b)), width: `calc(${x(Math.max(a, b))} - ${x(Math.min(a, b))})`, background: color, opacity: 0.55 }} />
      <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
        style={{ left: x(a), borderColor: "var(--muted)", background: "var(--surface)" }} />
      <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: x(b), background: color, boxShadow: "0 0 0 2px var(--surface)" }} />
    </div>
  );
}

function RowLine({ r, max, onOpen }: { r: Row; max: number; onOpen?: () => void }) {
  const c = r.change;
  const flat = isFlat(r.topic.unit, c);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 gap-y-1 border-b border-hair py-2 last:border-0 sm:grid-cols-[minmax(0,1.3fr)_64px_64px_76px_minmax(0,1.6fr)]">
      {onOpen ? (
        <button className="min-w-0 truncate text-left text-[14px] text-ink hover:underline" onClick={onOpen} title={`Open ${r.label} in the Trend Explorer`}>{r.label}</button>
      ) : (
        <span className="min-w-0 truncate text-[14px] text-ink" title={r.label}>{r.label}</span>
      )}
      <span className="text-right text-[13px] text-muted tnum">{fmt(r.a.value, r.topic.unit)}</span>
      <span className="text-right text-[13px] text-ink tnum">{fmt(r.b.value, r.topic.unit)}</span>
      <span className="text-right text-[13px] font-semibold tnum" style={{ color: flat ? "var(--muted)" : c > 0 ? "var(--div-pos)" : "var(--div-neg)" }}>
        {showChange(r.topic.unit, c)}
      </span>
      <div className="col-span-4 sm:col-span-1"><Dumbbell a={r.a.value} b={r.b.value} max={max} unit={r.topic.unit} /></div>
    </div>
  );
}

function Header({ ya, yb, first }: { ya: number; yb: number; first: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 pb-1 text-[12px] text-muted sm:grid-cols-[minmax(0,1.3fr)_64px_64px_76px_minmax(0,1.6fr)]">
      <span>{first}</span>
      <span className="text-right">FY{ya}</span>
      <span className="text-right">FY{yb}</span>
      <span className="text-right">Change</span>
      <span className="hidden whitespace-nowrap sm:block">
        <span className="mr-1 inline-block h-2 w-2 rounded-full border-2 align-middle" style={{ borderColor: "var(--muted)" }} /> FY{ya}
        <span className="mx-1.5">→</span>
        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: "var(--accent)" }} /> FY{yb}
      </span>
    </div>
  );
}

function summary(rows: Row[], ya: number, yb: number): string[] {
  if (!rows.length) return [];
  const label = (r: Row) => (r.dimension === "Overall" ? r.topic.label : `${r.topic.label} · ${r.label}`);
  const fell = rows.filter((r) => !isFlat(r.topic.unit, r.change) && r.change < 0).length;
  const rose = rows.filter((r) => !isFlat(r.topic.unit, r.change) && r.change > 0).length;
  const out = [`From FY${ya} to FY${yb}, ${fell} of ${rows.length} measures fell, ${rose} rose and ${rows.length - fell - rose} held roughly steady.`];
  const volumes = rows.filter((r) => r.topic.unit !== "percent").sort((p, q) => p.change - q.change);
  const shares = rows.filter((r) => r.topic.unit === "percent").sort((p, q) => Math.abs(q.change) - Math.abs(p.change));
  const lo = volumes[0];
  const hi = volumes[volumes.length - 1];
  if (lo && lo.change < 0) out.push(`Largest drop: ${label(lo)} (${showChange(lo.topic.unit, lo.change)}, ${fmt(lo.a.value, lo.topic.unit)} → ${fmt(lo.b.value, lo.topic.unit)}).`);
  if (hi && hi.change > 0) out.push(`Largest increase: ${label(hi)} (${showChange(hi.topic.unit, hi.change)}, ${fmt(hi.a.value, hi.topic.unit)} → ${fmt(hi.b.value, hi.topic.unit)}).`);
  if (shares[0]) out.push(`Biggest shift in a share: ${label(shares[0])} (${fmt(shares[0].a.value, "percent")} → ${fmt(shares[0].b.value, "percent")}).`);
  return out;
}

function parseHash() {
  const [, a, b, breakdown, market] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const year = (v: string | undefined, d: number) => (allYears.includes(Number(v)) ? Number(v) : d);
  return {
    ya: year(a, firstYear),
    yb: year(b, lastYear),
    breakdown: BREAKDOWNS.includes(breakdown) ? breakdown : NONE,
    market: market && MARKETS.includes(market) ? market : ALL,
  };
}

export function Compare({ go }: { go: Go }) {
  const [initial] = useState(parseHash);
  const [ya, setYa] = useState(initial.ya);
  const [yb, setYb] = useState(initial.yb);
  const [breakdown, setBreakdown] = useState(initial.breakdown);
  const [market, setMarket] = useState(initial.market);

  // A link pasted or edited while this tab is open changes only the hash, so follow it.
  // (replaceState below doesn't fire hashchange, so this never echoes our own updates.)
  useEffect(() => {
    const on = () => {
      if (!location.hash.startsWith("#/compare")) return;
      const next = parseHash();
      setYa(next.ya);
      setYb(next.yb);
      setBreakdown(next.breakdown);
      setMarket(next.market);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // Keep the selection in the URL so a comparison can be bookmarked or shared.
  useEffect(() => {
    history.replaceState(null, "", `#/compare/${ya}/${yb}/${encodeURIComponent(breakdown)}/${encodeURIComponent(market)}`);
  }, [ya, yb, breakdown, market]);

  const groups = useMemo(() => {
    if (ya === yb) return [];
    return topics
      .filter((t) => isTimeSeries(t.id) && (market === ALL || t.market === market))
      .map((t) => ({ topic: t, rows: rowsFor(t, breakdown, ya, yb) }))
      .filter((g) => g.rows.length);
  }, [ya, yb, breakdown, market]);
  const rows = groups.flatMap((g) => g.rows);
  const markets = MARKETS.filter((m) => topics.some((t) => t.market === m && isTimeSeries(t.id)));

  const exportCsv = () => {
    const head = ["market", "topic", "unit", "breakdown", "group", `fy${ya}`, `fy${yb}`, "change", "source"];
    const body = rows.map((r) => [
      r.topic.market, r.topic.label, r.topic.unit, r.dimension, r.label, r.a.value, r.b.value, showChange(r.topic.unit, r.change),
      [...new Set([r.a, r.b].map((p) => `FY${p.report} Table ${p.table} p.${p.page}`))].join("; "),
    ]);
    download(`compare_fy${ya}_fy${yb}_${breakdown}.csv`.replace(/\s+/g, "_").toLowerCase(), [head, ...body].map((r) => r.map(csvCell).join(",")).join("\n"));
  };

  const yearSelect = (value: number, set: (y: number) => void, label: string) => (
    <select className="select" value={value} onChange={(e) => set(Number(e.target.value))} aria-label={label}>
      {allYears.map((y) => <option key={y} value={y}>FY{y}</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">Compare</span>
          {yearSelect(ya, setYa, "First year")}
          <span className="text-[13px] text-muted">with</span>
          {yearSelect(yb, setYb, "Second year")}
          {allYears.length > 2 && (
            <button className="btn" onClick={() => { setYa(yb); setYb(ya); }} aria-label="Swap years">⇄ Swap</button>
          )}
          <button className="btn ml-auto" onClick={exportCsv} disabled={!rows.length}>Download CSV</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">Break down by</span>
          <Segmented label="Breakdown" value={breakdown} onChange={setBreakdown} options={BREAKDOWNS.map((b) => ({ value: b, label: b }))} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">Market</span>
          <Segmented label="Market" value={market} onChange={setMarket} options={[ALL, ...markets].map((m) => ({ value: m, label: m }))} />
        </div>
        <p className="text-[12px] text-muted">
          Survey years available: {allYears.map((y) => `FY${y}`).join(", ")}. Add reports on the Data & Sources tab to compare more years.
        </p>
      </div>

      {ya === yb ? (
        <Card><p className="text-[14px] text-muted">Pick two different years to compare.</p></Card>
      ) : !rows.length ? (
        <Card><p className="text-[14px] text-muted">No measures have values for both FY{ya} and FY{yb} with this breakdown and market.</p></Card>
      ) : (
        <>
          <Card title={`What changed, FY${ya} → FY${yb}`} subtitle="Volumes compare as % change; shares as percentage points. Dots sit on a scale from zero: blue rose, red fell, grey held steady.">
            <ul className="list-disc space-y-1 pl-5 text-[14px] text-ink-2">
              {summary(rows, ya, yb).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
            {CAVEATS[breakdown] && <p className="mt-3 text-[12px] text-muted">Note: {CAVEATS[breakdown]}</p>}
          </Card>

          {breakdown === NONE ? (
            // One row per topic, grouped by market; each row is scaled to its own values.
            markets.filter((m) => groups.some((g) => g.topic.market === m)).map((m) => (
              <Card key={m} title={m}>
                <Header ya={ya} yb={yb} first="Measure" />
                {groups.filter((g) => g.topic.market === m).map(({ topic, rows: [r] }) => (
                  <RowLine key={topic.id} r={r} max={Math.max(r.a.value, r.b.value) * 1.08} onOpen={() => go(topic.id, "Overall")} />
                ))}
              </Card>
            ))
          ) : (
            // One card per topic; its groups share a scale so they can be compared with each other.
            <div className="grid gap-4 xl:grid-cols-2">
              {groups.map(({ topic, rows: list }) => {
                const max = Math.max(...list.flatMap((r) => [r.a.value, r.b.value])) * 1.08;
                return (
                  <Card key={topic.id} title={topic.label} subtitle={`${unitLabel[topic.unit]} · ${topic.market}`}
                    actions={<button className="btn" onClick={() => go(topic.id, list[0].dimension)}>Open</button>}>
                    <Header ya={ya} yb={yb} first={breakdown === DETAIL ? "Category" : breakdown} />
                    {list.map((r) => <RowLine key={`${r.dimension}|${r.label}`} r={r} max={max} />)}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
