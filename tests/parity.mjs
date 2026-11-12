// Parity test (design.md section 10): run site/metrics.js under Node on the data embedded in the
// built HTML and compare every district with the Python reference (scripts/metrics.py).
// 2025 is compared with data/district_metrics_2025.csv; 2024 and 2023 with a fresh run of
// metrics.py written to a temporary folder (the data/ folder is never touched).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = createRequire(import.meta.url)(path.join(ROOT, 'site/metrics.js'));
const html = fs.readFileSync(path.join(ROOT, 'dist/whitespace_dashboard.html'), 'utf8');
const raw = html.match(/<script id="ws-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
const DATA = JSON.parse(raw);
const cfg = DATA.config;

let failures = 0;
const fail = (msg) => { failures++; if (failures <= 25) console.log('  FAIL', msg); };
const eq = (label, got, want) => { if (got !== want) fail(`${label}: got ${got}, expected ${want}`); else console.log(`  ok   ${label}: ${got}`); };

function readCsv(file) {
  const [head, ...rows] = fs.readFileSync(file, 'utf8').trim().split('\n');
  const cols = head.split(',');
  return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v])));
}
const num = (v) => (v === '' ? NaN : +v);
const same = (a, b, tol) => (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= tol;

function compareYear(year, refFile) {
  console.log(`\n== ${year} vs ${path.relative(ROOT, refFile)}`);
  const r = M.compute(DATA, { year, month: cfg.default_store_month, brand: -1, format: -1, weights: cfg.weights });
  const at = new Map(DATA.districts.code.map((c, i) => [c, i]));
  const ref = readCsv(refFile);
  if (ref.length !== 973) fail(`reference has ${ref.length} rows`);
  let checked = 0, maxScoreDiff = 0;
  for (const row of ref) {
    const i = at.get(+row.tuik_code), id = `${row.il} / ${row.ilce}`;
    if (i === undefined) { fail(`${id}: not in embedded data`); continue; }
    const pairs = [
      ['stores', r.stores[i], num(row.stores), 0], ['stores_per_100k_hh', r.per100k[i], num(row.stores_per_100k_hh), 1e-9],
      ['housing_per_1k_hh', r.housingPer1k[i], num(row.housing_per_1k_hh), 1e-9], ['housing_yoy_pct', r.yoy[i], num(row.housing_yoy_pct), 1e-9],
      ['p_households', r.pH[i], num(row.p_households), 1e-9], ['p_income', r.pI[i], num(row.p_income), 1e-9],
      ['p_housing', r.pS[i], num(row.p_housing), 1e-9], ['rank', r.rank[i], num(row.rank), 0],
    ];
    for (const [k, got, want, tol] of pairs) if (!same(got, want, tol)) fail(`${id} ${k}: ${got} vs ${want}`);
    const d = Math.abs(r.score[i] - num(row.score)); maxScoreDiff = Math.max(maxScoreDiff, d);
    if (d > 0.1 + 1e-9) fail(`${id} score: ${r.score[i]} vs ${row.score}`);
    for (const f of ['white_space', 'under_served', 'housing_boom', 'over_served'])
      if (r.flags[f][i] !== (row[`flag_${f}`] === 'True')) fail(`${id} flag ${f}: ${r.flags[f][i]} vs ${row['flag_' + f]}`);
    checked++;
  }
  console.log(`  ${checked} districts compared, max score difference ${maxScoreDiff.toFixed(3)}`);
  return r;
}

// 2025: committed reference + the headline numbers of section 10
const r25 = compareYear(2025, path.join(ROOT, 'data/district_metrics_2025.csv'));
console.log('\n== section 10 headline checks (default view)');
const n = r25.hh.length;
let noStore = 0, hhCovered = 0, sales = 0;
for (let i = 0; i < n; i++) { if (r25.stores[i] === 0) noStore++; else hhCovered += r25.hh[i]; sales += r25.hs[i]; }
const cnt = (f) => r25.flags[f].filter(Boolean).length;
eq('active stores', r25.sumStores, 3069);
eq('national stores per 100k hh', r25.national.toFixed(2), '10.97');
eq('districts without a store', noStore, 470);
eq('household coverage %', (hhCovered / r25.sumHH * 100).toFixed(1), '86.0');
eq('housing sales 2025', sales, 1760292);
eq('flags ws/us/hb/os', ['white_space', 'under_served', 'housing_boom', 'over_served'].map(cnt).join(' / '), '30 / 53 / 57 / 23');
const top = r25.order[0];
eq('rank 1', `${DATA.districts.il[top]} / ${DATA.districts.ilce[top]} ${r25.score[top]}`, 'İstanbul / Esenyurt 97.7');

// 2024 and 2023: fresh reference runs in a temp folder
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-parity-'));
for (const f of ['districts.csv', 'stores_dummy.csv']) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(tmp, f));
for (const y of [2024, 2023]) {
  execFileSync('python3', ['-I', path.join(ROOT, 'scripts/metrics.py'), tmp, String(y)], { stdio: 'ignore' });
  compareYear(y, path.join(tmp, `district_metrics_${y}.csv`));
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(failures ? `\nPARITY FAILED: ${failures} difference(s)` : '\nPARITY OK');
process.exit(failures ? 1 : 0);
