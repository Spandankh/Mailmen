import type { Point, Series, Unit } from "./data";

/** Volumes change multiplicatively, shares are bounded 0–100: each gets its own scale. */
const isShare = (unit: Unit) => unit === "percent";

export interface TrendStats {
  first: Point;
  last: Point;
  /** Relative change first→last (fraction), or percentage-point change for shares. */
  change: number;
  /** Compound annual rate (fraction per year) for volumes; points per year for shares. */
  rate: number;
  /** Same, for the earlier and the most recent interval (needs ≥3 points). */
  earlyRate?: number;
  recentRate?: number;
  momentum?: "accelerating" | "slowing" | "reversed" | "steady";
  direction: "rising" | "falling" | "flat";
}

/** Change from a to b: percentage points for shares, relative change (fraction) for volumes. */
export const changeOf = (unit: Unit, a: number, b: number) => (isShare(unit) ? b - a : a ? b / a - 1 : 0);

/**
 * Whether a change between two survey years is too small to call a move: under 1 point (shares)
 * or 2% (volumes). Per-year rates use the tighter `flatCut` in `analyze` instead.
 */
export const isFlat = (unit: Unit, change: number) => (isShare(unit) ? Math.abs(change) < 1 : Math.abs(change) < 0.02);

function rateBetween(a: Point, b: Point, unit: Unit): number {
  const years = b.year - a.year || 1;
  if (isShare(unit)) return (b.value - a.value) / years;
  if (a.value <= 0) return 0;
  return Math.pow(b.value / a.value, 1 / years) - 1;
}

export function analyze(points: Point[], unit: Unit): TrendStats | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const change = changeOf(unit, first.value, last.value);
  const rate = rateBetween(first, last, unit);

  const flatCut = isShare(unit) ? 0.2 : 0.005; // 0.2 pts/yr or 0.5%/yr
  const direction = Math.abs(rate) < flatCut ? "flat" : rate > 0 ? "rising" : "falling";

  const stats: TrendStats = { first, last, change, rate, direction };
  if (points.length >= 3) {
    const mid = points[points.length - 2];
    stats.earlyRate = rateBetween(first, mid, unit);
    stats.recentRate = rateBetween(mid, last, unit);
    const e = stats.earlyRate;
    const r = stats.recentRate;
    if (Math.sign(e) !== Math.sign(r) && Math.abs(e) > flatCut && Math.abs(r) > flatCut) stats.momentum = "reversed";
    else if (Math.abs(r) > Math.abs(e) * 1.25 && Math.abs(r - e) > flatCut) stats.momentum = "accelerating";
    else if (Math.abs(r) < Math.abs(e) * 0.8 && Math.abs(r - e) > flatCut) stats.momentum = "slowing";
    else stats.momentum = "steady";
  }
  return stats;
}

// ---------------------------------------------------------------- forecasting

export interface ForecastPoint {
  year: number;
  value: number;
  low: number;
  high: number;
}

export interface Forecast {
  method: string;
  bandLabel: string;
  points: ForecastPoint[];
}

const logit = (p: number) => Math.log(p / (100 - p));
const invLogit = (x: number) => 100 / (1 + Math.exp(-x));
const clampShare = (p: number) => Math.min(99.5, Math.max(0.5, p));

/** Transform so a straight line is a sensible trend: log for volumes, logit for shares. */
function transforms(unit: Unit): [(v: number) => number, (x: number) => number] {
  if (isShare(unit)) return [(v) => logit(clampShare(v)), invLogit];
  return [(v) => Math.log(Math.max(v, 1e-6)), Math.exp];
}

function ols(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  xs.forEach((x, i) => {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (ys[i] - my);
  });
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const resid = ys.map((y, i) => y - (intercept + slope * xs[i]));
  const sse = resid.reduce((a, r) => a + r * r, 0);
  return { slope, intercept, mx, sxx, n, s: n > 2 ? Math.sqrt(sse / (n - 2)) : 0 };
}

// Two-sided 80% t quantiles by degrees of freedom (for prediction intervals).
const T80: Record<number, number> = { 1: 3.078, 2: 1.886, 3: 1.638, 4: 1.533, 5: 1.476, 6: 1.44, 7: 1.415, 8: 1.397, 9: 1.383, 10: 1.372 };
const t80 = (df: number) => T80[df] ?? 1.3;

/**
 * Project a series forward to `toYear`.
 *
 * Trends are fitted on the log (volumes) or logit (shares) scale, i.e. a constant
 * rate of change that can never go negative or past 100%.
 * - With ≥5 observations: least-squares trend, band = 80% prediction interval.
 * - With fewer (the FY2025 report gives 2015/2020/2025) a regression interval is
 *   meaningless, so the band spans two scenarios continued from the latest value —
 *   the long-run rate and the most recent interval's rate — and the central path
 *   is their average.
 */
export function forecast(points: Point[], unit: Unit, toYear: number): Forecast | null {
  if (points.length < 2) return null;
  const [f, inv] = transforms(unit);
  const xs = points.map((p) => p.year);
  const ys = points.map((p) => f(p.value));
  const fit = ols(xs, ys);
  const last = points[points.length - 1];
  const out: ForecastPoint[] = [{ year: last.year, value: last.value, low: last.value, high: last.value }];

  const useInterval = points.length >= 5;
  const longSlope = (ys[ys.length - 1] - ys[0]) / (xs[xs.length - 1] - xs[0]);
  const prev = points[points.length - 2];
  const recentSlope = (ys[ys.length - 1] - f(prev.value)) / (last.year - prev.year);
  // Anchor the trend on the latest observation so the projection starts where the data ends.
  const anchor = ys[ys.length - 1] - (fit.intercept + fit.slope * last.year);

  for (let y = last.year + 1; y <= toYear; y++) {
    // With few observations the OLS slope is just the long-run rate; blend in recent momentum instead.
    const centralX = useInterval
      ? fit.intercept + fit.slope * y + anchor
      : ys[ys.length - 1] + ((longSlope + recentSlope) / 2) * (y - last.year);
    let lowX: number;
    let highX: number;
    if (useInterval) {
      const se = fit.s * Math.sqrt(1 + 1 / fit.n + (y - fit.mx) ** 2 / fit.sxx);
      lowX = centralX - t80(fit.n - 2) * se;
      highX = centralX + t80(fit.n - 2) * se;
    } else {
      const dy = y - last.year;
      const a = ys[ys.length - 1] + longSlope * dy;
      const b = ys[ys.length - 1] + recentSlope * dy;
      lowX = Math.min(a, b, centralX);
      highX = Math.max(a, b, centralX);
    }
    out.push({ year: y, value: inv(centralX), low: inv(lowX), high: inv(highX) });
  }
  return {
    method: (useInterval ? "Least-squares " : "Blended long-run and recent ") +
      (isShare(unit) ? "logistic trend (share bounded 0–100%)" : "log-linear trend (constant annual rate)"),
    bandLabel: useInterval ? "80% prediction interval" : "Range between long-run and recent-5-year rates",
    points: out,
  };
}

// ---------------------------------------------------------------- comparisons

export interface SegmentStat {
  series: Series;
  stats: TrendStats;
}

export function rankSegments(list: Series[], unit: Unit): SegmentStat[] {
  return list
    .map((series) => ({ series, stats: analyze(series.points, unit) }))
    .filter((x): x is SegmentStat => x.stats !== null)
    .sort((a, b) => a.stats.change - b.stats.change);
}

/** Ratio (volumes) or difference (shares) between the highest and lowest segment in a year. */
export function spread(list: Series[], year: number, unit: Unit) {
  const vals = list
    .map((s) => ({ s, p: s.points.find((p) => p.year === year) }))
    .filter((x): x is { s: Series; p: Point } => !!x.p);
  if (vals.length < 2) return null;
  vals.sort((a, b) => b.p.value - a.p.value);
  const hi = vals[0];
  const lo = vals[vals.length - 1];
  const value = isShare(unit) ? hi.p.value - lo.p.value : lo.p.value ? hi.p.value / lo.p.value : NaN;
  return { hi: hi.s, lo: lo.s, value };
}

export function indexTo(points: Point[], baseYear: number): Point[] {
  const base = points.find((p) => p.year === baseYear)?.value;
  if (!base) return points;
  return points.map((p) => ({ ...p, value: (p.value / base) * 100 }));
}
