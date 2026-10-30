import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { summarizePlugin } from "./server/summarize.ts";
import { reportsPlugin } from "./server/reports.ts";

export default defineConfig(({ mode }) => ({
  // Empty prefix loads every variable from .env files, but only for this config:
  // nothing here is exposed to the browser bundle.
  plugins: [react(), tailwindcss(), summarizePlugin(loadEnv(mode, process.cwd(), "")), reportsPlugin()],
  // ECharts alone is ~590 kB minified. It's already its own chunk, loaded only by the tabs that chart.
  build: { chunkSizeWarningLimit: 650 },
}));
