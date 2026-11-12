"""District points (lat/lon) for the bubble map + province outlines.
Usage: python build_points.py TURKISH_CITIES_JSON PROVINCE_GEOJSON DISTRICTS_CSV OUT_DIR"""
import sys, json, unicodedata, difflib, statistics as st
import pandas as pd
from shapely.geometry import shape, Point, mapping
SRC, PROV, DCSV, OUT = sys.argv[1:5]
def asc(s):
    s = s.replace('İ', 'I').replace('ı', 'i').lower()
    s = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in s if not unicodedata.combining(c) and c.isalnum())
prov = {asc(f['properties']['name'].replace('Afyon','Afyonkarahisar')): (f['properties']['name'].replace('Afyon','Afyonkarahisar'), shape(f['geometry']))
        for f in json.load(open(PROV))['features']}
src = {asc(c['name']): c for c in json.load(open(SRC))}
d = pd.read_csv(DCSV)
out, how = [], {}
for il, ilce, code in zip(d.il, d.ilce, d.tuik_code):
    pa = asc(il); poly = prov[pa][1]; c = src[pa]
    towns = {asc(t['name']): t for t in c['townsData']}
    k = asc(ilce)
    if k not in towns:
        m = difflib.get_close_matches(k, towns, n=1, cutoff=0.75)
        k = m[0] if m else None
    lat = lon = None; method = None
    if k:
        t = towns[k]; L = t.get('location') or {}
        if L.get('lat') and poly.contains(Point(L['lon'], L['lat'])):
            lat, lon, method = L['lat'], L['lon'], 'town'
        else:
            q = [(x['location']['lat'], x['location']['lon']) for dd in t.get('districtsData', [])
                 for x in dd.get('quarters', []) if (x.get('location') or {}).get('lat')
                 and poly.contains(Point(x['location']['lon'], x['location']['lat']))]
            if q:
                lat, lon, method = st.median(a for a, _ in q), st.median(b for _, b in q), 'quarter median'
    if lat is None:
        p = poly.representative_point(); lat, lon, method = p.y, p.x, 'province point'
    how[method] = how.get(method, 0) + 1
    out.append({'tuik_code': int(code), 'lat': round(lat, 4), 'lon': round(lon, 4), 'point_source': method})
pts = pd.DataFrame(out)
# manual fixes where the source had no usable point (checked against district centres)
FIX = {('Aksaray', 'Sultanhanı'): (38.248, 33.548), ('Aksaray', 'Sarıyahşi'): (38.983, 33.842),
       ('Burdur', 'Altınyayla'): (36.997, 29.546)}
key = dict(zip(zip(d.il, d.ilce), d.tuik_code))
for k, (la, lo) in FIX.items():
    pts.loc[pts.tuik_code == key[k], ['lat', 'lon', 'point_source']] = [la, lo, 'manual']
pts.to_csv(f'{OUT}/district_points.csv', index=False)
# simplified province outlines for the map background
feats = [{'type': 'Feature', 'properties': {'name': n},
          'geometry': mapping(g.simplify(0.01, preserve_topology=True))} for n, g in prov.values()]
json.dump({'type': 'FeatureCollection', 'features': feats}, open(f'{OUT}/provinces.geojson', 'w'),
          ensure_ascii=False, separators=(',', ':'))
print(how)
print(d.merge(pts)[lambda x: x.point_source != 'town'][['il', 'ilce', 'point_source', 'lat', 'lon']].to_string())
