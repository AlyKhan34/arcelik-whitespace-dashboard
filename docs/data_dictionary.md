# Data dictionary: Arçelik store white-space dataset

ECON 449 · use case 08 · Ali Kaan Yurdacan · November 2026

All files are UTF-8 CSV (comma-separated, `.` decimals) except `provinces.geojson`. The key that
joins everything is `tuik_code`, the TÜİK district code. **The store file is dummy data.**

## Files

| File | Rows | Source | Notes |
|---|---|---|---|
| `districts.csv` | 973 | TÜİK ADNKS (population, average household size, 2023–2025), TÜİK MEDAS (housing sales), SEGE-2022 | One row per district |
| `housing_sales_monthly.csv` | 35,028 | TÜİK MEDAS "İlçe Konut Satış Sayıları" | 973 districts × 36 months (Jan 2023 – Dec 2025) |
| `district_points.csv` | 973 | Open-source district centres (`nejdetkadir/turkish_cities`), checked against province polygons | Bubble position on the map |
| `provinces.geojson` | 81 | `alpers/Turkey-Maps-GeoJSON`, simplified | Map background outlines; `properties.name` = province |
| `stores_dummy.csv` | 3,391 | **Dummy, generated (seed 449)** by `scripts/make_stores.py` | Arçelik / Beko stores; 3,069 active in Oct 2026 |
| `district_metrics_2025.csv` | 973 | `scripts/metrics.py` | Reference output of the score and flags (2025, all stores, Oct 2026) |
| `raw/` | – | Original downloads (MEDAS exports, SEGE-2022 PDF) | Kept for reproducibility |

## `districts.csv`

| Column | Type | Meaning |
|---|---|---|
| `tuik_code` | int | TÜİK district code (unique) |
| `region` | text | İBBS Düzey-1 region (12 regions, e.g. `TR1 İstanbul`) |
| `il`, `ilce` | text | Province, district |
| `district_id` | text | "İl / İlçe" label (unique) |
| `population_YYYY` | int | ADNKS population, 31 December of the year (2023, 2024, 2025) |
| `hh_size_YYYY` | float | ADNKS average household size of the district |
| `households_YYYY` | float | `population / hh_size`, rounded to a whole household |
| `housing_sales_YYYY` | int | Sum of the 12 monthly housing sales of the year |
| `housing_data` | text | `TÜİK`, or `missing (0)` for the 18 districts TÜİK does not publish |
| `sege_rank` | int | SEGE-2022 district development rank (1 = most developed, of 973) |
| `sege_score` | float | SEGE-2022 index score (centred on 0; higher = more developed) |
| `sege_kademe` | int | SEGE-2022 tier, 1 (most developed) to 6 |

## `housing_sales_monthly.csv`

| Column | Type | Meaning |
|---|---|---|
| `tuik_code` | int | District |
| `period` | text | `YYYY-MM` |
| `year`, `month` | int | Same period, split |
| `sales` | int | Housing units sold in the month (blank months in TÜİK = 0) |

## `district_points.csv`

| Column | Type | Meaning |
|---|---|---|
| `tuik_code` | int | District |
| `lat`, `lon` | float | District centre (WGS84) |
| `point_source` | text | How the point was found (e.g. `town`) |

## `stores_dummy.csv` (dummy)

| Column | Type | Meaning |
|---|---|---|
| `store_id` | text | `ST00001` … |
| `brand` | text | `Arçelik` or `Beko` |
| `format` | text | `Bayi` (dealer), `Mağaza` (own store), `AVM` (mall shop) |
| `il`, `ilce`, `tuik_code` | | District the store is in |
| `open_month` | text | `YYYY-MM` the store opened |
| `close_month` | text | `YYYY-MM` the store closed; blank = still open |
| `size_m2` | int | Sales area in m² |
| `lat`, `lon` | float | District centre ± a small jitter |

A store is **active in month M** if `open_month ≤ M` and (`close_month` is blank or `close_month > M`).

## `district_metrics_2025.csv` (all `districts.csv` columns, plus)

| Column | Formula |
|---|---|
| `stores` | Active stores in Oct 2026 |
| `stores_per_100k_hh` | `stores / households_2025 × 100,000` (2 decimals) |
| `housing_per_1k_hh` | `housing_sales_2025 / households_2025 × 1,000` (2 decimals) |
| `housing_yoy_pct` | `(housing_sales_2025 / housing_sales_2024 − 1) × 100` (1 decimal; blank if the prior year is 0) |
| `p_households`, `p_income`, `p_housing` | Percentile rank 0–100 over all 973 districts of `households_2025`, `sege_score`, `housing_per_1k_hh`: `(rank − 1) / (973 − 1) × 100`, ties get their average rank (1 decimal) |
| `score` | `0.40 × p_households + 0.30 × p_income + 0.30 × p_housing` (1 decimal) |
| `flag_white_space` | `score ≥ 70` and `stores = 0` |
| `flag_under_served` | `score ≥ 60` and `stores ≥ 1` and `stores_per_100k_hh < 0.5 × national` |
| `flag_housing_boom` | `housing_yoy_pct ≥ 25` and `households ≥ 10,000` and `stores ≤ 1` |
| `flag_over_served` | `score < 30` and `stores_per_100k_hh > 2 × national` |
| `rank` | 1 = highest score; ties keep the file order |

`national` = Σ stores / Σ households over all 973 districts × 100,000 = **10.97** (2025, Oct 2026).

## Other metrics used on the dashboard

| Metric | Formula |
|---|---|
| Household coverage % | Households in districts with ≥ 1 active store ÷ all households |
| Districts without a store | Count of districts with 0 active stores |
| Housing sales YoY (KPI) | Σ housing_sales_Y ÷ Σ housing_sales_(Y−1) − 1, over the filtered districts |

## Assumptions

1. **Households** = population ÷ the district's own average household size (both TÜİK). Summed,
   this gives 27.96 M households for 2025 vs TÜİK's official 26.98 M: the population count
   includes people in institutions (dorms, barracks, care homes). It affects all districts alike,
   so the ranking is not changed.
2. **Housing sales:** the district totals add up to ~4% more than TÜİK's national figure (2025:
   1,760,292 vs 1,688,910). The district table is used as published. Months TÜİK leaves blank,
   and the 18 districts it does not publish at all (small districts such as Yusufeli, Hasankeyf,
   Kofçaz), count as 0.
3. **Income proxy = SEGE-2022** (Ministry of Industry and Technology; 56 variables incl.
   university graduates, POS terminals, property prices, passports). There is no official
   district income series. It is from 2022 and is used for every year.
4. **Stores are dummy.** Generated so that bigger and richer districts have more stores
   (~11 per 100k households nationally), with a few deliberate gaps planted for the demo. A real
   store list would replace this one file without code changes.
5. **Map positions** are district centres, not boundaries (no free, current 973-district
   boundary file exists; the free ones are pre-2012 and miss the new metropolitan districts).
6. **Two names fixed** to match TÜİK: SEGE's "Bahşili" → Bahşılı, "Ondokuzmayıs" → 19 Mayıs.
