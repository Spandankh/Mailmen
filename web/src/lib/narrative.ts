import { CAVEATS, fmt, overall, seriesFor, type Series, type Topic, type Unit } from "./data";
import { analyze, forecast, rankSegments, spread, type TrendStats } from "./trends";

export interface Insight {
  kind: "headline" | "momentum" | "segment" | "gap" | "forecast" | "caveat" | "snapshot";
  text: string;
}

const pct = (x: number, signed = true) => `${signed && x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
const pts = (x: number, signed = true) => `${signed && x > 0 ? "+" : ""}${x.toFixed(Math.abs(x) < 10 ? 1 : 0)} pts`;

/** A change as "+12%" (volumes) or "+3.5 pts" (shares). */
export function formatChange(unit: Unit, change: number): string {
  return unit === "percent" ? pts(change) : pct(change);
}

export function describeChange(s: TrendStats, topic: Topic): string {
  return formatChange(topic.unit, s.change);
}

export function describeRate(r: number, topic: Topic): string {
  return topic.unit === "percent" ? `${pts(r)}/yr` : `${r > 0 ? "+" : ""}${(r * 100).toFixed(1)}%/yr`;
}

const verb = (s: TrendStats) => (s.direction === "flat" ? "held roughly steady" : s.direction === "rising" ? "rose" : "fell");

function headline(name: string, s: TrendStats, topic: Topic): string {
  const by = s.direction === "flat" ? ` (${describeChange(s, topic)})` : ` ${describeChange(s, topic).replace(/^[+-]/, "")}`;
  return (
    `${name} ${verb(s)}${by} from ${s.first.year} to ${s.last.year}, ` +
    `${s.direction === "flat" ? "at" : "to"} ${fmt(s.last.value, topic.unit)}${topic.unit === "pieces" ? " pieces per household" : ""}` +
    (s.direction === "flat" ? "." : ` — ${describeRate(s.rate, topic)} on average.`)
  );
}

function momentum(s: TrendStats, topic: Topic, midYear: number): string | null {
  if (s.momentum === undefined || s.earlyRate === undefined || s.recentRate === undefined) return null;
  const early = `${describeRate(s.earlyRate, topic)} in ${s.first.year}–${midYear}`;
  const recent = `${describeRate(s.recentRate, topic)} in ${midYear}–${s.last.year}`;
  switch (s.momentum) {
    case "accelerating":
      return `The ${s.recentRate < 0 ? "decline" : "growth"} is speeding up: ${recent} vs ${early}.`;
    case "slowing":
      return `The ${s.recentRate < 0 ? "decline" : "growth"} is easing: ${recent} vs ${early}.`;
    case "reversed":
      return `The trend reversed: ${early}, then ${recent}.`;
    default:
      return `The pace has been steady: ${early}, ${recent}.`;
  }
}

/** Plain-language trend analysis for a topic, broken down by one dimension. */
export function trendNarrative(topic: Topic, dimension: string, horizon: number): Insight[] {
  const out: Insight[] = [];
  const total = overall(topic.id);
  const totalStats = total ? analyze(total.points, topic.unit) : null;

  if (total && totalStats) {
    out.push({ kind: "headline", text: headline(topic.label, totalStats, topic) });
    const mid = total.points[total.points.length - 2]?.year;
    const m = momentum(totalStats, topic, mid);
    if (m) out.push({ kind: "momentum", text: m });
    const fc = forecast(total.points, topic.unit, horizon);
    const end = fc?.points[fc.points.length - 1];
    if (fc && end) {
      out.push({
        kind: "forecast",
        text:
          `If recent trends hold, expect about ${fmt(end.value, topic.unit)} by ${horizon} ` +
          `(range ${fmt(end.low, topic.unit, { suffix: false })}–${fmt(end.high, topic.unit)}).`,
      });
    }
  }

  if (dimension !== "Overall") {
    const segs = seriesFor(topic.id, dimension);
    const ranked = rankSegments(segs, topic.unit);
    if (ranked.length >= 2) {
      const lo = ranked[0];
      const hi = ranked[ranked.length - 1];
      const loText = `${lo.series.segment} (${describeChange(lo.stats, topic)})`;
      const hiText = `${hi.series.segment} (${describeChange(hi.stats, topic)})`;
      if (lo.stats.change < 0 && hi.stats.change < 0) {
        out.push({ kind: "segment", text: `By ${dimension.toLowerCase()}: every group declined. Steepest drop: ${loText}. Most resilient: ${hiText}.` });
      } else if (lo.stats.change > 0) {
        out.push({ kind: "segment", text: `By ${dimension.toLowerCase()}: every group grew. Fastest: ${hiText}. Slowest: ${loText}.` });
      } else {
        out.push({ kind: "segment", text: `By ${dimension.toLowerCase()}: groups moved in opposite directions — ${hiText} vs ${loText}.` });
      }

      const years = ranked[0].series.points.map((p) => p.year);
      const a = spread(segs, years[0], topic.unit);
      const b = spread(segs, years[years.length - 1], topic.unit);
      if (a && b && Number.isFinite(a.value) && Number.isFinite(b.value)) {
        const share = topic.unit === "percent";
        const show = (v: number) => (share ? `${v.toFixed(0)} pts` : `${v.toFixed(1)}×`);
        const widened = b.value > a.value * (share ? 1 : 1.05) + (share ? 2 : 0);
        const narrowed = b.value < a.value * (share ? 1 : 0.95) - (share ? 2 : 0);
        const trend = widened ? "widened" : narrowed ? "narrowed" : "stayed about the same";
        out.push({
          kind: "gap",
          text:
            `The gap between the highest and lowest group ${trend}: ${show(a.value)} in ${years[0]} ` +
            `→ ${show(b.value)} in ${years[years.length - 1]} (${b.hi.segment} vs ${b.lo.segment}).`,
        });
      }
    }
    if (CAVEATS[dimension]) out.push({ kind: "caveat", text: CAVEATS[dimension] });
  }
  return out;
}

/** Narrative for a single-year table: who is highest, lowest, and how wide the spread is. */
export function snapshotNarrative(topic: Topic, dimension: string): Insight[] {
  const segs: Series[] = seriesFor(topic.id, dimension).filter((s) => s.points.length);
  if (segs.length < 2) return [];
  const sorted = [...segs].sort((a, b) => b.points[0].value - a.points[0].value);
  const hi = sorted[0];
  const lo = sorted[sorted.length - 1];
  const v = (s: Series) => fmt(s.points[0].value, topic.unit);
  const out: Insight[] = [
    { kind: "snapshot", text: `Highest: ${hi.segment} at ${v(hi)}. Lowest: ${lo.segment} at ${v(lo)}.` },
  ];
  const ratio = hi.points[0].value / lo.points[0].value;
  if (topic.unit !== "percent" && topic.unit !== "rating" && Number.isFinite(ratio)) {
    out.push({ kind: "snapshot", text: `${hi.segment} households have ${ratio.toFixed(1)}× the volume of ${lo.segment} households.` });
  } else if (topic.unit === "percent") {
    out.push({ kind: "snapshot", text: `A spread of ${(hi.points[0].value - lo.points[0].value).toFixed(0)} percentage points across ${dimension.toLowerCase()} groups.` });
  }
  if (CAVEATS[dimension]) out.push({ kind: "caveat", text: CAVEATS[dimension] });
  return out;
}

export function insightsToText(title: string, insights: Insight[]): string {
  return [title, ...insights.map((i) => `• ${i.text}`)].join("\n");
}
