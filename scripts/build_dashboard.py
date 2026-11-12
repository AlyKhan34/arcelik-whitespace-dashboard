"""Build dist/whitespace_dashboard.html: one self-contained, offline file.

Reads the CSVs in data/, checks them, packs them as compact JSON and inlines them, together
with ECharts 5 and the site/ templates, into a single HTML file.

Usage: python3 scripts/build_dashboard.py [--data DATA_DIR] [--out OUT_HTML]
"""
import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------------------------
# Config: score weights and flag thresholds (design.md sections 4-5). The page reads this object,
# lists it on the Method page and uses it for every computation. Change values here only.
# ---------------------------------------------------------------------------------------------
CONFIG = {
    'years': [2023, 2024, 2025],
    'default_year': 2025,
    'store_month_first': '2023-01',
    'default_store_month': '2026-10',
    'weights': {'households': 40, 'income': 30, 'housing': 30},  # percent, must add up to 100
    'flags': {
        'white_space': {'min_score': 70, 'max_stores': 0},
        'under_served': {'min_score': 60, 'min_stores': 1, 'max_ratio_to_national': 0.5},
        'housing_boom': {'min_yoy_pct': 25, 'min_households': 10000, 'max_stores': 1},
        'over_served': {'max_score': 30, 'min_ratio_to_national': 2},
    },
}

ROOT = Path(__file__).resolve().parent.parent
N_DISTRICTS = 973
N_MONTHS = 36
BRANDS = ['Arçelik', 'Beko']
FORMATS = ['Bayi', 'Mağaza', 'AVM']


class DataError(Exception):
    pass


def check(cond, msg):
    if not cond:
        raise DataError(msg)


def month_int(s):
    """'2026-10' -> months since year 0, so comparisons are integer comparisons."""
    y, m = s.split('-')
    return int(y) * 12 + int(m) - 1


def load_and_check(data_dir):
    d = pd.read_csv(data_dir / 'districts.csv')
    m = pd.read_csv(data_dir / 'housing_sales_monthly.csv')
    p = pd.read_csv(data_dir / 'district_points.csv')
    s = pd.read_csv(data_dir / 'stores_dummy.csv', dtype={'close_month': str, 'open_month': str})
    geo = json.loads((data_dir / 'provinces.geojson').read_text(encoding='utf-8'))
    years = CONFIG['years']

    # Row counts and keys
    check(len(d) == N_DISTRICTS, f'districts.csv: {len(d)} rows, expected {N_DISTRICTS}')
    check(d.tuik_code.is_unique, 'districts.csv: tuik_code not unique')
    check(d.district_id.is_unique, 'districts.csv: district_id not unique')
    check(len(m) == N_DISTRICTS * N_MONTHS, f'housing_sales_monthly.csv: {len(m)} rows')
    check(not m.duplicated(['tuik_code', 'period']).any(), 'monthly sales: duplicate (district, month)')
    check(set(m.tuik_code) == set(d.tuik_code), 'monthly sales: district codes differ from districts.csv')
    check(len(p) == N_DISTRICTS and p.tuik_code.is_unique, 'district_points.csv: not one row per district')
    check(set(p.tuik_code) == set(d.tuik_code), 'district_points.csv: codes differ from districts.csv')
    check(s.store_id.is_unique, 'stores_dummy.csv: store_id not unique')
    check(s.tuik_code.isin(d.tuik_code).all(), 'stores_dummy.csv: store in unknown district')
    check(set(s.brand) <= set(BRANDS), f'stores: unknown brand {set(s.brand) - set(BRANDS)}')
    check(set(s.format) <= set(FORMATS), f'stores: unknown format {set(s.format) - set(FORMATS)}')
    check(len(geo.get('features', [])) == 81, 'provinces.geojson: expected 81 provinces')
    check(set(f['properties']['name'] for f in geo['features']) == set(d.il),
          'provinces.geojson: province names differ from districts.csv')

    # No missing / negative numbers
    num_cols = [f'{c}_{y}' for c in ('population', 'households', 'housing_sales', 'hh_size') for y in years]
    num_cols += ['sege_rank', 'sege_score', 'sege_kademe']
    check(not d[num_cols].isna().any().any(), 'districts.csv: missing numbers')
    for c in num_cols:
        if c != 'sege_score':  # the SEGE index score is centred on 0, negatives are valid
            check((d[c] >= 0).all(), f'districts.csv: negative values in {c}')
    for y in years:
        check((d[f'households_{y}'] > 0).all(), f'districts.csv: zero households in {y}')
    check((m.sales >= 0).all() and not m.sales.isna().any(), 'monthly sales: missing or negative')
    check((s.size_m2 > 0).all(), 'stores: size_m2 must be positive')
    check(d.sege_kademe.between(1, 6).all(), 'districts.csv: SEGE tier outside 1-6')

    # Months and consistency between files
    periods = sorted(m.period.unique())
    check(len(periods) == N_MONTHS and periods[0] == '2023-01' and periods[-1] == '2025-12',
          'monthly sales: expected Jan 2023 - Dec 2025')
    for y in years:
        tot = m[m.year == y].groupby('tuik_code').sales.sum()
        check((d.set_index('tuik_code')[f'housing_sales_{y}'] == tot.reindex(d.tuik_code).values).all(),
              f'housing_sales_{y} differs from the sum of its 12 months')
    closed = s.close_month.notna()
    check((s.close_month[closed] > s.open_month[closed]).all(), 'stores: close_month must be after open_month')
    return d, m, p, s, geo, periods


def pack(d, m, p, s, geo, periods):
    years = CONFIG['years']
    order = {c: i for i, c in enumerate(d.tuik_code)}
    pts = p.set_index('tuik_code').reindex(d.tuik_code)
    sales = (m.assign(i=m.tuik_code.map(order), j=m.period.map({q: k for k, q in enumerate(periods)}))
             .sort_values(['i', 'j']).sales.astype(int).tolist())
    regions = sorted(d.region.unique())
    return {
        'built': date.today().isoformat(),
        'config': CONFIG,
        'regions': regions,
        'sales_months': periods,
        'brands': BRANDS,
        'formats': FORMATS,
        'districts': {
            'code': d.tuik_code.astype(int).tolist(),
            'region': d.region.map({r: i for i, r in enumerate(regions)}).tolist(),
            'il': d.il.tolist(),
            'ilce': d.ilce.tolist(),
            'population': {y: d[f'population_{y}'].astype(int).tolist() for y in years},
            'hh_size': {y: d[f'hh_size_{y}'].round(2).tolist() for y in years},
            'households': {y: d[f'households_{y}'].astype(int).tolist() for y in years},
            'housing_sales': {y: d[f'housing_sales_{y}'].astype(int).tolist() for y in years},
            'housing_missing': (d.housing_data != 'TÜİK').astype(int).tolist(),
            'sege_rank': d.sege_rank.astype(int).tolist(),
            'sege_score': d.sege_score.tolist(),
            'sege_tier': d.sege_kademe.astype(int).tolist(),
            'lat': pts.lat.round(4).tolist(),
            'lon': pts.lon.round(4).tolist(),
        },
        'sales': sales,  # district-major: sales[i * 36 + month]
        'stores': {
            'id': s.store_id.tolist(),
            'district': s.tuik_code.map(order).astype(int).tolist(),
            'brand': s.brand.map({b: i for i, b in enumerate(BRANDS)}).astype(int).tolist(),
            'format': s.format.map({f: i for i, f in enumerate(FORMATS)}).astype(int).tolist(),
            'open': s.open_month.map(month_int).tolist(),
            'close': [None if pd.isna(c) else month_int(c) for c in s.close_month],
            'size': s.size_m2.astype(int).tolist(),
        },
        'geo': geo,
    }


def js_safe(text):
    """Inline text may not close its own <script> tag."""
    return re.sub(r'</(script)', r'<\\/\1', text, flags=re.I)


def build(data_dir, out):
    d, m, p, s, geo, periods = load_and_check(data_dir)
    data = pack(d, m, p, s, geo, periods)
    site = ROOT / 'site'
    echarts = ROOT / 'node_modules' / 'echarts' / 'dist' / 'echarts.min.js'
    check(echarts.exists(), 'ECharts not found: run "npm install" once (it downloads echarts 5.6.0)')
    parts = {
        'STYLES': (site / 'styles.css').read_text(encoding='utf-8'),
        'ECHARTS': js_safe(echarts.read_text(encoding='utf-8')),
        'I18N': js_safe((site / 'i18n.js').read_text(encoding='utf-8')),
        'METRICS': js_safe((site / 'metrics.js').read_text(encoding='utf-8')),
        'APP': js_safe((site / 'app.js').read_text(encoding='utf-8')),
        'DATA': js_safe(json.dumps(data, ensure_ascii=False, separators=(',', ':'))),
    }
    tpl = (site / 'index.html').read_text(encoding='utf-8')
    html = re.sub(r'/\*@(\w+)@\*/', lambda mt: parts[mt.group(1)], tpl)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8')
    act = s[(s.open_month <= CONFIG['default_store_month'])
            & (s.close_month.isna() | (s.close_month > CONFIG['default_store_month']))]
    print(f'checks passed: {len(d)} districts, {len(m)} monthly rows, {len(s)} stores '
          f'({len(act)} active {CONFIG["default_store_month"]})')
    print(f'wrote {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} ({out.stat().st_size / 1e6:.2f} MB)')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', type=Path, default=ROOT / 'data')
    ap.add_argument('--out', type=Path, default=ROOT / 'dist' / 'whitespace_dashboard.html')
    a = ap.parse_args()
    try:
        build(a.data, a.out)
    except DataError as e:
        sys.exit(f'DATA CHECK FAILED: {e}')
