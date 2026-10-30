import { useEffect, useRef, useState } from "react";
import { streamSummary } from "../lib/ai";
import { CopyButton } from "./ui";

/** Gemini-written summary of the chart on screen. Only rendered in `npm run dev`. */
export function AiSummary({ payload, title }: { payload: unknown; title: string }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);

  // Stop an in-flight request when the chart changes or the view unmounts.
  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setText("");
    setError("");
    setStatus("loading");
    try {
      await streamSummary(payload, setText, ctrl.signal);
      setStatus("done");
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const bullets = text.split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);

  return (
    <div className="mt-4 border-t border-hair pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">AI summary</h3>
          <p className="text-[12px] text-muted">Written by Gemini from the numbers above. Check before quoting.</p>
        </div>
        <div className="flex gap-2">
          {status === "done" && <CopyButton text={[`${title} (AI summary)`, ...bullets.map((b) => `• ${b}`)].join("\n")} label="Copy" />}
          <button className="btn" onClick={run} disabled={status === "loading"}>
            {status === "loading" ? "Writing…" : status === "idle" ? "Summarize with AI" : "Regenerate"}
          </button>
        </div>
      </div>
      {bullets.length > 0 && (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-ink-2" aria-live="polite">
          {bullets.map((b, k) => <li key={k}>{b}</li>)}
        </ul>
      )}
      {status === "error" && <p className="mt-3 text-[13px]" style={{ color: "var(--bad)" }} role="alert">{error}</p>}
    </div>
  );
}
