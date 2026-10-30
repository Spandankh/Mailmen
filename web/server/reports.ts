import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Plugin } from "vite";
import { isCrossSite } from "./origin.ts";

// Dev-server only: lets the Data & Sources tab add or remove a survey report.
//   POST   /api/reports?fy=2026[&replace=1]   body: the PDF
//   DELETE /api/reports?fy=2026
// Each change saves the PDF into pipeline/reports/, reruns pipeline/extract_hms.py and only then
// replaces web/src/data/hms.json. If the report yields no data or the pipeline fails, the PDF
// folder is put back the way it was and the dataset is left untouched.

const MAX_PDF = 100 * 1024 * 1024;

interface Dataset {
  reports: { fiscal_year: number; file: string; values: number }[];
  series: unknown[];
  warnings: string[];
  notes: string[];
}

function readPdf(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_PDF) {
        reject(new Error("PDF is larger than 100 MB"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: object) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function reportsPlugin(): Plugin {
  // One change at a time: two uploads racing would each rebuild from a half-changed folder.
  let queue: Promise<unknown> = Promise.resolve();

  return {
    name: "load-reports",
    apply: "serve",
    configureServer(server) {
      const repo = path.resolve(server.config.root, "..");
      const reportsDir = path.join(repo, "pipeline", "reports");
      const dataFile = path.join(server.config.root, "src", "data", "hms.json");
      const venv = path.join(repo, ".venv", "bin", "python");
      const python = existsSync(venv) ? venv : "python3";

      /** Runs the pipeline into a temp file and returns the dataset it produced. */
      const extract = (out: string) =>
        new Promise<Dataset>((resolve, reject) => {
          execFile(python, [path.join(repo, "pipeline", "extract_hms.py"), "--out", out],
            { cwd: repo, timeout: 5 * 60_000, maxBuffer: 10 * 1024 * 1024 },
            async (err, _stdout, stderr) => {
              if (err) {
                const missing = /No module named ['"]?pypdf/.test(stderr);
                return reject(new Error(missing
                  ? "The pipeline needs pypdf. Set up the Python environment as described in the README (Updating the data)."
                  : `Pipeline failed: ${stderr.trim().split("\n").pop() || err.message}`));
              }
              try {
                resolve(JSON.parse(await readFile(out, "utf8")));
              } catch (e) {
                reject(e);
              }
            });
        });

      const handle = async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? "", "http://localhost");
        const fy = Number(url.searchParams.get("fy"));
        if (!Number.isInteger(fy) || fy < 1990 || fy > 2100) return send(res, 400, { error: "Pick a fiscal year between 1990 and 2100." });
        if (req.method !== "POST" && req.method !== "DELETE") return send(res, 405, { error: "Method not allowed" });

        const target = path.join(reportsDir, `hms_fy${fy}.pdf`);
        const exists = existsSync(target);
        let pdf: Buffer | undefined;

        if (req.method === "POST") {
          pdf = await readPdf(req);
          if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return send(res, 400, { error: "That file isn't a PDF." });
          if (exists && url.searchParams.get("replace") !== "1") {
            return send(res, 409, { error: `There's already a FY${fy} report. Replace it?`, needsReplace: true });
          }
        } else if (!exists) {
          return send(res, 404, { error: `No FY${fy} report to remove.` });
        } else if ((await readdir(reportsDir)).filter((f) => /^hms_fy\d{4}\.pdf$/.test(f)).length < 2) {
          return send(res, 400, { error: "This is the only report. Add another before removing it." });
        }

        const tmp = await mkdtemp(path.join(tmpdir(), "hms-"));
        const backup = path.join(tmp, "previous.pdf");
        try {
          // Set the old PDF aside so a failed run can put it back.
          if (exists) await copyFile(target, backup);
          if (pdf) await writeFile(target, pdf);
          else await rm(target);

          let next: Dataset;
          try {
            next = await extract(path.join(tmp, "hms.json"));
          } catch (e) {
            await restore();
            throw e;
          }

          const added = next.reports.find((r) => r.fiscal_year === fy);
          if (pdf && !added?.values) {
            await restore();
            await rm(tmp, { recursive: true, force: true });
            return send(res, 422, {
              error: `No tables were recognized in this PDF, so nothing changed. The pipeline's table definitions (pipeline/tables.py) match the FY2025 Household Mail Survey layout; older Household Diary Study reports need their own entries there.`,
              warnings: next.warnings.filter((w) => w.startsWith(`FY${fy}:`)).slice(0, 20),
            });
          }

          send(res, 200, {
            fiscalYear: fy,
            values: added?.values ?? 0,
            reports: next.reports.length,
            series: next.series.length,
            warnings: next.warnings.filter((w) => w.startsWith(`FY${fy}:`)),
          });
          // Swap the dataset in after the response is out, so the browser has the result before
          // Vite sees hms.json change and reloads the page.
          setTimeout(() => {
            copyFile(path.join(tmp, "hms.json"), dataFile)
              .catch((e) => server.config.logger.error(`[load-reports] Couldn't update hms.json: ${e.message}`))
              .finally(() => rm(tmp, { recursive: true, force: true }));
          }, 300);
          return;
        } catch (e) {
          await rm(tmp, { recursive: true, force: true });
          throw e;
        }

        async function restore() {
          if (exists) await copyFile(backup, target);
          else await rm(target, { force: true });
        }
      };

      server.middlewares.use("/api/reports", (req, res) => {
        if (isCrossSite(req)) return send(res, 403, { error: "Cross-site requests are not allowed." });
        const run = queue.then(() => handle(req, res)).catch((e: Error) => {
          server.config.logger.error(`[load-reports] ${e.message}`);
          if (!res.headersSent) send(res, 500, { error: e.message });
        });
        queue = run;
      });
    },
  };
}
