import { createContext, useContext, useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

echarts.use([LineChart, BarChart, HeatmapChart, GridComponent, TooltipComponent, MarkLineComponent, VisualMapComponent, SVGRenderer]);

export interface Theme {
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  series: string[];
  divNeg: string;
  divMid: string;
  divPos: string;
}

function readTheme(el: Element = document.documentElement): Theme {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    surface: v("--surface"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    muted: v("--muted"),
    grid: v("--grid"),
    axis: v("--axis"),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--s${i}`)),
    divNeg: v("--div-neg"),
    divMid: v("--div-mid"),
    divPos: v("--div-pos"),
  };
}

/** Overrides the page theme for the charts inside it, e.g. light colors for a PDF while the page stays dark. */
export const ThemeScope = createContext<Theme | null>(null);

/** The light theme's tokens, read from a throwaway `.theme-light` element. */
export function lightTheme(): Theme {
  const el = document.createElement("div");
  el.className = "theme-light";
  document.body.appendChild(el);
  const theme = readTheme(el);
  el.remove();
  return theme;
}

/** Re-reads the CSS tokens whenever the OS scheme or the in-app theme toggle changes. */
export function useTheme(): Theme {
  const scoped = useContext(ThemeScope);
  const [theme, setTheme] = useState(() => readTheme());
  useEffect(() => {
    const update = () => setTheme(readTheme());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", update);
      mo.disconnect();
    };
  }, []);
  return scoped ?? theme;
}

export function baseOption(t: Theme): EChartsCoreOption {
  return {
    backgroundColor: "transparent",
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: t.ink2 },
    animationDuration: 350,
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.grid,
      borderWidth: 1,
      padding: [8, 12],
      confine: true,
      textStyle: { color: t.ink, fontSize: 12 },
      extraCssText: "box-shadow:0 6px 20px rgba(0,0,0,.12);border-radius:10px;",
    },
  };
}

export function Chart({
  option,
  height = 320,
  onClick,
  ariaLabel,
}: {
  option: EChartsCoreOption;
  height?: number;
  onClick?: (p: { data?: unknown; name?: string; seriesName?: string; value?: unknown }) => void;
  ariaLabel: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: "svg" });
    inst.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      inst.current = null;
    };
  }, []);

  useEffect(() => {
    inst.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const chart = inst.current;
    if (!chart || !onClick) return;
    chart.on("click", onClick);
    return () => {
      chart.off("click", onClick);
    };
  }, [onClick]);

  return <div ref={el} role="img" aria-label={ariaLabel} style={{ height, width: "100%" }} />;
}
