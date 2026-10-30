import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CAVEATS, data, firstYear, fmt, lastYear, overall, seriesFor, topicById } from "../lib/data";
import { analyze, forecast, indexTo } from "../lib/trends";
import { describeChange, describeRate, trendNarrative } from "../lib/narrative";
import { TrendChart, type Line } from "../components/charts";
import { ThemeScope, lightTheme, useTheme, type Theme } from "../components/Chart";
import { MARKET_TOPICS, householdShifts, keyFindings, marketsHeadline } from "../lib/findings";

// Slides are laid out at a fixed 1280×720 and scaled to fit, so the page, full-screen mode and the
// PDF (one slide per 1280×720 page) all share one layout.
const W = 1280;
const H = 720;
const HORIZON = lastYear + 5;

interface SlideDef {
  kicker: string;
  title: string;
  body: ReactNode;
  cover?: boolean;
}

const verb = (change: number) => (change > 0 ? "rose" : "fell");

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-4 text-[19px] leading-snug text-ink-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-[9px] h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--brand-red)" }} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** Largest declines and increases by household group, drawn as bars from a shared zero line. */
function Shifts({ rows }: { rows: { label: string; detail: string; change: number }[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.change)));
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => {
        // Longest bar takes 40% of the width, leaving room for its label inside the slide.
        const w = (Math.abs(r.change) / max) * 40;
        const up = r.change > 0;
        return (
          <div key={i} className="grid grid-cols-[400px_1fr] items-center gap-4">
            <div className="text-right text-[15px] leading-tight">
              <div className="text-ink">{r.label}</div>
              <div className="text-[13px] text-muted">{r.detail}</div>
            </div>
            <div className="relative h-7">
              <div className="absolute inset-y-[-4px] left-1/2 w-px" style={{ background: "var(--axis)" }} />
              <div className="absolute inset-y-0 rounded" style={{ background: up ? "var(--div-pos)" : "var(--div-neg)", width: `${w}%`, left: up ? "50%" : `${50 - w}%` }} />
              <span className="absolute top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink tnum"
                style={up ? { left: `calc(50% + ${w}% + 8px)` } : { right: `calc(50% + ${w}% + 8px)` }}>
                {up ? "+" : ""}{Math.round(r.change * 100)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildSlides(t: Theme): SlideDef[] {
  const slides: SlideDef[] = [];
  const total = overall("total_mail")!;
  const totalTopic = topicById.total_mail;
  const totalStats = analyze(total.points, "pieces")!;
  const last = total.points[total.points.length - 1];

  slides.push({
    kicker: "Postal Insights",
    title: "How U.S. households use mail",
    cover: true,
    body: (
      <div className="mt-auto space-y-3">
        <p className="text-[24px]" style={{ color: "rgba(255,255,255,.85)" }}>
          Findings from the USPS Household Mail Survey, FY{firstYear}–FY{lastYear}
        </p>
        <p className="text-[16px]" style={{ color: "rgba(255,255,255,.6)" }}>
          Draft report · prepared {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · every figure is generated from the survey data
        </p>
      </div>
    ),
  });

  slides.push({
    kicker: "The big picture",
    title: `Mail per household ${verb(totalStats.change)} ${describeChange(totalStats, totalTopic).replace(/^[+-]/, "")} since FY${firstYear}`,
    body: (
      <div className="grid h-full grid-cols-[1.35fr_1fr] gap-10">
        <TrendChart height={470} unit="pieces" label="Total household mail trend"
          lines={[{ name: "All household mail", color: t.series[0], points: total.points, forecast: forecast(total.points, "pieces", HORIZON), band: true }]} />
        <div className="flex flex-col gap-6">
          <div>
            <div className="text-[64px] font-semibold leading-none tracking-tight text-ink">{fmt(last.value, "pieces")}</div>
            <div className="mt-1 text-[17px] text-muted">pieces sent and received per household in FY{lastYear}</div>
          </div>
          <Bullets items={trendNarrative(totalTopic, "Overall", HORIZON).map((i) => i.text)} />
        </div>
      </div>
    ),
  });

  const markets = MARKET_TOPICS.map((m, i) => {
    const s = overall(m.topic)!;
    return { ...m, color: t.series[i], s, stats: analyze(s.points, "pieces")! };
  });
  const lines: Line[] = markets.map((m) => ({ name: m.name, color: m.color, points: indexTo(m.s.points, firstYear) }));
  slides.push({
    kicker: "Mail markets",
    title: marketsHeadline(markets),
    body: (
      <div className="grid h-full grid-cols-[1.35fr_1fr] gap-10">
        <div>
          <p className="mb-2 text-[14px] text-muted">Pieces per household, indexed to FY{firstYear} = 100</p>
          <TrendChart height={450} lines={lines} unit="pieces" indexed label="Mail markets indexed trend" />
        </div>
        <table className="data self-center text-[17px]" style={{ fontSize: 17 }}>
          <thead>
            <tr><th>Market</th><th className="num">FY{lastYear}</th><th className="num">Since FY{firstYear}</th><th className="num">Per year</th></tr>
          </thead>
          <tbody>
            {markets.map((m) => (
              <tr key={m.name}>
                <td className="text-ink">
                  <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: m.color }} />{m.name}
                </td>
                <td className="num">{fmt(m.s.points[m.s.points.length - 1].value, "pieces")}</td>
                <td className="num" style={{ color: m.stats.change > 0 ? "var(--good)" : "var(--bad)" }}>{describeChange(m.stats, topicById[m.topic])}</td>
                <td className="num">{describeRate(m.stats.rate, topicById[m.topic])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  });

  MARKET_TOPICS.forEach((m, i) => {
    // Each market's own slide uses the per-household volume that has demographic breakdowns.
    const topic = topicById[m.detail];
    const s = overall(topic.id)!;
    const stats = analyze(s.points, topic.unit)!;
    const insights = trendNarrative(topic, "Age", HORIZON).filter((x) => x.kind !== "caveat");
    slides.push({
      kicker: `Market ${i + 1} of ${MARKET_TOPICS.length}`,
      title: `${topic.label} ${verb(stats.change)} ${describeChange(stats, topic).replace(/^[+-]/, "")} since FY${firstYear}`,
      body: (
        <div className="grid h-full grid-cols-[1.2fr_1fr] gap-10">
          <div>
            <p className="mb-2 text-[14px] text-muted">{topic.desc} Dashed line: projection to {HORIZON}.</p>
            <TrendChart height={440} unit={topic.unit} label={`${topic.label} trend`}
              lines={[{ name: topic.label, color: t.series[i], points: s.points, forecast: forecast(s.points, topic.unit, HORIZON), band: true }]} />
          </div>
          <Bullets items={insights.map((x) => x.text)} />
        </div>
      ),
    });
  });

  const billsTopic = topicById.bills_paid_mail_share;
  const bills = overall(billsTopic.id);
  const billsStats = bills && analyze(bills.points, billsTopic.unit);
  if (bills && billsStats) {
    const byAge = seriesFor(billsTopic.id, "Age");
    slides.push({
      kicker: "Paying bills",
      title: `Only ${fmt(bills.points[bills.points.length - 1].value, "percent")} of household bills are now paid by mail`,
      body: (
        <div className="grid h-full grid-cols-[1.2fr_1fr] gap-10">
          <div>
            <p className="mb-2 text-[14px] text-muted">Share of bills paid by mail, by age of head of household</p>
            <TrendChart height={440} unit="percent" label="Share of bills paid by mail by age"
              lines={byAge.map((s, k) => ({ name: s.segment, color: t.series[k % 8], points: s.points }))} />
            <div className="mt-1 flex flex-wrap gap-x-4 text-[14px] text-ink-2">
              {byAge.map((s, k) => (
                <span key={s.segment} className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm" style={{ background: t.series[k % 8] }} />{s.segment}
                </span>
              ))}
            </div>
          </div>
          <Bullets items={trendNarrative(billsTopic, "Age", HORIZON).filter((x) => x.kind !== "caveat").map((x) => x.text)} />
        </div>
      ),
    });
  }

  const swings = householdShifts();
  // Biggest first on both sides: steepest declines, then largest increases.
  const picked = [...swings.slice(0, 4), ...swings.slice(-4).reverse()];
  slides.push({
    kicker: "Household groups",
    title: "Which households changed the most",
    body: (
      <div className="flex h-full flex-col justify-center gap-4">
        <Shifts rows={picked.map(({ s, change }) => ({
          label: `${topicById[s.topic].label} · ${s.segment}`,
          detail: `${s.dimension} · ${fmt(s.points[0].value, "pieces")} → ${fmt(s.points[s.points.length - 1].value, "pieces")} pieces per household`,
          change,
        }))} />
        <p className="text-center text-[14px] text-muted">
          Change in pieces per household, FY{firstYear}–FY{lastYear}. Four largest declines and increases across age, income, education and homeownership groups.
        </p>
      </div>
    ),
  });

  slides.push({
    kicker: "Summary",
    title: "Key findings",
    body: <div className="columns-2 gap-12 [&_li]:break-inside-avoid"><Bullets items={keyFindings().map((f) => f.text)} /></div>,
  });

  slides.push({
    kicker: "About this report",
    title: "Sources and method",
    body: (
      <div className="grid grid-cols-2 gap-12 text-[16px] leading-relaxed text-ink-2">
        <div className="space-y-4">
          <p>
            <b className="text-ink">Data.</b> USPS Household Mail Survey (formerly Household Diary Study), filed with the Postal Regulatory Commission.
            Reports loaded: {data.reports.map((r) => `FY${r.fiscal_year}`).join(", ")}. Each report restates earlier years; the newest report wins when values differ.
          </p>
          <p>
            <b className="text-ink">Rates.</b> Volumes use compound annual rates; shares use percentage points per year.
            Projections to {HORIZON} extend recent trends and are not USPS forecasts.
          </p>
        </div>
        <div className="space-y-4">
          {Object.entries(CAVEATS).map(([dim, text]) => <p key={dim}><b className="text-ink">{dim}.</b> {text}</p>)}
          {data.notes.length > 0 && <p><b className="text-ink">Data notes.</b> {data.notes.join(" ")}</p>}
          <p className="text-muted">Every chart and sentence in this report was generated from the extracted survey tables by Postal Insights.</p>
        </div>
      </div>
    ),
  });

  return slides;
}

function Slide({ def, n, total }: { def: SlideDef; n: number; total: number }) {
  return (
    <section className={`slide ${def.cover ? "slide-cover" : ""}`} style={{ width: W, height: H }} aria-label={`Slide ${n} of ${total}: ${def.title}`}>
      <div className="text-[14px] font-semibold uppercase tracking-[0.12em]" style={{ color: def.cover ? "rgba(255,255,255,.7)" : "var(--brand-red)" }}>{def.kicker}</div>
      <h2 className={`mt-2 font-semibold tracking-tight ${def.cover ? "text-[64px] leading-[1.05] text-white" : "text-[34px] leading-tight text-ink"}`}>{def.title}</h2>
      <div className={`flex min-h-0 flex-1 flex-col ${def.cover ? "" : "mt-7"}`}>{def.body}</div>
      {!def.cover && (
        <footer className="mt-4 flex justify-between text-[12px] text-muted">
          <span>Postal Insights · Household Mail Survey FY{firstYear}–FY{lastYear}</span>
          <span className="tnum">{n} / {total}</span>
        </footer>
      )}
    </section>
  );
}

/** Scales a fixed-size slide to fit its container. */
function Fit({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setScale(Math.min(el.clientWidth / W, fill ? el.clientHeight / H : Infinity)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);
  return (
    <div ref={box} className={fill ? "flex h-full w-full items-center justify-center" : "w-full"}>
      <div style={{ width: W * scale, height: H * scale }}>
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
}

export function Report() {
  const t = useTheme();
  const slides = useMemo(() => buildSlides(t), [t]);
  // The slide number lives in the URL (#/report/3) so a link can open a specific slide.
  const [i, setI] = useState(() => Math.max(0, Math.min(slides.length - 1, (Number(location.hash.split("/")[2]) || 1) - 1)));
  useEffect(() => history.replaceState(null, "", `#/report/${i + 1}`), [i]);
  const [printTheme, setPrintTheme] = useState<Theme | null>(null);
  const [preparing, setPreparing] = useState(false);
  const printSlides = useMemo(() => printTheme && buildSlides(printTheme), [printTheme]);
  const [full, setFull] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const go = (n: number) => setI(Math.max(0, Math.min(slides.length - 1, n)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, select, textarea, [contenteditable]")) return;
      // Space activates a focused button or link; only full screen (where those are hidden) takes it over.
      if (e.key === " " && !document.fullscreenElement && target.closest("button, a")) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) setI((x) => Math.min(slides.length - 1, x + 1));
      else if (["ArrowLeft", "PageUp"].includes(e.key)) setI((x) => Math.max(0, x - 1));
      else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(slides.length - 1);
      else return;
      e.preventDefault();
    };
    const onFull = () => setFull(document.fullscreenElement === stage.current);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFull);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFull);
    };
  }, [slides.length]);

  const downloadPdf = () => {
    // The printed copy is pinned to light colors (.theme-light + ThemeScope) so it reads well on paper,
    // while the page keeps its own theme. Nothing global changes, so there is nothing to restore.
    setPrintTheme(lightTheme());
    setPreparing(true);
    const done = () => {
      window.removeEventListener("afterprint", done);
      setPrintTheme(null);
    };
    window.addEventListener("afterprint", done);
    // Give the charts time to draw and finish their entry animation before the browser snapshots them.
    setTimeout(() => {
      setPreparing(false);
      window.print();
    }, 900);
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Draft report</h2>
          <p className="text-[13px] text-muted">
            {slides.length} slides generated from the survey data. Present them full screen, or download a PDF with one slide per page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => stage.current?.requestFullscreen()}>Present</button>
          <button className="btn" onClick={downloadPdf} disabled={preparing}>{preparing ? "Preparing PDF…" : "Download PDF"}</button>
        </div>
      </div>

      {/* Full screen hides the buttons below, so a click on the slide advances instead. */}
      <div ref={stage} className={full ? "h-full cursor-pointer bg-black" : ""} onClick={() => full && go(i + 1)}>
        <Fit fill={full}>
          <Slide def={slides[i]} n={i + 1} total={slides.length} />
        </Fit>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="btn" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide">◀ Previous</button>
        <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Slides">
          {slides.map((s, k) => (
            <button key={k} onClick={() => go(k)} aria-current={k === i ? "true" : undefined} title={s.title} aria-label={`Slide ${k + 1}: ${s.title}`}
              className="h-2.5 w-2.5 rounded-full transition-colors"
              style={{ background: k === i ? "var(--accent)" : "var(--grid)" }} />
          ))}
        </div>
        <button className="btn" onClick={() => go(i + 1)} disabled={i === slides.length - 1} aria-label="Next slide">Next ▶</button>
      </div>
      <p className="text-center text-[12px] text-muted">Tip: use ← and → to move between slides. Press Esc to leave full screen.</p>

      {printTheme && printSlides && createPortal(
        <ThemeScope.Provider value={printTheme}>
          <div className="print-deck theme-light">
            {printSlides.map((s, k) => <Slide key={k} def={s} n={k + 1} total={printSlides.length} />)}
          </div>
        </ThemeScope.Provider>,
        document.body,
      )}
    </div>
  );
}
