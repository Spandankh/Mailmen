import { fmt, unitLabel, type Series, type Topic } from "./data";
import type { Insight } from "./narrative";
import { describeChange, describeRate } from "./narrative";
import { changeOf, isFlat, type TrendStats } from "./trends";

export interface SummaryRow {
  s: Series;
  stats: TrendStats | null;
  end?: { value: number; low: number; high: number };
}

/**
 * Direction between each pair of survey years plus the peak, e.g. "rose, then fell; peak FY2020".
 * Worked out here so the model doesn't have to compare numbers itself, which is where it slips.
 */
function pattern(s: Series, topic: Topic): string | undefined {
  const pts = s.points;
  if (pts.length < 2) return undefined;
  const steps = pts.slice(1).map((p, i) => {
    const prev = pts[i].value;
    return isFlat(topic.unit, changeOf(topic.unit, prev, p.value)) ? "held steady" : p.value > prev ? "rose" : "fell";
  });
  const peak = pts.reduce((a, b) => (b.value > a.value ? b : a));
  const moves = steps.length > 1 && steps.every((x) => x === steps[0]) ? `${steps[0]} each period` : steps.join(", then ");
  return `${moves}; peak FY${peak.year}`;
}

/** The chart on screen, already formatted, so the model reads the same numbers the user sees. */
export function summaryPayload(topic: Topic, dimension: string, horizon: number, rows: SummaryRow[], insights: Insight[]) {
  return {
    topic: topic.label,
    description: topic.desc,
    unit: unitLabel[topic.unit],
    breakdown: dimension === "Overall" ? "none" : dimension,
    groups: rows.map(({ s, stats, end }) => ({
      group: s.segment,
      values: Object.fromEntries(s.points.map((p) => [`FY${p.year}`, fmt(p.value, topic.unit)])),
      pattern: pattern(s, topic),
      ...(stats && s.points.length > 1 && { change: describeChange(stats, topic), annual_rate: describeRate(stats.rate, topic) }),
      ...(end && { [`projection_${horizon}`]: `${fmt(end.value, topic.unit)} (range ${fmt(end.low, topic.unit)}–${fmt(end.high, topic.unit)})` }),
    })),
    // The dashboard's own rule-based findings and caveats, as checked facts to build on.
    computed_findings: insights.map((i) => i.text),
  };
}

/** Streams the summary from the dev server, calling onText with the full text so far. */
export async function streamSummary(payload: unknown, onText: (text: string) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok || !res.body) throw new Error((await res.text()) || `Request failed (${res.status})`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
    onText(text);
  }
}
