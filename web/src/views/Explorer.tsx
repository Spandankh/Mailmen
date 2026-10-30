import { useMemo, useState } from "react";
import {
  CAVEATS, MARKETS, dimensionsFor, fmt, isTimeSeries, lastYear, firstYear, seriesFor, topicById, topics, unitLabel,
  type Series,
} from "../lib/data";
import { analyze, forecast, indexTo } from "../lib/trends";
import { describeChange, describeRate, insightsToText, snapshotNarrative, trendNarrative } from "../lib/narrative";
import { summaryPayload } from "../lib/ai";
import { AiSummary } from "../components/AiSummary";
import { BarList, Sparkline, TrendChart, type Line } from "../components/charts";
import { useTheme } from "../components/Chart";
import { Card, CopyButton, InsightList, Segmented, Toggle, csvCell, download } from "../components/ui";

export function TopicSelect({ value, onChange, filter }: { value: string; onChange: (id: string) => void; filter?: (id: string) => boolean }) {
  return (
    <select className="select max-w-full" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Topic">
      {MARKETS.map((m) => {
        const list = topics.filter((t) => t.market === m && (!filter || filter(t.id)));
        if (!list.length) return null;
        return (
          <optgroup key={m} label={m}>
            {list.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {isTimeSeries(t.id) ? "" : ` (FY${lastYear} only)`}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

export function Explorer({ topicId, dimension, onChange }: {
  topicId: string;
  dimension: string;
  onChange: (topic: string, dimension: string) => void;
}) {
  const topic = topicById[topicId] ?? topics[0];
  const dims = dimensionsFor(topic.id);
  const dim = dims.includes(dimension) ? dimension : dims.find((d) => d !== "Overall") ?? dims[0];
  const trend = isTimeSeries(topic.id);
  const t = useTheme();

  const [showForecast, setShowForecast] = useState(true);
  const [horizon, setHorizon] = useState(lastYear + 5);
  const [indexed, setIndexed] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const segments = useMemo(() => seriesFor(topic.id, dim), [topic.id, dim]);
  const total = dim === "Overall" ? undefined : seriesFor(topic.id, "Overall")[0];
  // Colour follows the segment's position in the full list, so hiding one never repaints the others.
  const colorOf = (s: Series) => (s.dimension === "Overall" && dim !== "Overall" ? t.muted : t.series[segments.indexOf(s) % 8]);

  const canIndex = topic.unit !== "percent";
  const useIndex = indexed && canIndex;

  const lines: Line[] = useMemo(() => {
    if (!trend) return [];
    const list = [...segments.filter((s) => !hidden.has(s.segment)), ...(total ? [total] : [])];
    const single = list.filter((s) => s !== total).length === 1;
    return list.map((s) => {
      const pts = useIndex ? indexTo(s.points, firstYear) : s.points;
      return {
        name: s === total ? "All households" : s.segment,
        color: colorOf(s),
        points: pts,
        reference: s === total,
        forecast: showForecast && s !== total ? forecast(pts, useIndex ? "pieces" : topic.unit, horizon) : null,
        band: showForecast && single,
      };
    });
  }, [segments, hidden, total, showForecast, horizon, useIndex, topic.unit, trend, t]);

  const insights = useMemo(
    () => (trend ? trendNarrative(topic, dim, horizon) : snapshotNarrative(topic, dim)),
    [topic, dim, horizon, trend],
  );
  const years = [...new Set(segments.flatMap((s) => s.points.map((p) => p.year)))].sort((a, b) => a - b);

  const rows = segments.map((s) => {
    const stats = analyze(s.points, topic.unit);
    const fc = trend ? forecast(s.points, topic.unit, horizon) : null;
    return { s, stats, end: fc?.points[fc.points.length - 1] };
  });

  const exportCsv = () => {
    const head = ["topic", "dimension", "segment", ...years.map(String), "change", "annual_rate", `forecast_${horizon}`, `low_${horizon}`, `high_${horizon}`, "source"];
    const body = rows.map(({ s, stats, end }) => [
      topic.label, s.dimension, s.segment,
      ...years.map((y) => s.points.find((p) => p.year === y)?.value ?? ""),
      stats ? describeChange(stats, topic) : "", stats ? describeRate(stats.rate, topic) : "",
      end?.value.toFixed(1) ?? "", end?.low.toFixed(1) ?? "", end?.high.toFixed(1) ?? "",
      [...new Set(s.points.map((p) => `FY${p.report} Table ${p.table} p.${p.page}`))].join("; "),
    ]);
    download(`${topic.id}_${dim}.csv`.replace(/\s+/g, "_").toLowerCase(), [head, ...body].map((r) => r.map(csvCell).join(",")).join("\n"));
  };

  const fcMeta = trend ? forecast((total ?? segments[0]).points, topic.unit, horizon) : null;

  return (
    <div className="space-y-4">
      {/* One filter row scopes everything below it. */}
      <div className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <TopicSelect value={topic.id} onChange={(id) => { setHidden(new Set()); onChange(id, dim); }} />
          <p className="text-[13px] text-muted">{topic.desc}</p>
        </div>
        {trend && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Toggle on={showForecast} onChange={setShowForecast}>Forecast</Toggle>
            {showForecast && (
              <Segmented label="Forecast horizon" value={horizon} onChange={setHorizon}
                options={[{ value: lastYear + 5, label: `to ${lastYear + 5}` }, { value: lastYear + 10, label: `to ${lastYear + 10}` }]} />
            )}
            {canIndex && <Toggle on={indexed} onChange={setIndexed}>Index {firstYear} = 100</Toggle>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted">Break down by</span>
        <Segmented label="Breakdown" value={dim} onChange={(d) => { setHidden(new Set()); onChange(topic.id, d); }}
          options={dims.map((d) => ({ value: d, label: d === "Overall" ? "None" : d }))} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card
          title={`${topic.label}${dim !== "Overall" ? ` by ${dim.toLowerCase()}` : ""}`}
          subtitle={trend ? `${useIndex ? `Index, ${firstYear} = 100` : unitLabel[topic.unit]} · FY${years[0]}–FY${years[years.length - 1]}${showForecast ? ` · dashed = projection to ${horizon}` : ""}` : `${unitLabel[topic.unit]} · FY${lastYear}`}
        >
          {trend && segments.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Show or hide segments">
              {segments.map((s) => {
                const on = !hidden.has(s.segment);
                return (
                  <button key={s.segment} className="chip legend" aria-pressed={on} style={{ opacity: on ? 1 : 0.5 }}
                    onClick={() => {
                      const next = new Set(hidden);
                      if (on) next.add(s.segment); else next.delete(s.segment);
                      if (next.size < segments.length) setHidden(next);
                    }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: on ? colorOf(s) : "transparent", border: `2px solid ${colorOf(s)}` }} />
                    {s.segment}
                  </button>
                );
              })}
              {total && (
                <span className="chip" style={{ cursor: "default" }}>
                  <span style={{ width: 14, borderTop: `2px dotted ${t.muted}` }} /> All households
                </span>
              )}
            </div>
          )}
          {trend ? (
            <TrendChart lines={lines} unit={topic.unit} indexed={useIndex} label={`${topic.label} trend chart`} />
          ) : (
            <BarList rows={segments.map((s) => ({ name: s.segment, value: s.points[0].value }))} unit={topic.unit} label={`${topic.label} bar chart`} />
          )}
          {fcMeta && showForecast && (
            <p className="mt-2 text-[12px] text-muted">
              Projection: {fcMeta.method.toLowerCase()}. Shaded range (single series): {fcMeta.bandLabel.toLowerCase()}. Based on {(total ?? segments[0]).points.length} survey years — treat projections as directional.
            </p>
          )}
        </Card>

        <Card
          title="Trend analysis"
          subtitle="Generated from the data on screen"
          actions={<CopyButton text={insightsToText(`${topic.label}${dim !== "Overall" ? ` by ${dim.toLowerCase()}` : ""}`, insights)} label="Copy summary" />}
        >
          <InsightList insights={insights} />
          {!insights.length && <p className="text-[14px] text-muted">Not enough data for an analysis.</p>}
          {/* Needs the dev server's /api/summarize route, so it isn't part of the static build. */}
          {import.meta.env.DEV && (
            <AiSummary
              key={`${topic.id}|${dim}|${horizon}`}
              title={`${topic.label}${dim !== "Overall" ? ` by ${dim.toLowerCase()}` : ""}`}
              payload={summaryPayload(topic, dim, horizon, trend ? rows : rows.map((r) => ({ ...r, end: undefined })), insights)}
            />
          )}
        </Card>
      </div>

      <Card title="Table view" subtitle="Every value plotted above, with its source in the report" actions={<button className="btn" onClick={exportCsv}>Download CSV</button>}>
        <div className="-mx-1 overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>{dim === "Overall" ? "Series" : dim}</th>
                {years.map((y) => <th key={y} className="num">FY{y}</th>)}
                {trend && <th className="num">Change</th>}
                {trend && <th className="num">Annual rate</th>}
                {trend && <th className="num">{horizon} projection</th>}
                {trend && <th>Trend</th>}
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, stats, end }) => (
                <tr key={s.segment}>
                  <td className="text-ink">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: colorOf(s) }} />
                    {s.segment}
                  </td>
                  {years.map((y) => {
                    const p = s.points.find((p) => p.year === y);
                    return <td key={y} className="num">{p ? fmt(p.value, topic.unit) : "—"}</td>;
                  })}
                  {trend && <td className="num">{stats ? describeChange(stats, topic) : "—"}</td>}
                  {trend && <td className="num">{stats ? describeRate(stats.rate, topic) : "—"}</td>}
                  {trend && <td className="num">{end ? <>{fmt(end.value, topic.unit)} <span className="text-muted">({fmt(end.low, topic.unit, { suffix: false })}–{fmt(end.high, topic.unit, { suffix: false })})</span></> : "—"}</td>}
                  {trend && <td><Sparkline values={s.points.map((p) => p.value)} /></td>}
                  <td className="text-muted whitespace-nowrap">{[...new Set(s.points.map((p) => `Table ${p.table}, p.${p.page}`))].join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {CAVEATS[dim] && <p className="mt-3 text-[12px] text-muted">Note: {CAVEATS[dim]}</p>}
      </Card>
    </div>
  );
}
