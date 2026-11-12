# Arçelik Store White-Space Dashboard: Design

- **Course:** ECON 449, Arçelik AI use cases, **use case 08 · White-space model for stores**
- **Owner:** Ali Kaan Yurdacan (individual work)
- **Deadline:** Tuesday 17 November 2026, end of day (5-minute demo)
- **Status:** data prepared and checked 12 Nov 2026; dashboard to be built from this file
- **Scope rule from the brief:** descriptive analysis only. No forecasting, no ML, no optimisation

## How to build it (for Claude Code)

This file is the whole brief. Give it to Claude Code in this folder and say:
"Build the dashboard in docs/design.md. Ask me whatever you need."

1. **You need:** Claude Code (with the superpowers plugin, as in Project 1) and Python 3.
   **No AWS, no API keys, no internet data calls.** All data is already in `data/`
2. **Output:** one self-contained file, `dist/whitespace_dashboard.html`, that opens with a
   double click, offline. Data and the chart library are embedded in it (section 8)
3. **Stop and ask** if any check in section 10 fails, instead of changing a number to make it pass

## 1. Goal

Show **where Arçelik has demand without a store**. For each of Türkiye's 973 districts (ilçe):
how many households live there, how well-off they are, how many homes are being sold, and how
many Arçelik / Beko stores serve them. A simple, documented score ranks the districts. Rule-based
flags mark the ones that need attention, above all **high-score districts with no store**.

**Questions the dashboard answers**

| # | Question | Where |
|---|---|---|
| Q1 | How is our store network covering Türkiye's households? | Overview KPIs |
| Q2 | Where is demand (households, income, new homes) and where are the stores? | Map |
| Q3 | Which regions are under- or over-served? | Breakdown chart |
| Q4 | Which districts should we look at first? | Ranked list + flags |
| Q5 | Why does one district score high, and what is there today? | District page |

**Success criteria**

| # | Criterion | Check |
|---|---|---|
| S1 | Default view (year 2025, all brands, all formats, stores as of 2026-10) shows exactly the reference numbers in section 10 | Parity test against `data/district_metrics_2025.csv` |
| S2 | Every filter changes every KPI, chart and the table consistently | Playwright: change each filter, compare totals |
| S3 | The file opens offline (no network requests) | Playwright with network disabled |
| S4 | Usable at 1280 px and 390 px, EN and TR, no horizontal scroll | Screenshots |
| S5 | Every page has a one-line "How to read this" note; every KPI has a tooltip with its formula | Visual check |

## 2. Data (all in `data/`, already cleaned)

| File | Rows | Source | Notes |
|---|---|---|---|
| `districts.csv` | 973 | TÜİK ADNKS (population, average household size, 2023–2025), TÜİK MEDAS (housing sales), SEGE-2022 | One row per district. Key: `tuik_code` |
| `housing_sales_monthly.csv` | 35,028 | TÜİK MEDAS "İlçe Konut Satış Sayıları" | 973 districts × 36 months (Jan 2023 – Dec 2025) |
| `district_points.csv` | 973 | Open-source district centres (`nejdetkadir/turkish_cities`), checked against province polygons | Bubble position on the map |
| `provinces.geojson` | 81 | `alpers/Turkey-Maps-GeoJSON`, simplified | Map background outlines |
| `stores_dummy.csv` | 3,391 | **Dummy (generated, seed 449)** by `scripts/make_stores.py` | Arçelik / Beko stores; 3,069 active on 2026-10 |
| `district_metrics_2025.csv` | 973 | `scripts/metrics.py` | **Reference output.** The dashboard must reproduce it (section 10) |
| `raw/` | – | Original downloads (MEDAS exports, SEGE-2022 PDF) | Kept for reproducibility |

**`districts.csv` columns**

| Column | Meaning |
|---|---|
| `tuik_code` | TÜİK district code (unique) |
| `region` | İBBS Düzey-1 region (12 regions, e.g. `TR1 İstanbul`) |
| `il`, `ilce`, `district_id` | Province, district, "İl / İlçe" label |
| `population_YYYY` | ADNKS population, 31 Dec of the year |
| `hh_size_YYYY` | ADNKS average household size of the district |
| `households_YYYY` | `population / hh_size`, rounded |
| `housing_sales_YYYY` | Sum of the 12 monthly housing sales of the year |
| `housing_data` | `TÜİK`, or `missing (0)` for the 18 districts TÜİK does not publish |
| `sege_rank`, `sege_score`, `sege_kademe` | SEGE-2022 district development rank (1 = most developed), index score, tier 1–6 |

**`stores_dummy.csv` columns:** `store_id`, `brand` (Arçelik / Beko), `format` (Bayi = dealer,
Mağaza = own store, AVM = mall shop), `il`, `ilce`, `tuik_code`, `open_month` (YYYY-MM),
`close_month` (blank = still open), `size_m2`, `lat`, `lon` (district centre ± small jitter).
A store is **active in month M** if `open_month ≤ M` and (`close_month` blank or `close_month > M`).

**Assumptions (show them on the Method page and in the one-page note)**

1. **Households** = population ÷ the district's own average household size (both TÜİK). Summed,
   this gives 27.96 M households for 2025 vs TÜİK's official 26.98 M: the population count
   includes people in institutions (dorms, barracks, care homes). It affects all districts
   alike, so the ranking is not changed
2. **Housing sales:** the district totals add up to ~4% more than TÜİK's national figure
   (2025: 1,760,292 vs 1,688,910). We use the district table as published. Months TÜİK leaves
   blank, and the 18 districts it does not publish at all (small districts such as Yusufeli,
   Hasankeyf, Kofçaz), count as 0
3. **Income proxy = SEGE-2022** (Ministry of Industry and Technology; 56 variables incl.
   university graduates, POS terminals, property prices, passports). There is no official
   district income series. It is from 2022 and is used for every year
4. **Stores are dummy.** Generated so that bigger and richer districts have more stores
   (~11 per 100k households nationally), with a few deliberate gaps planted for the demo.
   Real store lists would replace this one file without code changes
5. **Map positions** are district centres, not boundaries (no free, current 973-district
   boundary file exists; the free ones are pre-2012 and miss the new metropolitan districts)
6. **Two names fixed** to match TÜİK: SEGE's "Bahşili" → Bahşılı, "Ondokuzmayıs" → 19 Mayıs

## 3. Metrics

All metrics are per district, for the selected **year Y** (2023 / 2024 / 2025; default 2025) and
the selected **store month M** (default 2026-10).

| Metric | Formula |
|---|---|
| Active stores | Count of stores active in M that pass the brand and format filters |
| Stores per 100k households | `stores / households_Y × 100,000` |
| Housing sales per 1k households | `housing_sales_Y / households_Y × 1,000` |
| Housing YoY % | `housing_sales_Y / housing_sales_(Y−1) − 1` (blank for 2023, or if the prior year is 0) |
| National stores per 100k households | `Σ stores / Σ households_Y × 100,000` over **all 973 districts** (not the filtered ones) |
| Household coverage % | Households in districts with ≥ 1 active store ÷ all households |

## 4. White-space score (0–100)

**Idea:** score the *demand* in a district, then compare it with the stores that are there. The
score does not include stores, so "high score + no store" is a clean signal.

1. Turn each input into a **percentile rank (0–100)** across all 973 districts: the lowest
   district gets 0, the highest 100, the middle one 50. This puts households, an index score and
   a sales rate on the same scale, and one extreme district cannot squash all the others
   (formula: `(rank − 1) / (973 − 1) × 100`, ties get their average rank)
2. **Score = 0.40 × Households + 0.30 × Income + 0.30 × Housing**

| Component | Input | Weight | Why |
|---|---|---|---|
| Households | `households_Y` | 40% | Size of the market: every household needs white goods |
| Income | `sege_score` | 30% | Ability to buy, and to buy premium |
| Housing | housing sales per 1k households, year Y | 30% | New and moved-into homes are when people buy appliances |

Example: a district at the 90th percentile for households, 80th for income and 60th for
housing scores 0.40 × 90 + 0.30 × 80 + 0.30 × 60 = 36 + 24 + 18 = **78**.

- Percentiles are always computed over all 973 districts, whatever is filtered. Filters only
  hide rows; they never change a district's score
- The weights are editable on the Method page (three sliders that must add up to 100%; a "reset"
  button returns to 40 / 30 / 30). Changing them recomputes the score, ranks and flags everywhere

## 5. Flags (rule-based, no models)

| Flag | Rule | Default count (2025, all stores, 2026-10) |
|---|---|---|
| 🔴 **White space** | score ≥ 70 **and** 0 active stores | 30 |
| 🟠 **Under-served** | score ≥ 60 **and** ≥ 1 store **and** stores per 100k households < 50% of the national figure | 53 |
| 🟡 **Housing boom** | housing YoY ≥ +25% **and** households ≥ 10,000 **and** ≤ 1 store | 57 |
| ⚪ **Over-served** (info) | score < 30 **and** stores per 100k households > 2× the national figure | 23 |

- Thresholds live in one config object at the top of the build script and are listed on the
  Method page
- A district can carry several flags. The table shows all of them; the ranked list sorts by
  score
- For 2023 there is no YoY, so "Housing boom" is empty and the page says so

## 6. Pages

Navigation: a left sidebar with four pages, the filter bar on top of pages 1–3. Every page starts
with a one-line **"How to read this"** note (text below).

**Filters (global, kept in the URL hash):** Region (12) · Province (81, narrowed by region) ·
SEGE tier (1–6) · Brand (All / Arçelik / Beko) · Store format (All / Bayi / Mağaza / AVM) ·
Year Y (2023 / 2024 / 2025) · Store month M (month slider, 2023-01 … 2026-10). A "Reset filters"
button. Region, province and tier filter which districts are shown and summed in KPIs; brand,
format and month change which stores count.

### Page 1 · Overview

*How to read this:* "Each bubble is a district: size = households, colour = white-space score.
Red rings are districts with a high score and no store."

- **6 KPI cards:** Active stores · Stores per 100k households (vs national) · Household
  coverage % · Districts without a store · 🔴 White-space districts · Housing sales in Y
  (with YoY %). Each card has a tooltip with its formula
- **Map** (ECharts geo): province outlines, district bubbles (size = households, colour =
  score, red ring = white space). A toggle recolours by Households / Income / Housing / Stores
  per 100k. Click a bubble → District page
- **Trend over time:** monthly housing sales (bars, Jan 2023 – Dec 2025) and active stores at
  month end (line, right axis), for the filtered districts
- **Breakdown:** stores per 100k households by region (horizontal bars), with a vertical line at
  the national figure; bar colour diverging around it

### Page 2 · Ranking & flags

*How to read this:* "Districts sorted by white-space score. Start with the red flags: high
demand, no store."

- **Ranking chart:** top 20 districts by score (horizontal bars, colour = flag)
- **Flag summary:** four chips with counts; clicking one filters the table
- **Detail table** (all filtered districts): rank, district, region, households, SEGE tier,
  housing sales Y and YoY, stores, stores per 100k, score, flags. Sort by any column, search by
  name, 50 rows per page, CSV export of the current view. Click a row → District page

### Page 3 · District

*How to read this:* "One district: what drives its score, how its housing market moves, and
which stores serve it today."

- Header: name, province, region, rank of 973, flags with the rule that triggered each
- 4 KPI cards: households, SEGE score and tier, housing sales Y (YoY), active stores
- **Score bars:** the three components (percentiles) and the weighted total
- 36-month housing-sales line for this district, with its province's average district as a
  dashed line
- Store list (brand, format, opened, size) and a peer table: the other districts of the same
  province with score, stores and flags
- District picker with search (also reachable as `#/district/<tuik_code>`)

### Page 4 · Method & data

*How to read this:* "How every number is computed, which data it uses, and what we assumed."

- Score formula and weight sliders (section 4), flag thresholds (section 5), metric formulas
  (section 3), data sources with dates, the six assumptions (section 2), and a clear **"Store
  data is dummy"** notice

## 7. Look and language

- Reuse the Project 1 visual system: black sidebar, light theme, one accent colour, numbers in
  tabular figures. No Arçelik logo (this is coursework, not an Arçelik product)
- Colour is never the only signal: flags always have the emoji and a word
- **EN + TR** toggle as in Project 1 (`?lang=`), all strings in one i18n object; Turkish number
  format `Intl.NumberFormat('tr-TR')`; district names never translated
- Number formats: households and sales with thousands separators; per-100k to 1 decimal;
  score to 1 decimal; % to 1 decimal

## 8. Build

```
data/*.csv ──► scripts/build_dashboard.py ──► dist/whitespace_dashboard.html
                 (reads CSVs, checks them,       (one file: HTML + CSS + JS +
                  embeds them as JSON)            ECharts 5 + data, ~2–3 MB)
```

- **Python** (`scripts/build_dashboard.py`, pandas only): loads and validates the CSVs (row
  counts, unique keys, no negative numbers), packs compact JSON (districts, monthly sales,
  stores, points, provinces) and writes the single HTML file from `site/` templates
- **JavaScript** computes the metrics of sections 3–5 in the browser, because every filter and
  the weight sliders change them. `scripts/metrics.py` is the reference implementation, and the
  parity test (section 10) keeps the two identical
- **ECharts 5** is downloaded once by the build (npm or pip mirror) and **inlined** into the HTML
  so the file works offline
- Folder layout: `docs/`, `data/`, `scripts/`, `site/` (index.html, app.js, styles.css, i18n.js),
  `tests/`, `dist/`

## 9. Hand-in (what the brief asks for)

| Item | File |
|---|---|
| Dashboard | `dist/whitespace_dashboard.html` (also optionally hosted, see below) |
| Dataset | `data/` folder zipped, with `docs/data_dictionary.md` (sections 2–3 of this file) |
| One-page note | `docs/note.md` → PDF: what each page answers, data and assumptions, flag thresholds |

Optional, only if time is left: put the same HTML on the Project 1 AWS setup (S3 + CloudFront)
to hand in a link. No scheduled job is needed: the data does not refresh.

## 10. Checks (run before calling it done)

| Check | Expected (default view) |
|---|---|
| Active stores (2026-10) | 3,069 |
| National stores per 100k households (2025) | 10.97 |
| Districts without a store | 470 of 973 |
| Household coverage | 86.0% |
| Housing sales 2025 (all districts) | 1,760,292 |
| Flags: white space / under-served / housing boom / over-served | 30 / 53 / 57 / 23 |
| Rank 1 | İstanbul / Esenyurt, score 97.7 |
| Every district's score, rank and flags | equal to `data/district_metrics_2025.csv` (score within 0.1) |

- **Parity test:** run the JS metric code under Node on the embedded data and compare all 973
  rows with `district_metrics_2025.csv`. Also run `python scripts/metrics.py data 2024` and
  compare the 2024 view
- **Filter test** (Playwright): pick region TR1 İstanbul → KPIs equal the sums over İstanbul's 39
  districts; brand = Beko → active stores = Beko rows active in 2026-10
- **UI test:** 4 pages × EN/TR × 1280/390 px screenshots, no console errors, no network requests
- If a check fails, find the cause and report it; never edit the expected numbers to pass

## 11. Out of scope (YAGNI)

Forecasting or any model; drive-time catchments; competitor stores; real Arçelik data;
district boundary polygons; user accounts; automatic data refresh.
