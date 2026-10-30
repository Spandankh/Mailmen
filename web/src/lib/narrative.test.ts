import { describe, expect, it } from "vitest";
import { firstYear, lastYear, topicById } from "./data";
import { formatChange, snapshotNarrative, trendNarrative } from "./narrative";
import { keyFindings, marketsHeadline } from "./findings";

// These run against the real dataset (web/src/data/hms.json), so they also catch a broken extraction.

describe("formatChange", () => {
  it("formats volumes as signed percent and shares as signed points", () => {
    expect(formatChange("pieces", -0.387)).toBe("-39%");
    expect(formatChange("pieces", 0.29)).toBe("+29%");
    expect(formatChange("percent", -17)).toBe("-17 pts");
    expect(formatChange("percent", 1.25)).toBe("+1.3 pts");
  });
});

describe("trendNarrative", () => {
  it("leads with a headline for the topic", () => {
    const out = trendNarrative(topicById.total_mail, "Overall", lastYear + 5);
    expect(out[0].kind).toBe("headline");
    expect(out[0].text).toContain(`from ${firstYear} to ${lastYear}`);
    expect(out.some((i) => i.kind === "forecast")).toBe(true);
  });

  it("adds group comparisons and the metro-area caveat for a breakdown", () => {
    const out = trendNarrative(topicById.packages_received, "Metro area", lastYear + 5);
    expect(out.some((i) => i.kind === "segment")).toBe(true);
    expect(out.some((i) => i.kind === "gap")).toBe(true);
    expect(out.at(-1)!.kind).toBe("caveat");
  });
});

describe("snapshotNarrative", () => {
  it("names the highest and lowest group and the spread for a share", () => {
    const out = snapshotNarrative(topicById.ad_read_demo, "Age");
    expect(out[0].text).toMatch(/^Highest: .+ Lowest: /);
    expect(out[1].text).toMatch(/^A spread of \d+ percentage points across age groups\.$/);
  });

  it("gives a volume ratio for pieces", () => {
    const out = snapshotNarrative(topicById.received_detail, "Income");
    expect(out[1].text).toMatch(/\d\.\d× the volume of/);
  });
});

describe("findings", () => {
  const market = (name: string, change: number) => ({ name, stats: { change } });

  it("words the market headline from the data", () => {
    expect(marketsHeadline([market("Packages", 0.3), market("Advertising", -0.4)])).toBe("Every market except packages is shrinking");
    expect(marketsHeadline([market("A", -0.1), market("B", -0.2)])).toBe("Every mail market is shrinking");
    expect(marketsHeadline([market("A", 0.1), market("B", 0.2), market("C", -0.2)])).toBe(`2 of 3 mail markets grew since FY${firstYear}`);
  });

  it("produces key findings that each link to a trend", () => {
    const out = keyFindings();
    expect(out.length).toBeGreaterThanOrEqual(5);
    for (const f of out) {
      expect(f.go).toBeDefined();
      expect(topicById[f.go![0]]).toBeDefined();
      expect(f.text).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});
