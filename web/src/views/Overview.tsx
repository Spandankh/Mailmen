import { useMemo, useState } from "react";
import { firstYear, fmt, lastYear, overall } from "../lib/data";
import { forecast, indexTo } from "../lib/trends";
import { describeChange, describeRate } from "../lib/narrative";
import { MARKET_TOPICS, keyFindings, marketsHeadline, tileFor } from "../lib/findings";
import { Sparkline, TrendChart, type Line } from "../components/charts";
import { useTheme } from "../components/Chart";
import { Card, Delta, InsightList, StatTile, Toggle, type Go } from "../components/ui";

export function Overview({ go }: { go: Go }) {
  const t = useTheme();
  const [showForecast, setShowForecast] = useState(false);
  const findings = useMemo(keyFindings, []);
  const headline = useMemo(() => marketsHeadline(), []);
  const total = tileFor("total_mail")!;
  const usps = tileFor("usps_volume");
  const hh = tileFor("households");
  const tiles = ["packages_total", "bills_paid_mail_share", "bills_received_mail_share", "ad_reading_rate"].map(tileFor);
  const tileLabels: Record<string, string> = {
    packages_total: "Packages per household",
    bills_paid_mail_share: "Bills paid by mail",
    bills_received_mail_share: "Bills & statements received by mail",
    ad_reading_rate: "Advertising mail read",
  };

  const lines: Line[] = MARKET_TOPICS.map((m, i) => {
    const s = overall(m.topic)!;
    const pts = indexTo(s.points, firstYear);
    return { name: m.name, color: t.series[i], points: pts, forecast: showForecast ? forecast(pts, "pieces", lastYear + 5) : null };
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)]">
        <button className="card hero p-5 text-left transition-[filter] hover:brightness-110" onClick={() => go("total_mail", "Market")}>
          <div className="muted-inv text-[13px]">Mail per household, FY{lastYear}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[56px] font-semibold leading-none tracking-tight">{fmt(total.last.value, "pieces")}</span>
            <span className="muted-inv text-[15px]">pieces / year</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            {total.stats && <Delta inverse value={total.stats.change} text={`${describeChange(total.stats, total.t)} vs FY${firstYear}`} />}
            {total.stats && (
              <span className="muted-inv text-[12px]">
                ≈ {Math.abs(Math.round(total.stats.rate * 1000) / 10)}% {total.stats.rate < 0 ? "fewer" : "more"} pieces every year
              </span>
            )}
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <Sparkline inverse values={total.s.points.map((p) => p.value)} width={160} height={44} />
            {usps && hh && (
              <span className="muted-inv text-right text-[12px]">
                ≈ {fmt((total.last.value * hh.last.value) / 1000, "billions")} pieces in all — {Math.round(((total.last.value * hh.last.value) / 1000 / usps.last.value) * 100)}% of the {fmt(usps.last.value, "billions")} USPS delivered
              </span>
            )}
          </div>
        </button>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tiles.map((x) =>
            x && x.stats ? (
              <StatTile
                key={x.t.id}
                label={tileLabels[x.t.id]}
                value={fmt(x.last.value, x.t.unit)}
                delta={<Delta value={x.stats.change} text={`${describeChange(x.stats, x.t)} vs FY${firstYear}`} />}
                onClick={() => go(x.t.id, "Age")}
              />
            ) : null,
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card
          title={headline}
          subtitle={`Pieces per household, indexed to FY${firstYear} = 100`}
          actions={<Toggle on={showForecast} onChange={setShowForecast}>Project to {lastYear + 5}</Toggle>}
        >
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
            {lines.map((l) => (
              <span key={l.name} className="inline-flex items-center gap-1.5">
                <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
                {l.name}
              </span>
            ))}
          </div>
          <TrendChart lines={lines} unit="pieces" indexed label="Mail markets indexed trend" height={320} />
        </Card>

        <Card title="Key findings" subtitle="Generated automatically from the survey data — click one to explore">
          <ul className="space-y-1">
            {findings.map((f, i) => (
              <li key={i}>
                <button className="w-full rounded-lg p-2 text-left transition-colors hover:bg-[var(--surface-2)]" onClick={() => f.go && go(f.go[0], f.go[1])}>
                  <InsightList insights={[f]} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Mail markets at a glance" subtitle="Pieces per household per year · click a row to open it in the Trend Explorer">
        <div className="-mx-1 overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Market</th>
                {total.s.points.map((p) => <th key={p.year} className="num">FY{p.year}</th>)}
                <th className="num">Change</th>
                <th className="num">Annual rate</th>
                <th className="num">Recent 5 yrs</th>
                <th className="num">{lastYear + 5} projection</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {[...MARKET_TOPICS, { name: "All household mail", topic: "total_mail" }].map((m, i) => {
                const x = tileFor(m.topic)!;
                const fc = forecast(x.s.points, "pieces", lastYear + 5);
                const end = fc?.points[fc.points.length - 1];
                return (
                  <tr key={m.topic} className="cursor-pointer hover:bg-[var(--surface-2)]" onClick={() => go(m.topic, m.topic === "total_mail" ? "Market" : "Age")}>
                    <td className={i === MARKET_TOPICS.length ? "font-semibold text-ink" : "text-ink"}>
                      {i < MARKET_TOPICS.length && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: t.series[i] }} />}
                      {m.name}
                    </td>
                    {x.s.points.map((p) => <td key={p.year} className="num">{fmt(p.value, "pieces")}</td>)}
                    <td className="num"><Delta value={x.stats!.change} text={describeChange(x.stats!, x.t)} /></td>
                    <td className="num">{describeRate(x.stats!.rate, x.t)}</td>
                    <td className="num">{x.stats!.recentRate !== undefined ? describeRate(x.stats!.recentRate, x.t) : "—"}</td>
                    <td className="num">{end ? fmt(end.value, "pieces") : "—"}</td>
                    <td><Sparkline values={x.s.points.map((p) => p.value)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Market totals exclude double-counted household-to-household pieces. Advertising includes First-Class ad-enclosed mail that is also counted elsewhere, so markets do not sum to the total (Table E.2).
        </p>
      </Card>
    </div>
  );
}
