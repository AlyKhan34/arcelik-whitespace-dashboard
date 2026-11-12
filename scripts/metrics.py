"""Reference implementation of the score and flags (the dashboard must match it).
Usage: python metrics.py DATA_DIR [YEAR] [AS_OF yyyy-mm]"""
import sys, numpy as np, pandas as pd
D = sys.argv[1]; Y = int(sys.argv[2]) if len(sys.argv) > 2 else 2025
AS_OF = sys.argv[3] if len(sys.argv) > 3 else '2026-10'
W = {'households': 0.40, 'income': 0.30, 'housing': 0.30}
d = pd.read_csv(f'{D}/districts.csv'); s = pd.read_csv(f'{D}/stores_dummy.csv', dtype={'close_month': str})
act = s[(s.open_month <= AS_OF) & (s.close_month.isna() | (s.close_month > AS_OF))]
d['stores'] = d.tuik_code.map(act.groupby('tuik_code').size()).fillna(0).astype(int)
hh = d[f'households_{Y}']
d['stores_per_100k_hh'] = (d.stores / hh * 1e5).round(2)
d['housing_per_1k_hh'] = (d[f'housing_sales_{Y}'] / hh * 1e3).round(2)
prev = d.get(f'housing_sales_{Y-1}')
d['housing_yoy_pct'] = ((d[f'housing_sales_{Y}'] / prev.replace(0, np.nan) - 1) * 100).round(1) if prev is not None else np.nan
pr = lambda x: (x.rank(method='average') - 1) / (len(x) - 1) * 100   # percentile rank 0..100
d['p_households'] = pr(hh).round(1); d['p_income'] = pr(d.sege_score).round(1); d['p_housing'] = pr(d.housing_per_1k_hh).round(1)
d['score'] = (W['households'] * d.p_households + W['income'] * d.p_income + W['housing'] * d.p_housing).round(1)
nat = d.stores.sum() / hh.sum() * 1e5
d['flag_white_space'] = (d.score >= 70) & (d.stores == 0)
d['flag_under_served'] = (d.score >= 60) & (d.stores > 0) & (d.stores_per_100k_hh < 0.5 * nat)
d['flag_housing_boom'] = (d.housing_yoy_pct >= 25) & (hh >= 10000) & (d.stores <= 1)
d['flag_over_served'] = (d.score < 30) & (d.stores_per_100k_hh > 2 * nat)
d['rank'] = d.score.rank(ascending=False, method='first').astype(int)
d.sort_values('rank').to_csv(f'{D}/district_metrics_{Y}.csv', index=False)
print('national stores/100k hh', round(nat, 2), '| active stores', d.stores.sum())
for f in ['flag_white_space', 'flag_under_served', 'flag_housing_boom', 'flag_over_served']: print(f, int(d[f].sum()))
print(d.sort_values('rank').head(12)[['rank', 'il', 'ilce', f'households_{Y}', 'sege_score', 'housing_per_1k_hh', 'score', 'stores']].to_string())
print(d[d.flag_white_space].sort_values('rank')[['rank', 'il', 'ilce', f'households_{Y}', 'score', 'housing_yoy_pct']].to_string())
