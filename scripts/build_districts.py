"""Builds the clean district dataset from the raw TÜİK / SEGE files.
Usage: python build_districts.py RAW_DIR OUT_DIR"""
import sys, re, csv, collections
import pandas as pd, pdfplumber
RAW, OUT = sys.argv[1], sys.argv[2]

# İBBS Düzey-1 regions (TÜİK)
NUTS1 = {
 'TR1 İstanbul':['İstanbul'],
 'TR2 Batı Marmara':['Tekirdağ','Edirne','Kırklareli','Balıkesir','Çanakkale'],
 'TR3 Ege':['İzmir','Aydın','Denizli','Muğla','Manisa','Afyonkarahisar','Kütahya','Uşak'],
 'TR4 Doğu Marmara':['Bursa','Eskişehir','Bilecik','Kocaeli','Sakarya','Düzce','Bolu','Yalova'],
 'TR5 Batı Anadolu':['Ankara','Konya','Karaman'],
 'TR6 Akdeniz':['Antalya','Isparta','Burdur','Adana','Mersin','Hatay','Kahramanmaraş','Osmaniye'],
 'TR7 Orta Anadolu':['Kırıkkale','Aksaray','Niğde','Nevşehir','Kırşehir','Kayseri','Sivas','Yozgat'],
 'TR8 Batı Karadeniz':['Zonguldak','Karabük','Bartın','Kastamonu','Çankırı','Sinop','Samsun','Tokat','Çorum','Amasya'],
 'TR9 Doğu Karadeniz':['Trabzon','Ordu','Giresun','Rize','Artvin','Gümüşhane'],
 'TRA Kuzeydoğu Anadolu':['Erzurum','Erzincan','Bayburt','Ağrı','Kars','Iğdır','Ardahan'],
 'TRB Ortadoğu Anadolu':['Malatya','Elazığ','Bingöl','Tunceli','Van','Muş','Bitlis','Hakkari'],
 'TRC Güneydoğu Anadolu':['Gaziantep','Adıyaman','Kilis','Şanlıurfa','Diyarbakır','Mardin','Batman','Şırnak','Siirt'],
}
REGION = {il: r for r, ils in NUTS1.items() for il in ils}

def key_parts(s):
    m = re.match(r'(.+?)\((.+?)\)-(\d+)', s.strip())
    return m.group(1), m.group(2), int(m.group(3))

def load_xls(f):
    x = pd.read_excel(f, header=None).iloc[5:, :3]
    x.columns = ['year', 'key', 'v']
    x['year'] = x['year'].ffill().astype(int)
    return x.dropna(subset=['key'])

pop = load_xls(f'{RAW}/medas_ilce_nufus_2023_2025.xls'); hh = load_xls(f'{RAW}/medas_ilce_ort_hane_buyuklugu_2023_2025.xls')
base = pop.merge(hh, on=['year', 'key'], suffixes=('_pop', '_hhsize'))
base[['il', 'ilce', 'tuik_code']] = base['key'].apply(lambda s: pd.Series(key_parts(s)))
base['households'] = (base.v_pop.astype(float) / base.v_hhsize.astype(float)).round()
wide = base.pivot_table(index=['tuik_code', 'il', 'ilce'], columns='year',
                        values=['v_pop', 'v_hhsize', 'households'], aggfunc='first')
wide.columns = [f"{ {'v_pop':'population','v_hhsize':'hh_size','households':'households'}[a]}_{b}" for a, b in wide.columns]
d = wide.reset_index()
assert len(d) == 973

# housing sales, monthly (pipe-delimited MEDAS export)
rows = list(csv.reader(open(f'{RAW}/medas_ilce_konut_satis_2023_2025.csv', encoding='utf-8-sig'), delimiter='|'))
dist, mon = rows[1], rows[2]; cur = None; hs = []
for j in range(3, len(dist)):
    if dist[j].strip(): cur = dist[j]
    if not mon[j].strip(): continue
    for r in rows[4:7]:
        v = r[j].strip() if j < len(r) else ''
        hs.append((key_parts(cur)[2], int(r[2]), int(mon[j][:2]), float(v) if v else 0.0))
hs = pd.DataFrame(hs, columns=['tuik_code', 'year', 'month', 'sales'])
codes_with_data = set(hs.tuik_code)
# full grid: every district x 36 months, missing = 0
grid = pd.MultiIndex.from_product([d.tuik_code, [2023, 2024, 2025], range(1, 13)],
                                  names=['tuik_code', 'year', 'month']).to_frame(index=False)
hs = grid.merge(hs, how='left').fillna({'sales': 0})
hs['sales'] = hs.sales.astype(int)
hs['period'] = hs.year.astype(str) + '-' + hs.month.astype(str).str.zfill(2)
ann = hs.pivot_table(index='tuik_code', columns='year', values='sales', aggfunc='sum')
ann.columns = [f'housing_sales_{c}' for c in ann.columns]
d = d.merge(ann.reset_index(), on='tuik_code')
d['housing_data'] = d.tuik_code.map(lambda c: 'TÜİK' if c in codes_with_data else 'missing (0)')

# SEGE-2022 (Ek-1 general ranking, pages 42-49)
P = '|'.join(map(re.escape, sorted(set(d.il))))
rx = re.compile(r'(?<!\d)(\d{1,3}) (' + P + r') (.+?) (-?\d,\d{3})(?=\s|$)')
pdf = pdfplumber.open(f'{RAW}/sege-2022.pdf'); sg = {}
for i in range(41, 49):
    for line in (pdf.pages[i].extract_text() or '').split('\n'):
        for m in rx.finditer(line):
            sg.setdefault(int(m.group(1)), (m.group(2), m.group(3).strip(), float(m.group(4).replace(',', '.'))))
sege = pd.DataFrame([(r, *v) for r, v in sg.items()], columns=['sege_rank', 'il', 'ilce', 'sege_score'])
assert len(sege) == 973
FIX = {('Kırıkkale', 'Bahşili'): 'Bahşılı', ('Samsun', 'Ondokuzmayıs'): '19 Mayıs'}
sege['ilce'] = [FIX.get((a, b), b) for a, b in zip(sege.il, sege.ilce)]
def kademe(s):  # thresholds from SEGE-2022 Table 12
    for k, t in [(1, 1.632), (2, 0.396), (3, -0.173), (4, -0.493), (5, -0.824)]:
        if s >= t: return k
    return 6
sege['sege_kademe'] = sege.sege_score.map(kademe)
d = d.merge(sege, on=['il', 'ilce'], how='left', validate='1:1')
assert d.sege_score.notna().all()
assert sege.sege_kademe.value_counts().sort_index().tolist() == [67, 173, 175, 215, 222, 121]
d.insert(1, 'region', d.il.map(REGION))
assert d.region.notna().all(), d[d.region.isna()].il.unique()
d['district_id'] = d.il + ' / ' + d.ilce
d.to_csv(f'{OUT}/districts.csv', index=False)
hs[['tuik_code', 'period', 'year', 'month', 'sales']].to_csv(f'{OUT}/housing_sales_monthly.csv', index=False)
print(d.shape, hs.shape); print(d.head(3).T)
