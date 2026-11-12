"""Generates the DUMMY Arçelik store list (seeded, reproducible).
Usage: python make_stores.py DATA_DIR"""
import sys, numpy as np, pandas as pd
D = sys.argv[1]; rng = np.random.default_rng(449)
d = pd.read_csv(f'{D}/districts.csv').merge(pd.read_csv(f'{D}/district_points.csv'))
hh = d.households_2025
# expected stores: ~9 per 100k households, more in richer districts (SEGE), fewer in tiny ones
lam = hh / 1e5 * 9.0 * np.exp(0.30 * d.sege_score.clip(-1.5, 4))
lam = np.where(hh < 4000, lam * 0.35, lam)
n = rng.poisson(lam)
# deliberate white spaces: fast-growing, mid/large districts left with no store
growth = d.housing_sales_2025 / d.housing_sales_2024.replace(0, np.nan) - 1
cand = d.index[(hh > 25000) & (hh < 150000) & (growth > 0.15) & (d.sege_kademe <= 3)]
ws = rng.choice(cand, size=min(22, len(cand)), replace=False)
n[ws] = 0
# deliberate under-served: big districts with far fewer stores than expected
cand2 = d.index[(hh > 120000) & ~d.index.isin(ws)]
us = rng.choice(cand2, size=12, replace=False)
n[us] = np.maximum(1, (n[us] * 0.25).round().astype(int))
rows = []
months = pd.period_range('2008-01', '2026-10', freq='M')
w = np.linspace(0.4, 1.6, len(months)); w /= w.sum()   # more openings in recent years
for i in d.index:
    for k in range(int(n[i])):
        rng.random()  # former Arçelik / Beko draw: kept so the seeded sequence, and every other column, stays the same
        brand = 'Arçelik'  # one brand only (Beko removed, Nov 2026)
        fmt = rng.choice(['Bayi', 'Mağaza', 'AVM'], p=[0.72, 0.16, 0.12] if d.sege_kademe[i] <= 2 else [0.88, 0.08, 0.04])
        op = months[rng.choice(len(months), p=w)]
        cl = ''
        if rng.random() < 0.09:  # some stores closed later
            later = months[months > op]
            if len(later): cl = str(later[rng.integers(len(later))])
        size = int(rng.normal({'Bayi': 180, 'Mağaza': 420, 'AVM': 260}[fmt], 40))
        rows.append(dict(brand=brand, format=fmt, il=d.il[i], ilce=d.ilce[i], tuik_code=d.tuik_code[i],
                         open_month=str(op), close_month=cl, size_m2=max(80, size),
                         lat=round(d.lat[i] + rng.normal(0, 0.03), 5), lon=round(d.lon[i] + rng.normal(0, 0.03), 5)))
s = pd.DataFrame(rows).sort_values(['il', 'ilce', 'open_month']).reset_index(drop=True)
s.insert(0, 'store_id', [f'ST{i+1:05d}' for i in range(len(s))])
s.to_csv(f'{D}/stores_dummy.csv', index=False)

active = s[s.close_month == '']
print('stores', len(s), 'active', len(active), 'districts with store', active.tuik_code.nunique())
print(s.brand.value_counts().to_dict(), s.format.value_counts().to_dict())
print('national per 100k hh', round(len(active) / hh.sum() * 1e5, 2))
