import { useState, type ReactNode } from "react";
import type { Insight } from "../lib/narrative";

/** Opens a topic in the Trend Explorer, broken down by one dimension. */
export type Go = (topic: string, dimension: string) => void;

export function Card({ title, subtitle, actions, children, className = "" }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 sm:p-5 min-w-0 ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="card-title text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Delta({ value, text, goodWhenUp = true, inverse = false }: { value: number; text: string; goodWhenUp?: boolean; inverse?: boolean }) {
  const up = value > 0;
  const flat = Math.abs(value) < 1e-9;
  const good = flat ? null : up === goodWhenUp;
  const color = inverse
    ? good === null ? "rgba(255,255,255,.7)" : good ? "#9be89b" : "#ffb3b6"
    : good === null ? "var(--muted)" : good ? "var(--good)" : "var(--bad)";
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium" style={{ color }}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        {flat ? <path d="M1 5h8" stroke="currentColor" strokeWidth="1.8" /> : <path d={up ? "M5 1l4 6H1z" : "M5 9L1 3h8z"} fill="currentColor" />}
      </svg>
      {text}
    </span>
  );
}

export function StatTile({ label, value, delta, note, onClick }: {
  label: string;
  value: string;
  delta?: ReactNode;
  note?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`card p-4 text-left min-w-0 ${onClick ? "cursor-pointer hover:bg-[var(--surface-2)] transition-colors" : ""}`}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 text-[26px] font-semibold leading-tight text-ink">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {delta}
        {note && <span className="text-[12px] text-muted">{note}</span>}
      </div>
    </Tag>
  );
}

const ICON: Record<Insight["kind"], string> = {
  headline: "M3 12l5-5 4 4 7-7",
  momentum: "M4 18c4-1 6-6 8-10s4-5 8-5",
  segment: "M5 20V10M12 20V4M19 20v-7",
  gap: "M4 8h16M4 16h16M8 4v4M16 16v4",
  forecast: "M3 17l6-6 4 4 4-4M17 7h4v4",
  caveat: "M12 8v5M12 16.5v.5M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  snapshot: "M4 6h16M4 12h10M4 18h6",
};

export function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <ul className="space-y-3">
      {insights.map((i, k) => (
        <li key={k} className="flex gap-3 text-[14px] leading-relaxed text-ink-2">
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: i.kind === "caveat" ? "var(--surface-2)" : "var(--accent-wash)", color: i.kind === "caveat" ? "var(--muted)" : "var(--accent)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICON[i.kind]} />
            </svg>
          </span>
          <span className={i.kind === "caveat" ? "text-[13px] text-muted" : ""}>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button className="chip" aria-pressed={on} onClick={() => onChange(!on)}>
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.value)} className="chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function download(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
