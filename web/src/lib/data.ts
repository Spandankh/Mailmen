import raw from "../data/hms.json";

export type Unit = "pieces" | "percent" | "rating" | "billions" | "millions";

export interface Point {
  year: number;
  value: number;
  report: number;
  table: string;
  page: number;
}

export interface Series {
  topic: string;
  dimension: string;
  segment: string;
  points: Point[];
}

export interface Topic {
  id: string;
  market: string;
  label: string;
  unit: Unit;
  desc: string;
}

interface Dataset {
  generated_at: string;
  reports: { fiscal_year: number; file: string; values: number }[];
  topics: Record<string, Omit<Topic, "id">>;
  series: Series[];
  notes: string[];
  warnings: string[];
}

export const data = raw as Dataset;

export const topics: Topic[] = Object.entries(data.topics).map(([id, t]) => ({ id, ...t }));
export const topicById = Object.fromEntries(topics.map((t) => [t.id, t])) as Record<string, Topic>;

export const MARKETS = ["All mail", "Correspondence", "Transactions", "Advertising", "Periodicals", "Packages", "Context"];

/** Demographic dimensions, in the order the report presents them. */
export const DEMOGRAPHICS = ["Age", "Income", "Education", "Homeownership", "Metro area"];

export const allYears = [...new Set(data.series.flatMap((s) => s.points.map((p) => p.year)))].sort((a, b) => a - b);
export const firstYear = allYears[0];
export const lastYear = allYears[allYears.length - 1];

export function seriesFor(topic: string, dimension?: string): Series[] {
  return data.series.filter((s) => s.topic === topic && (dimension === undefined || s.dimension === dimension));
}

export function overall(topic: string): Series | undefined {
  return data.series.find((s) => s.topic === topic && s.dimension === "Overall");
}

export function dimensionsFor(topic: string): string[] {
  const dims = [...new Set(seriesFor(topic).map((s) => s.dimension))];
  // Overall first, then demographics in report order, then everything else.
  const rank = (d: string) => (d === "Overall" ? -1 : DEMOGRAPHICS.includes(d) ? 10 + DEMOGRAPHICS.indexOf(d) : 0);
  return dims.sort((a, b) => rank(a) - rank(b));
}

export function isTimeSeries(topic: string): boolean {
  return seriesFor(topic).some((s) => s.points.length > 1);
}

/** Caveats from the report's methodology that change how a breakdown should be read. */
export const CAVEATS: Record<string, string> = {
  "Metro area":
    "In January 2025 the survey widened its “Large MSA” definition (≈11% of households moved from Other MSA to Large MSA). FY2025 mixes both definitions, so part of the 2020→2025 change in metro-area breakdowns is definitional.",
};

const UNIT_SUFFIX: Record<Unit, string> = {
  pieces: " pieces",
  percent: "%",
  rating: "",
  billions: "B",
  millions: "M",
};

export function fmt(v: number, unit: Unit, opts: { suffix?: boolean } = {}): string {
  const digits = unit === "percent" ? 0 : unit === "rating" ? 1 : Math.abs(v) >= 100 ? 0 : 1;
  const s = v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  if (opts.suffix === false) return s;
  return s + (unit === "pieces" ? "" : UNIT_SUFFIX[unit]);
}

export const unitLabel: Record<Unit, string> = {
  pieces: "Pieces per household per year",
  percent: "Percent",
  rating: "Average rating (1–10)",
  billions: "Billions of pieces",
  millions: "Millions",
};
