# Arçelik store white-space dashboard: one-page note

**ECON 449 · use case 08 · Ali Kaan Yurdacan · November 2026** · File: `whitespace_dashboard.html` (opens offline with a double click, EN / TR)

**Question.** Where does Arçelik have demand without a store? For each of Türkiye's 973 districts the dashboard shows households, how well-off they are, how many homes are sold, and how many Arçelik / Beko stores serve them. Descriptive only: no forecast, no model, no optimisation.

## What each page answers

| Page | Answers | Main views |
|---|---|---|
| **Overview** | How does the store network cover households? Where are demand and stores? Which regions are under- or over-served? | 6 KPIs with formula tooltips; district bubble map (size = households, colour = score, red ring = white space); monthly housing sales and active stores; stores per 100k households by region vs the national line |
| **Ranking & flags** | Which districts should we look at first? | Top-20 chart coloured by flag; four flag chips (click to filter); sortable, searchable table of all filtered districts with CSV export |
| **District** | Why does a district score high, and what is there today? | Score components, 36-month housing sales vs the province's average district, active store list, peer districts of the province |
| **Method & data** | How is every number computed? | Editable weights, flag rules, formulas, sources, assumptions, dummy-data notice |

Filters (kept in the link): region, province, SEGE tier, brand, store format, year (2023–2025), store month (Jan 2023 – Oct 2026).

## Score (0–100) and flags

Each input becomes a percentile rank over all 973 districts (0 = lowest, 100 = highest). **Score = 40% households + 30% income (SEGE-2022) + 30% housing sales per 1,000 households.** Stores are not in the score, so "high score, no store" is a clean signal. Filters only hide rows; they never change a score.

| Flag | Rule | Count (2025, Oct 2026) |
|---|---|---|
| 🔴 White space | score ≥ 70 and 0 active stores | 30 |
| 🟠 Under-served | score ≥ 60, ≥ 1 store, stores per 100k households < 50% of national (10.97) | 53 |
| 🟡 Housing boom | housing sales YoY ≥ +25%, ≥ 10,000 households, ≤ 1 store (none for 2023) | 57 |
| ⚪ Over-served (info) | score < 30 and stores per 100k households > 2× national | 23 |

**Default view:** 3,069 active stores · 10.97 stores per 100k households · 86.0% of households live in a district with a store · 470 of 973 districts have none · 1,760,292 housing sales in 2025 (+13.6%). Top white-space districts: Atakum (Samsun, 94.4), Mezitli (Mersin, 92.0), Menemen (İzmir, 89.9).

## Data and assumptions

Population and average household size: TÜİK ADNKS 2023–2025. Housing sales: TÜİK MEDAS, monthly 2023–2025. Income proxy: SEGE-2022 (Ministry of Industry and Technology). Map: district centres and province outlines (open source).

1. Households = population ÷ the district's average household size (27.96 M in 2025 vs TÜİK's 26.98 M: institutional population included; ranking unaffected).
2. District housing sales are ~4% above TÜİK's national total; used as published; 18 unpublished districts and blank months count as 0.
3. SEGE-2022 is the only district-level income proxy; used for every year.
4. **Store data is dummy** (generated, seed 449; ~11 stores per 100k households, a few gaps planted). A real store list replaces one file, no code change.
5. Map points are district centres, not boundaries.
6. Two SEGE names matched to TÜİK (Bahşılı, 19 Mayıs).

**Checks:** the in-browser metrics match the Python reference for all 973 districts in 2023, 2024 and 2025; filters, offline use, EN / TR and 1280 / 390 px are tested with Playwright.
