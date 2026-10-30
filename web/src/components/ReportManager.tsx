import { useEffect, useState } from "react";
import { data, lastYear } from "../lib/data";

// Message carried across the reload that follows a change: Vite reloads the page when hms.json is rewritten.
const FLASH = "report-manager-flash";

interface Result {
  error?: string;
  needsReplace?: boolean;
  warnings?: string[];
  fiscalYear?: number;
  values?: number;
}

/** Reports in the dataset. Under `npm run dev` it can also add or remove one via the dev server. */
export function ReportManager() {
  const [file, setFile] = useState<File | null>(null);
  const [fy, setFy] = useState(String(lastYear + 1));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);

  useEffect(() => {
    try {
      const flash = sessionStorage.getItem(FLASH);
      if (flash) {
        sessionStorage.removeItem(FLASH);
        setMessage(JSON.parse(flash));
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const pick = (f: File | null) => {
    setFile(f);
    setMessage(null);
    const year = f?.name.match(/(?:19|20)\d\d/)?.[0];
    if (year) setFy(year);
  };

  const call = async (method: "POST" | "DELETE", year: string, body?: File, replace = false): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/reports?fy=${year}${replace ? "&replace=1" : ""}`, { method, body });
      const out: Result = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
      if (res.status === 409 && out.needsReplace) {
        if (confirm(`${out.error} The current FY${year} PDF will be overwritten.`)) return call(method, year, body, true);
        return;
      }
      if (!res.ok) {
        setMessage({ ok: false, text: out.error ?? "Something went wrong.", details: out.warnings });
        return;
      }
      const done = method === "POST"
        ? { ok: true, text: `Added FY${out.fiscalYear}: ${out.values} values extracted.`, details: out.warnings }
        : { ok: true, text: `Removed FY${year}.` };
      try {
        sessionStorage.setItem(FLASH, JSON.stringify(done));
      } catch {
        /* storage unavailable: the message is lost on reload, the data still updates */
      }
      setMessage({ ...done, text: `${done.text} Reloading…` });
      // Vite normally reloads on its own once hms.json changes; this covers the case where it doesn't.
      setTimeout(() => location.reload(), 2500);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ul className="space-y-1 text-[14px] text-ink-2">
        {data.reports.map((r) => (
          <li key={r.file} className="flex items-center justify-between gap-2">
            <span>Household Mail Survey FY{r.fiscal_year} · <span className="text-muted">{r.values} values</span></span>
            {import.meta.env.DEV && data.reports.length > 1 && (
              <button
                className="text-[12px] text-muted underline hover:text-[var(--bad)]"
                disabled={busy}
                onClick={() => confirm(`Remove the FY${r.fiscal_year} report? Its PDF is deleted from pipeline/reports/ and the dataset is rebuilt without it.`) && call("DELETE", String(r.fiscal_year))}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted">Each report restates earlier years; the newest report wins when values differ.</p>

      {import.meta.env.DEV && (
        <div className="mt-4 space-y-2 border-t border-hair pt-3">
          <h3 className="text-[13px] font-semibold text-ink">Add a report</h3>
          <input type="file" accept="application/pdf,.pdf" disabled={busy} aria-label="Report PDF"
            className="block w-full text-[13px] text-ink-2 file:mr-2 file:rounded-md file:border file:border-[var(--border)] file:bg-[var(--surface-2)] file:px-2 file:py-1 file:text-[13px] file:text-[var(--ink)]"
            onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[13px] text-muted" htmlFor="report-fy">Fiscal year</label>
            <input id="report-fy" className="select w-24" style={{ backgroundImage: "none", paddingRight: 12 }}
              inputMode="numeric" value={fy} disabled={busy} onChange={(e) => setFy(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            <button className="btn" disabled={!file || fy.length !== 4 || busy} onClick={() => file && call("POST", fy, file)}>
              {busy ? "Extracting…" : "Add"}
            </button>
          </div>
          <p className="text-[12px] text-muted">Runs the extraction pipeline on the PDF. Works with Household Mail Survey reports laid out like FY2025.</p>
        </div>
      )}

      {message && (
        <div className="mt-3 text-[13px]" role={message.ok ? "status" : "alert"} style={{ color: message.ok ? "var(--good)" : "var(--bad)" }}>
          <p>{message.text}</p>
          {message.details && message.details.length > 0 && (
            <details className="mt-1 text-muted">
              <summary className="cursor-pointer">{message.details.length} extraction warning{message.details.length === 1 ? "" : "s"}</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px]">{message.details.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
