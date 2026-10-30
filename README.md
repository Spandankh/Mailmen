# Postal Insights (Mailmen Dashboard)

Our Challenge X project for USPS.

Every year USPS publishes the Household Mail Survey: about 80 pages of tables and charts on how much mail American households send and receive, and who they are. The data is good, but it's hard to dig through, and you can't see long-term trends without flipping between reports. We pulled the numbers out of the report and built a dashboard where you can see trends, break them down by household type, and get a short written analysis and a forecast for any chart.

Right now it runs on the FY2025 report, which covers 2015, 2020 and 2025. The pipeline is set up so older reports can be added as we collect them.

## What it does

**Overview.** The headline numbers: mail per household, packages, the share of bills paid by mail, and how many ads get read. There's also a chart comparing all five mail markets, a list of key findings worked out from the data, and a summary table with projections to 2030.

**Trend Explorer.** The main tool. Pick any topic (correspondence, bills, advertising, packages and so on) and break it down by age, income, education, homeownership or metro area. You get:
- a line chart with a dashed projection to 2030 or 2035
- a short written analysis: how fast the numbers are changing, whether the change is speeding up or slowing down, which groups moved most, and whether the gap between groups is growing
- a table with every value and the report table and page it came from
- buttons to copy the analysis or download the data as CSV

**Demographics.** A heatmap of every household group across every mail market, colored by how much it changed. It makes the patterns easy to spot, like package volume climbing fastest outside big metro areas. Click any cell to open that trend.

**Compare years.** Pick any two survey years and see what changed: a written summary (how many measures fell or rose, the largest drop and increase), then every measure as a row showing both values, the change and a dot chart. Break it down by age, income, education, homeownership, metro area or a topic's own sub-categories, and filter by market. Volumes compare as % change and shares as percentage points. The selection is kept in the URL (e.g. `#/compare/2015/2025/Age/Packages`) and can be downloaded as CSV. New years appear automatically when you add reports.

**FY2025 Snapshot.** Questions only asked in the latest survey: why people still pay bills by mail, how they respond to ads, and how happy they are with USPS package delivery.

**Report.** A draft slide deck built from the data: the headline numbers, all five mail markets, bill payment, the household groups that changed most, key findings, and sources. Each slide's title states its finding. Click Present for full screen (arrow keys or a click to advance), or Download PDF for one slide per landscape page. A link like `#/report/4` opens a specific slide.

**Data & Sources.** Every number in the dashboard, searchable and downloadable, plus notes on anything odd we found in the report.

## Tech stack

We tried to keep it simple. The whole dataset is under a few hundred KB, so there's no server and no database. The site is a set of static files.

| Part | What we used | Version |
|---|---|---|
| Frontend framework | React | 19.3 |
| Language | TypeScript | 7.0 |
| Build tool / dev server | Vite (+ @vitejs/plugin-react) | 8.3 |
| Styling | Tailwind CSS (+ @tailwindcss/vite) | 4.3 |
| Charts | Apache ECharts (SVG renderer) | 6.1 |
| Data extraction | Python 3.9+ with pypdf | pypdf 6.x |
| Data format | One JSON file (`web/src/data/hms.json`) | |
| Hosting | Cloudflare Workers (static assets), or any static host | wrangler 4.x |

Things we deliberately left out: a backend API, a database, a charting wrapper library, a state management library and a router package. Page links use the URL hash (`#/explore/packages_received/Age`), so any view can be bookmarked or shared.

## Project layout

```
pipeline/
  reports/            survey PDFs, named hms_fyYYYY.pdf
  tables.py           which tables to read and what each row means
  extract_hms.py      reads the PDFs and writes the dataset
  requirements.txt
web/
  index.html
  src/
    App.tsx           header, tabs, theme toggle, routing
    index.css         colors (light + dark) and shared styles
    data/hms.json     the generated dataset
    lib/
      data.ts         loads the dataset, formatting helpers
      trends.ts       growth rates, momentum, forecasts
      narrative.ts    turns the stats into plain-English sentences
    components/       chart wrapper, line/bar/sparkline charts, cards, buttons
    views/            one file per tab
```

## Running it locally

You need Node 20 or newer.

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:5173.

To make a production build:

```bash
cd web
npm run build
```

The output goes to `web/dist/`. Upload that folder to any static host.

### Deploying to Cloudflare Workers

`wrangler.jsonc` in the repo root holds the Worker settings. When you run `wrangler deploy`, it installs and builds `web/` first, then uploads only `web/dist/`.

- **From GitHub (Workers Builds):** keep the defaults. Root directory is the repo root, the build command is empty, and the deploy command is `npx wrangler deploy`. Every push to `main` redeploys.
- **From your machine:** `cd web && npm run deploy`

If you ever see a blank white page after deploying, check the build log for `[custom build]` lines and `Read 4 files from the assets directory .../web/dist`. If the log says it read the `web` folder itself, it is uploading the unbuilt source, and browsers can't run `/src/main.tsx`.

The "Generate AI summary" and report upload features only run on the local dev server. They aren't included in the deployed site.

### Tests

```bash
cd web && npm test                                   # trend math, narratives and findings (Vitest)
.venv/bin/python -m unittest discover pipeline       # extraction, checked against known FY2025 values
```

GitHub Actions runs both, plus `npm run build`, on every pull request.

## Updating the data

You only need this if you're adding a report or changing which tables get pulled in. The dashboard already includes the extracted data.

```bash
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python pipeline/extract_hms.py
```

It reads every PDF in `pipeline/reports/` and rewrites `web/src/data/hms.json`.

You can also do this from the dashboard. With `npm run dev` running and the Python environment above set up, the **Data & Sources** tab has an **Add a report** box: pick a PDF, set its fiscal year and click Add. The dev server saves it as `pipeline/reports/hms_fyYYYY.pdf`, runs the same script and reloads the page with the new data. Each report also gets a **Remove** link. If a PDF yields no recognizable tables, nothing changes and you see which tables were missing. This only exists in the dev server; a production build has no upload. It also checks its own work as it goes. It warns you when:

- a table it expected isn't in the report
- the report's printed "% change" doesn't match the numbers in the same row (beyond rounding)
- two tables, or two years' reports, disagree on the same number. When reports disagree, the newer one wins, since USPS sometimes revises older figures.

Example: the FY2025 report lists 2020 total mail as 837.0 pieces in one table and 839.0 in another. The script flags it and the dashboard shows the note on the Data & Sources tab.

**About older reports:** `tables.py` matches the FY2025 layout. Earlier reports (called the Household Diary Study before 2025) number and arrange their tables differently, so each one will probably need a few entries of its own in `tables.py`.

## How the analysis works

Nothing in the written analysis is hand-written. It's calculated from the numbers every time, so it updates when the data does.

- **Rate of change.** Volumes, like pieces per household, use a compound annual rate: "-4.8% a year". Shares, like the percent of bills paid by mail, use percentage points per year, because a percent change of a percent gets confusing.
- **Momentum.** We compare the earlier period (2015 to 2020) with the recent one (2020 to 2025) to say whether a trend is speeding up, slowing down or has reversed.
- **Gaps between groups.** We compare the highest and lowest group in the first and last year to see whether the gap is getting wider or narrower.
- **Forecasts.** Volumes are projected at a constant annual rate, so they can't go below zero. Shares are projected on a curve that keeps them between 0 and 100%.
  - With three data points, we don't trust a regression. The central line is the average of the long-run rate and the recent rate, and the shaded band runs between those two.
  - Once there are five or more years of data, it switches to a least-squares fit with an 80% prediction interval.

Read the forecasts as "where things are heading if nothing changes", not as official USPS projections.

## Design notes

- The colors follow USPS's navy and red. The chart colors are a separate set, checked for colorblind safety in both light and dark mode. The USPS navy itself was too dark to tell apart as a chart line.
- Light and dark mode follow your system setting, or you can switch with the button in the top right.
- Every chart has a table under it with the same numbers, so nothing is only readable by hovering.
- It works on phones. The tabs scroll sideways and the cards stack.

## Known limitations

- Only one report is loaded so far, so trends are based on three points in time.
- In January 2025 the survey changed its definition of "Large MSA", which moved about 11% of households from Other MSA to Large MSA. Part of the 2020 to 2025 change in the metro-area numbers comes from that, not from real behavior. The dashboard flags this wherever metro area is shown.
- Tables that cross-tabulate two things at once (like Table 4.2, transactions by age by year) aren't extracted yet.

## Data source

USPS Household Mail Survey FY2025 (Leon Michos, USPS Strategic Business and Financial Planning, with RCF Economic & Financial Consulting), filed with the Postal Regulatory Commission on April 1, 2026.
