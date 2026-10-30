import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { Chart, baseOption, useTheme } from "./Chart";
import { fmt, type Point, type Unit } from "../lib/data";
import type { Forecast } from "../lib/trends";

export interface Line {
  name: string;
  color: string;
  points: Point[];
  forecast?: Forecast | null;
  /** Draw the forecast band (keep to one line per chart). */
  band?: boolean;
  reference?: boolean;
}

const axisFmt = (unit: Unit, indexed: boolean) => (v: number) =>
  indexed ? `${v}` : unit === "percent" ? `${v}%` : v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}K` : `${v}`;

export function TrendChart({
  lines,
  unit,
  indexed = false,
  height = 340,
  label,
}: {
  lines: Line[];
  unit: Unit;
  indexed?: boolean;
  height?: number;
  label: string;
}) {
  const t = useTheme();
  const option = useMemo<EChartsCoreOption>(() => {
    const series: unknown[] = [];
    const years = lines.flatMap((l) => [...l.points.map((p) => p.year), ...(l.forecast?.points.map((p) => p.year) ?? [])]);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const show = (v: number) => (indexed ? v.toFixed(0) : fmt(v, unit));
    const direct = lines.filter((l) => !l.reference).length <= 4;

    for (const l of lines) {
      const fc = l.forecast;
      if (fc && l.band) {
        series.push(
          {
            type: "line", name: `${l.name} low`, stack: `band-${l.name}`, silent: true, symbol: "none",
            lineStyle: { opacity: 0 }, tooltip: { show: false },
            data: fc.points.map((p) => [p.year, p.low]),
          },
          {
            type: "line", name: `${l.name} range`, stack: `band-${l.name}`, silent: true, symbol: "none",
            lineStyle: { opacity: 0 }, areaStyle: { color: l.color, opacity: 0.12 }, tooltip: { show: false },
            data: fc.points.map((p) => [p.year, p.high - p.low]),
          },
        );
      }
      if (fc) {
        series.push({
          type: "line", name: `${l.name} (forecast)`, symbol: "none", z: 2,
          lineStyle: { color: l.color, width: 2, type: [4, 4], opacity: 0.85 },
          itemStyle: { color: l.color },
          data: fc.points.map((p) => [p.year, p.value]),
          tooltip: { show: false },
        });
      }
      const lastPt = l.points[l.points.length - 1];
      series.push({
        type: "line", name: l.name, z: 3,
        symbol: "circle", symbolSize: 9, showSymbol: true,
        lineStyle: { color: l.color, width: l.reference ? 1.5 : 2, cap: "round", join: "round", type: l.reference ? [2, 3] : "solid" },
        itemStyle: { color: l.color, borderColor: t.surface, borderWidth: 2 },
        emphasis: { focus: "series", lineStyle: { width: 3 } },
        data: l.points.map((p) => [p.year, p.value]),
        endLabel: {
          show: direct && !l.reference && !fc,
          formatter: () => show(lastPt.value), color: t.ink2, fontSize: 11, distance: 6,
        },
      });
      if (fc && direct && !l.reference) {
        const end = fc.points[fc.points.length - 1];
        series.push({
          type: "line", name: `${l.name} end`, symbol: "circle", symbolSize: 7, silent: true, tooltip: { show: false },
          itemStyle: { color: t.surface, borderColor: l.color, borderWidth: 2 }, lineStyle: { opacity: 0 },
          data: [[end.year, end.value]],
          label: { show: true, position: "right", formatter: () => show(end.value), color: t.muted, fontSize: 11 },
        });
      }
    }

    const fcStart = Math.min(...lines.map((l) => l.forecast?.points[0]?.year ?? Infinity));

    return {
      ...baseOption(t),
      grid: { left: 8, right: 56, top: 16, bottom: 8, containLabel: true },
      xAxis: {
        type: "value", min: minYear, max: maxYear, interval: maxYear - minYear > 6 ? 5 : 1,
        axisLabel: { color: t.muted, formatter: (v: number) => `${v}`, fontSize: 11 },
        axisLine: { lineStyle: { color: t.axis } }, axisTick: { show: false }, splitLine: { show: false },
      },
      yAxis: {
        type: "value", scale: false,
        min: indexed ? undefined : 0,
        max: unit === "percent" && !indexed ? (v: { max: number }) => Math.min(100, Math.ceil((v.max + 5) / 10) * 10) : undefined,
        axisLabel: { color: t.muted, formatter: axisFmt(unit, indexed), fontSize: 11 },
        splitLine: { lineStyle: { color: t.grid, width: 1 } },
      },
      tooltip: {
        ...(baseOption(t).tooltip as object),
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: t.axis } },
        formatter: (items: { seriesName: string; value: [number, number]; color: string }[]) => {
          const year = items[0]?.value[0];
          const rows = lines
            .map((l) => {
              const obs = l.points.find((p) => p.year === year);
              const f = l.forecast?.points.find((p) => p.year === year && p.year !== l.points[l.points.length - 1].year);
              if (!obs && !f) return "";
              const val = obs
                ? `<b>${show(obs.value)}</b>`
                : `<b>${show(f!.value)}</b> <span style="color:${t.muted}">(${show(f!.low)}–${show(f!.high)})</span>`;
              return `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${l.color};margin-right:6px"></span>${l.name}</span><span>${val}</span></div>`;
            })
            .join("");
          const tag = year > fcStart - 0.5 && year !== fcStart ? ` <span style="color:${t.muted}">· projected</span>` : "";
          return rows ? `<div style="min-width:180px"><div style="color:${t.muted};margin-bottom:4px">FY${year}${tag}</div>${rows}</div>` : "";
        },
      },
      series,
    };
  }, [lines, unit, indexed, t]);

  return <Chart option={option} height={height} ariaLabel={label} />;
}

export function BarList({
  rows,
  unit,
  label,
  highlight,
}: {
  rows: { name: string; value: number }[];
  unit: Unit;
  label: string;
  highlight?: string;
}) {
  const t = useTheme();
  const option = useMemo<EChartsCoreOption>(() => {
    const data = [...rows].reverse();
    return {
      ...baseOption(t),
      grid: { left: 8, right: 56, top: 4, bottom: 4, containLabel: true },
      xAxis: {
        type: "value", min: 0,
        axisLabel: { show: false }, splitLine: { show: false },
      },
      yAxis: {
        type: "category", data: data.map((r) => r.name),
        axisLabel: { color: t.ink2, fontSize: 12, width: 190, overflow: "break" },
        axisLine: { show: false }, axisTick: { show: false },
      },
      tooltip: {
        ...(baseOption(t).tooltip as object), trigger: "item",
        formatter: (p: { name: string; value: number }) => `${p.name}<br/><b>${fmt(p.value, unit)}</b>`,
      },
      series: [
        {
          type: "bar", barMaxWidth: 18, barCategoryGap: "38%",
          data: data.map((r) => ({
            value: r.value,
            itemStyle: { color: highlight && r.name !== highlight ? t.series[0] + "99" : t.series[0], borderRadius: [0, 4, 4, 0] },
          })),
          label: { show: true, position: "right", color: t.ink2, fontSize: 11, formatter: (p: { value: number }) => fmt(p.value, unit) },
        },
      ],
    };
  }, [rows, unit, t, highlight]);
  return <Chart option={option} height={Math.max(120, rows.length * 38 + 16)} ariaLabel={label} />;
}

/** Minimal inline sparkline: de-emphasised line with the latest point accented. */
export function Sparkline({ values, width = 84, height = 26, inverse = false }: { values: number[]; width?: number; height?: number; inverse?: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => 4 + (i / (values.length - 1)) * (width - 8);
  const y = (v: number) => height - 4 - ((v - min) / (max - min || 1)) * (height - 8);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const li = values.length - 1;
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={inverse ? "rgba(255,255,255,.55)" : "var(--muted)"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(li)} cy={y(values[li])} r={3.5} fill={inverse ? "#e71921" : "var(--accent)"} stroke={inverse ? "#fff" : "var(--surface)"} strokeWidth={1.5} />
    </svg>
  );
}
