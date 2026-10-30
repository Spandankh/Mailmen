import { Suspense, lazy, startTransition, useCallback, useEffect, useState } from "react";
import { firstYear, lastYear } from "./lib/data";

// Each tab is its own chunk, so a visit downloads only the tabs it opens. ECharts is shared by the
// charting tabs and isn't loaded at all for Compare, Demographics or Data & Sources.
const Overview = lazy(() => import("./views/Overview").then((m) => ({ default: m.Overview })));
const Explorer = lazy(() => import("./views/Explorer").then((m) => ({ default: m.Explorer })));
const Demographics = lazy(() => import("./views/Demographics").then((m) => ({ default: m.Demographics })));
const Snapshot = lazy(() => import("./views/Snapshot").then((m) => ({ default: m.Snapshot })));
const DataView = lazy(() => import("./views/DataView").then((m) => ({ default: m.DataView })));
const Report = lazy(() => import("./views/Report").then((m) => ({ default: m.Report })));
const Compare = lazy(() => import("./views/Compare").then((m) => ({ default: m.Compare })));

type View = "overview" | "explore" | "demographics" | "compare" | "snapshot" | "report" | "data";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z" },
  { id: "explore", label: "Trend Explorer", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { id: "demographics", label: "Demographics", icon: "M9 7a3 3 0 106 0 3 3 0 00-6 0M4 21v-1a5 5 0 015-5h6a5 5 0 015 5v1" },
  { id: "compare", label: "Compare years", icon: "M8 3v18M16 3v18M3 8h5M16 16h5M3 16h5M16 8h5" },
  { id: "snapshot", label: `FY${lastYear} Snapshot`, icon: "M4 6h16M4 12h10M4 18h6" },
  { id: "report", label: "Report", icon: "M3 4h18v12H3zM8 20h8M12 16v4M7 12l3-3 2 2 4-4" },
  { id: "data", label: "Data & Sources", icon: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" },
];

interface Route {
  view: View;
  topic: string;
  dim: string;
}

function parseHash(): Route {
  const [view, topic, dim] = window.location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  return {
    view: (NAV.some((n) => n.id === view) ? view : "overview") as View,
    topic: topic || "correspondence",
    dim: dim || "Age",
  };
}

function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    // A transition keeps the current tab on screen while the next tab's chunk loads, instead of blanking to "Loading…".
    const on = () => startTransition(() => setRoute(parseHash()));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = useCallback((r: Partial<Route>) => {
    const next = { ...parseHash(), ...r };
    const hash = next.view === "explore" ? `#/explore/${encodeURIComponent(next.topic)}/${encodeURIComponent(next.dim)}` : `#/${next.view}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    window.scrollTo({ top: 0 });
  }, []);
  return [route, go] as const;
}

type ThemePref = "system" | "light" | "dark";

function useThemePref() {
  const [pref, setPref] = useState<ThemePref>(() => {
    try {
      return (localStorage.getItem("theme") as ThemePref) || "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (pref === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", pref);
    try {
      localStorage.setItem("theme", pref);
    } catch {
      /* storage unavailable */
    }
  }, [pref]);
  return [pref, setPref] as const;
}

export default function App() {
  const [route, go] = useRoute();
  const [theme, setTheme] = useThemePref();
  const explore = useCallback((topic: string, dim: string) => go({ view: "explore", topic, dim }), [go]);

  return (
    <div className="min-h-screen">
      <header className="masthead sticky top-0 z-20">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /><path d="M3 17h18" stroke="#e71921" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-semibold tracking-tight text-white">Postal Insights</h1>
            <p className="sub truncate text-[12px]">How U.S. households use mail · Household Mail Survey FY{firstYear}–FY{lastYear}</p>
          </div>
          <button
            className="btn"
            onClick={() => setTheme(theme === "system" ? "dark" : theme === "dark" ? "light" : "system")}
            aria-label={`Theme: ${theme}. Click to change.`}
            title={`Theme: ${theme}`}
          >
            {theme === "dark" ? "☾ Dark" : theme === "light" ? "☀ Light" : "◐ Auto"}
          </button>
        </div>
        <nav className="mx-auto max-w-[1400px] overflow-x-auto px-4 sm:px-6" aria-label="Sections">
          <div className="flex gap-1">
            {NAV.map((n) => {
              const active = route.view === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => go({ view: n.id })}
                  aria-current={active ? "page" : undefined}
                  className="tab flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={n.icon} />
                  </svg>
                  {n.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <Suspense fallback={<p className="py-10 text-center text-[13px] text-muted">Loading…</p>}>
          {route.view === "overview" && <Overview go={explore} />}
          {route.view === "explore" && <Explorer topicId={route.topic} dimension={route.dim} onChange={explore} />}
          {route.view === "demographics" && <Demographics go={explore} />}
          {route.view === "compare" && <Compare go={explore} />}
          {route.view === "snapshot" && <Snapshot go={explore} />}
          {route.view === "report" && <Report />}
          {route.view === "data" && <DataView />}
        </Suspense>
      </main>

      <footer className="site-footer mt-4">
        <div className="mx-auto max-w-[1400px] px-4 py-5 text-[12px] sm:px-6">
        Source: USPS Household Mail Survey (formerly Household Diary Study), filed with the Postal Regulatory Commission. Projections are statistical extrapolations, not USPS forecasts.
        </div>
      </footer>
    </div>
  );
}
