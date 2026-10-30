import { DEMOGRAPHICS, firstYear, fmt, lastYear, overall, seriesFor, topicById, type Series } from "./data";
import { analyze, forecast } from "./trends";
import { describeChange, describeRate, type Insight } from "./narrative";

/** The five mail markets: the topic that measures each one's volume, and the per-household topic with demographic breakdowns. */
export const MARKET_TOPICS: { name: string; topic: string; detail: string }[] = [
  { name: "Correspondence", topic: "correspondence", detail: "correspondence" },
  { name: "Transactions", topic: "transactions", detail: "transactions" },
  { name: "Advertising", topic: "ad_by_class", detail: "advertising" },
  { name: "Periodicals", topic: "periodicals", detail: "periodicals" },
  { name: "Packages", topic: "packages_total", detail: "packages_received" },
];

export function tileFor(topic: string) {
  const s = overall(topic);
  const t = topicById[topic];
  if (!s || !t) return null;
  const stats = analyze(s.points, t.unit);
  return { s, t, stats, last: s.points[s.points.length - 1] };
}

/** Each market's overall series and trend, skipping any the dataset doesn't cover. */
export function marketStats() {
  return MARKET_TOPICS.flatMap((m) => {
    const x = tileFor(m.topic);
    return x?.stats ? [{ ...m, ...x, stats: x.stats }] : [];
  });
}

/** One-line verdict on the markets, e.g. "Every market except packages is shrinking". */
export function marketsHeadline(markets: { name: string; stats: { change: number } }[] = marketStats()): string {
  const growing = markets.filter((m) => m.stats.change > 0);
  if (growing.length === 0) return "Every mail market is shrinking";
  if (growing.length === 1) return `Every market except ${growing[0].name.toLowerCase()} is shrinking`;
  return `${growing.length} of ${markets.length} mail markets grew since FY${firstYear}`;
}

/**
 * Change in every household group's volume across the five markets, steepest decline first.
 * Metro area is left out: its FY2025 definition changed, so its change is partly definitional.
 */
export function householdShifts(): { s: Series; change: number }[] {
  const out: { s: Series; change: number }[] = [];
  for (const { detail } of MARKET_TOPICS) {
    for (const dim of DEMOGRAPHICS.filter((d) => d !== "Metro area")) {
      for (const s of seriesFor(detail, dim)) {
        const st = analyze(s.points, "pieces");
        if (st) out.push({ s, change: st.change });
      }
    }
  }
  return out.sort((a, b) => a.change - b.change);
}

export function keyFindings(): (Insight & { go?: [string, string] })[] {
  const out: (Insight & { go?: [string, string] })[] = [];
  const total = tileFor("total_mail");
  if (total?.stats) {
    out.push({
      kind: "headline",
      text: `Households sent and received ${fmt(total.last.value, "pieces")} pieces each in FY${lastYear}, ${describeChange(total.stats, total.t).replace(/^[+-]/, "")} ${total.stats.change < 0 ? "fewer" : "more"} than in FY${firstYear} (${describeRate(total.stats.rate, total.t)}).`,
      go: ["total_mail", "Market"],
    });
  }

  const markets = marketStats();
  const growing = markets.filter((m) => m.stats.change > 0);
  if (growing.length === 1) {
    const g = growing[0];
    const prev = g.s.points[g.s.points.length - 2];
    const peak = g.s.points.reduce((a, b) => (b.value > a.value ? b : a));
    const recent = g.stats.recentRate;
    out.push({
      kind: "segment",
      text: `${g.name} is the only market that grew since FY${firstYear} (${describeChange(g.stats, g.t)}), though it ${recent !== undefined && recent < 0 ? `has slipped since its FY${peak.year} peak (${describeRate(recent, g.t)} since ${prev.year})` : "is still growing"}.`,
      go: [g.topic, "Metro area"],
    });
  }
  const worst = [...markets].sort((a, b) => a.stats.change - b.stats.change)[0];
  if (worst) {
    out.push({
      kind: "momentum",
      text: `${worst.name} mail fell fastest: ${describeChange(worst.stats, worst.t)} since FY${firstYear}, ${worst.stats.momentum === "accelerating" ? "and the decline is speeding up" : worst.stats.momentum === "slowing" ? "though the decline is easing" : "at a steady pace"}.`,
      go: [worst.topic, "Age"],
    });
  }

  const shifts = householdShifts();
  const drop = shifts[0];
  const rise = shifts[shifts.length - 1];
  if (drop) {
    out.push({
      kind: "gap",
      text: `Largest decline by household type: ${topicById[drop.s.topic].label.toLowerCase()} for ${drop.s.dimension.toLowerCase()} group “${drop.s.segment}” (${Math.round(drop.change * 100)}%).`,
      go: [drop.s.topic, drop.s.dimension],
    });
  }
  if (rise && rise.change > 0) {
    out.push({
      kind: "gap",
      text: `Largest increase: ${topicById[rise.s.topic].label.toLowerCase()} for “${rise.s.segment}” households (+${Math.round(rise.change * 100)}%).`,
      go: [rise.s.topic, rise.s.dimension],
    });
  }

  const paid = tileFor("bills_paid_mail_share");
  if (paid?.stats) {
    out.push({
      kind: "headline",
      text: `Only ${fmt(paid.last.value, "percent")} of household bills were paid by mail in FY${lastYear}, ${paid.stats.change < 0 ? "down" : "up"} from ${fmt(paid.stats.first.value, "percent")} in FY${firstYear}.`,
      go: ["bills_paid_mail_share", "Age"],
    });
  }
  if (total) {
    const fc = forecast(total.s.points, "pieces", lastYear + 5);
    const end = fc?.points[fc.points.length - 1];
    if (end) {
      out.push({
        kind: "forecast",
        text: `On the current trend, total household mail reaches about ${fmt(end.value, "pieces")} pieces per household by ${lastYear + 5} (range ${fmt(end.low, "pieces")}–${fmt(end.high, "pieces")}).`,
        go: ["total_mail", "Overall"],
      });
    }
  }
  return out;
}
