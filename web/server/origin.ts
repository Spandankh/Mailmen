import type { IncomingMessage } from "node:http";

/**
 * True when a request was sent by a page on another site. Any website open in the browser can
 * POST a form or a plain `fetch` to localhost without a CORS preflight, so the dev routes that
 * change files or spend API quota must turn these away themselves. Requests without either header
 * (curl, scripts) aren't from a browser page and are let through.
 */
export function isCrossSite(req: IncomingMessage): boolean {
  const site = req.headers["sec-fetch-site"];
  if (site) return site !== "same-origin" && site !== "none";
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}
