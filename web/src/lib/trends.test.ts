import { describe, expect, it } from "vitest";
import type { Point } from "./data";
import { analyze, changeOf, forecast, indexTo, isFlat, spread } from "./trends";

const pts = (...pairs: [number, number][]): Point[] =>
  pairs.map(([year, value]) => ({ year, value, report: 2025, table: "T", page: 1 }));

describe("changeOf / isFlat", () => {
  it("uses points for shares and relative change for volumes", () => {
    expect(changeOf("percent", 31, 14)).toBe(-17);
    expect(changeOf("pieces", 100, 80)).toBeCloseTo(-0.2);
  });
  it("returns 0 rather than Infinity from a zero base", () => {
    expect(changeOf("pieces", 0, 5)).toBe(0);
  });
  it("treats moves under 1 point or 2% as flat", () => {
    expect(isFlat("percent", 0.9)).toBe(true);
    expect(isFlat("percent", -1)).toBe(false);
    expect(isFlat("pieces", 0.019)).toBe(true);
    expect(isFlat("pieces", -0.02)).toBe(false);
  });
});

describe("analyze", () => {
  it("needs at least two points", () => {
    expect(analyze(pts([2015, 10]), "pieces")).toBeNull();
  });

  it("computes compound annual rates for volumes", () => {
    const s = analyze(pts([2015, 100], [2025, 50]), "pieces")!;
    expect(s.change).toBeCloseTo(-0.5);
    expect(s.rate).toBeCloseTo(Math.pow(0.5, 1 / 10) - 1);
    expect(s.direction).toBe("falling");
    expect(s.momentum).toBeUndefined();
  });

  it("computes points per year for shares", () => {
    const s = analyze(pts([2015, 31], [2020, 21], [2025, 14]), "percent")!;
    expect(s.change).toBe(-17);
    expect(s.rate).toBeCloseTo(-1.7);
    expect(s.earlyRate).toBeCloseTo(-2);
    expect(s.recentRate).toBeCloseTo(-1.4);
    expect(s.momentum).toBe("slowing");
  });

  it("calls a small move flat", () => {
    expect(analyze(pts([2015, 100], [2025, 101]), "pieces")!.direction).toBe("flat");
  });

  it("detects a reversal", () => {
    // Packages: up 2015→2020, down 2020→2025.
    expect(analyze(pts([2015, 32.1], [2020, 47], [2025, 41.5]), "pieces")!.momentum).toBe("reversed");
  });

  it("detects acceleration", () => {
    expect(analyze(pts([2015, 100], [2020, 95], [2025, 70]), "pieces")!.momentum).toBe("accelerating");
  });
});

describe("forecast", () => {
  it("starts at the last observation and runs to the horizon", () => {
    const fc = forecast(pts([2015, 1040.6], [2020, 837], [2025, 637.3]), "pieces", 2030)!;
    expect(fc.points[0]).toMatchObject({ year: 2025, value: 637.3, low: 637.3, high: 637.3 });
    expect(fc.points.at(-1)!.year).toBe(2030);
    expect(fc.points).toHaveLength(6);
    expect(fc.bandLabel).toMatch(/long-run and recent/);
  });

  it("keeps the band ordered and volumes positive", () => {
    const fc = forecast(pts([2015, 100], [2020, 30], [2025, 5]), "pieces", 2040)!;
    for (const p of fc.points) {
      expect(p.low).toBeLessThanOrEqual(p.value + 1e-9);
      expect(p.value).toBeLessThanOrEqual(p.high + 1e-9);
      expect(p.low).toBeGreaterThan(0);
    }
  });

  it("keeps shares between 0 and 100", () => {
    const fc = forecast(pts([2015, 60], [2020, 85], [2025, 97]), "percent", 2045)!;
    for (const p of fc.points) {
      expect(p.high).toBeLessThan(100);
      expect(p.low).toBeGreaterThan(0);
    }
  });

  it("switches to a least-squares prediction interval with five or more points", () => {
    const fc = forecast(pts([2005, 200], [2010, 180], [2015, 150], [2020, 140], [2025, 120]), "pieces", 2030)!;
    expect(fc.bandLabel).toBe("80% prediction interval");
    const end = fc.points.at(-1)!;
    expect(end.value).toBeLessThan(120);
    expect(end.low).toBeLessThan(end.value);
    expect(end.high).toBeGreaterThan(end.value);
  });

  it("needs at least two points", () => {
    expect(forecast(pts([2025, 10]), "pieces", 2030)).toBeNull();
  });
});

describe("spread / indexTo", () => {
  const series = (segment: string, v15: number, v25: number) => ({
    topic: "x", dimension: "Age", segment, points: pts([2015, v15], [2025, v25]),
  });

  it("gives the ratio for volumes and the difference for shares", () => {
    const list = [series("Young", 50, 20), series("Old", 100, 80)];
    expect(spread(list, 2025, "pieces")).toMatchObject({ value: 4 });
    expect(spread(list, 2025, "percent")!.value).toBe(60);
    expect(spread(list, 2025, "pieces")!.hi.segment).toBe("Old");
  });

  it("needs two groups with a value that year", () => {
    expect(spread([series("Only", 1, 2)], 2025, "pieces")).toBeNull();
  });

  it("indexes to the base year, leaving points alone without one", () => {
    expect(indexTo(pts([2015, 50], [2025, 25]), 2015).map((p) => p.value)).toEqual([100, 50]);
    expect(indexTo(pts([2020, 50]), 2015).map((p) => p.value)).toEqual([50]);
  });
});
