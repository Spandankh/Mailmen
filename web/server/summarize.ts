import type { IncomingMessage } from "node:http";
import { GoogleGenAI } from "@google/genai";
import type { Plugin } from "vite";
import { isCrossSite } from "./origin.ts";

// Dev-server only: adds POST /api/summarize, which sends the chart on screen to Gemini and
// streams the reply back as plain text. The API key never reaches the browser, and
// `vite build` output doesn't include this route at all.

const SYSTEM = `You are a data analyst writing for USPS strategy staff. You summarize one chart from the USPS Household Mail Survey.

Rules:
- Use only the numbers in the data you are given. Never invent or estimate a figure that isn't there.
- Don't calculate new percentages, ratios or differences. Use the change, annual_rate and projection fields as given.
- For direction and peaks, use each group's "pattern" field (e.g. "rose, then fell; peak FY2020") instead of working them out from the values.
- "computed_findings" were calculated by code and are correct. Build on them; don't contradict them.
- Before saying something holds for all groups, every group or across groups, check it against each group's pattern. If any group differs, say "most groups" and name the exception.
- Write 3 to 5 short bullet points, each on its own line starting with "- ". Plain text only: no markdown, bold, headings or tables.
- Lead with the most important finding. Then cover the groups that differ most, and what the trend means for USPS if it continues.
- Every FY value in "values" is an actual survey result, including the latest year. Only fields named projection_* are projections.
- Projections are simple extrapolations from a few survey years. Call them projections, not predictions.
- If the data includes a caveat, mention it where it affects a conclusion.
- Be plain and specific. No filler like "it is worth noting".`;

const MAX_BODY = 100_000;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) reject(new Error("Request too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function summarizePlugin(env: Record<string, string>): Plugin {
  const model = env.GEMINI_MODEL || "gemini-3.8-flash";
  return {
    name: "ai-summary",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/summarize", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end("Method not allowed");
        }
        if (isCrossSite(req)) {
          res.statusCode = 403;
          return res.end("Cross-site requests are not allowed");
        }
        if (!env.GEMINI_API_KEY) {
          res.statusCode = 503;
          return res.end("No Gemini API key. Add GEMINI_API_KEY to web/.env.local and restart the dev server.");
        }

        let data: unknown;
        try {
          data = JSON.parse(await readBody(req));
        } catch {
          res.statusCode = 400;
          return res.end("Invalid request");
        }

        try {
          const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
          const stream = await ai.interactions.create({
            model,
            system_instruction: SYSTEM,
            input: `Summarize this chart.\n\n${JSON.stringify(data, null, 1)}`,
            generation_config: { max_output_tokens: 2048, thinking_level: "low" },
            stream: true,
          });
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          for await (const event of stream) {
            if (event.event_type === "step.delta" && event.delta.type === "text") res.write(event.delta.text);
            else if (event.event_type === "error") throw new Error(event.error?.message ?? "Gemini returned an error");
          }
          res.end();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          server.config.logger.error(`[ai-summary] ${message}`);
          // Headers already went out if the stream failed partway; just close it.
          if (res.headersSent) return res.end(`\n\n[Summary interrupted: ${message}]`);
          res.statusCode = 502;
          res.end(`Gemini request failed: ${message}`);
        }
      });
    },
  };
}
