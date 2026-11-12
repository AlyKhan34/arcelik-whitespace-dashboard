// UI, filter and offline tests (design.md section 10, S2-S5). Runs the built HTML from file://
// in headless Chromium with the network switched off.
//   node tests/ui.mjs            -> all checks + screenshots in tests/screenshots/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = pathToFileURL(path.join(ROOT, 'dist/whitespace_dashboard.html')).href;
const SHOTS = path.join(ROOT, 'tests/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const ok = (cond, label, detail = '') => { if (!cond) failures++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${cond || !detail ? '' : ' -> ' + detail}`); };

// ---------- independent expectations straight from the CSVs (not from the page's JS)
function readCsv(file) {
  const [head, ...rows] = fs.readFileSync(path.join(ROOT, 'data', file), 'utf8').trim().split('\n');
  const cols = head.split(',');
  return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v])));
}
const districts = readCsv('district_metrics_2025.csv');
const stores = readCsv('stores_dummy.csv');
function expected(f) {
  const y = f.y || 2025, m = f.m || '2026-10';
  const act = new Map();
  for (const s of stores) {
    if (f.b && s.brand !== f.b) continue;
    if (f.f && s.format !== f.f) continue;
    if (s.open_month <= m && (s.close_month === '' || s.close_month > m)) act.set(s.tuik_code, (act.get(s.tuik_code) || 0) + 1);
  }
  const rows = districts.filter(d => (!f.r || d.region.startsWith(f.r + ' ')) && (!f.p || d.il === f.p) && (!f.t || d.sege_kademe === f.t));
  let st = 0, none = 0, ws = 0, sales = 0;
  for (const d of rows) {
    const n = act.get(d.tuik_code) || 0; st += n; if (n === 0) none++;
    if (y === 2025 && +d.score >= 70 && n === 0) ws++;
    sales += +d[`housing_sales_${y}`];
  }
  return { rows: rows.length, stores: st, none, ws: y === 2025 ? ws : null, sales };
}
const toNum = (s) => +String(s).replace(/[^\d.-]/g, '');

const browser = await chromium.launch();
const ctx = await browser.newContext({ offline: true });
const network = [];
ctx.on('request', (r) => { if (!/^(file|data|blob|about):/.test(r.url())) network.push(r.url()); });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

async function open(hash, lang = 'en', width = 1280) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
  await page.goto('about:blank'); // force a fresh load (a hash-only change would keep the old page)
  await page.goto(`${FILE}?lang=${lang}${hash}`);
  await page.waitForFunction(() => window.__ws && document.querySelector('#page').children.length > 0);
  await page.waitForTimeout(150);
}
const kpis = () => page.$$eval('.kpi-value', els => els.map(e => e.textContent));

// ---------- S1: default view headline numbers (rendered on the page)
console.log('\n== default view (S1)');
await open('#/overview');
let k = await kpis();
ok(toNum(k[0]) === 3069, 'active stores 3,069', k[0]);
ok(k[1] === '11.0', 'stores per 100k households (1 decimal) 11.0', k[1]);
ok((await page.textContent('.kpi:nth-child(2) .kpi-sub')).includes('10.97'), 'national figure 10.97 shown');
ok(k[2] === '86.0%', 'household coverage 86.0%', k[2]);
ok(toNum(k[3]) === 470, 'districts without a store 470', k[3]);
ok(toNum(k[4]) === 30, 'white-space districts 30', k[4]);
ok(toNum(k[5]) === 1760292, 'housing sales 2025 1,760,292', k[5]);
await open('#/ranking');
const chips = await page.$$eval('.chip b', els => els.map(e => e.textContent).join(' / '));
ok(chips === '30 / 53 / 57 / 23', 'flag chips 30 / 53 / 57 / 23', chips);
const first = await page.textContent('#tbl tbody tr:first-child');
ok(first.includes('Esenyurt') && first.includes('97.7'), 'rank 1 = İstanbul / Esenyurt 97.7', first.slice(0, 80));

// ---------- S2: filters change every KPI, chart and table consistently
console.log('\n== filters (S2)');
const combos = [
  { name: 'region TR1 İstanbul (via select)', f: { r: 'TR1' }, ui: async () => { await open('#/overview'); await page.selectOption('select[data-f="r"]', 'TR1'); } },
  { name: 'brand Beko (via select)', f: { b: 'Beko' }, ui: async () => { await open('#/overview'); await page.selectOption('select[data-f="b"]', 'Beko'); } },
  { name: 'province Ankara', f: { p: 'Ankara' } },
  { name: 'SEGE tier 2 + Arçelik', f: { t: '2', b: 'Arçelik' } },
  { name: 'format AVM, stores as of 2024-06', f: { f: 'AVM', m: '2024-06' } },
  { name: 'year 2024', f: { y: 2024 } },
  { name: 'month slider to 2023-01 (keyboard)', f: { m: '2023-01' }, ui: async () => { await open('#/overview'); await page.focus('input[data-f="m"]'); await page.keyboard.press('Home'); await page.waitForTimeout(200); } },
];
for (const c of combos) {
  const e = expected(c.f);
  const q = Object.entries(c.f).map(([a, b]) => `${a}=${encodeURIComponent(b)}`).join('&');
  if (c.ui) await c.ui(); else await open('#/overview?' + q);
  await page.waitForTimeout(150);
  k = await kpis();
  const mapN = await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('ch-map')).getOption().series[0].data.length);
  const hashOk = await page.evaluate((f) => Object.entries(f).every(([a, b]) => decodeURIComponent(location.hash).includes(`${a}=${b}`)), c.f);
  const good = toNum(k[0]) === e.stores && toNum(k[3]) === e.none && toNum(k[5]) === e.sales && (e.ws === null || toNum(k[4]) === e.ws) && mapN === e.rows && hashOk;
  ok(good, `${c.name}: stores ${e.stores}, no-store ${e.none}, sales ${e.sales}${e.ws === null ? '' : ', ws ' + e.ws}, map ${e.rows} bubbles, in URL`,
    `page stores ${k[0]}, no-store ${k[3]}, sales ${k[5]}, ws ${k[4]}, map ${mapN}, hash ${hashOk}`);
  // same view on the ranking page: table row count and top-20 chart
  await page.evaluate(() => { location.hash = location.hash.replace('#/overview', '#/ranking'); });
  await page.waitForSelector('#tbl table');
  const nRows = toNum(await page.textContent('#tbl .tools .muted'));
  const top = await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('ch-top')).getOption().series[0].data.length);
  ok(nRows === e.rows && top === Math.min(20, e.rows), `  ranking table ${e.rows} rows, top-20 chart ${Math.min(20, e.rows)} bars`, `table ${nRows}, chart ${top}`);
}
// İstanbul region sums check against the 39 districts explicitly
const ist = expected({ r: 'TR1' });
ok(ist.rows === 39, 'TR1 İstanbul has 39 districts in the reference', ist.rows);
// flag chip filters the table
await open('#/ranking');
await page.click('.chip.flag-white_space');
await page.waitForTimeout(100);
ok(toNum(await page.textContent('#tbl .tools .muted')) === 30, 'clicking the white-space chip leaves 30 rows');
// search
await page.fill('#search', 'esenyurt');
await page.waitForTimeout(100);
await page.click('.chip.flag-white_space');
await page.waitForTimeout(100);
await page.fill('#search', 'esenyurt');
await page.waitForTimeout(100);
ok(toNum(await page.textContent('#tbl .tools .muted')) === 1, 'search "esenyurt" finds 1 district');
// weights recompute: 100/0/0 -> rank 1 = most households; 0/100/0 -> rank 1 = highest SEGE score
const maxBy = (col) => districts.reduce((a, b) => (+b[col] > +a[col] ? b : a));
for (const [w, col] of [['100-0-0', 'households_2025'], ['0-100-0', 'sege_score']]) {
  const want = maxBy(col);
  await open('#/method?w=' + w);
  const txt = await page.textContent('.wsum');
  ok(txt.includes(`${want.il} / ${want.ilce}`) && txt.includes('100.0'), `weights ${w}: rank 1 = ${want.il} / ${want.ilce} (top ${col}), score 100.0`, txt);
}
await open('#/ranking?w=100-0-0');
ok((await page.textContent('#tbl tbody tr:first-child')).includes(maxBy('households_2025').ilce), '  ...and the ranking page uses the same weights');
// district route + 2023 note
await open('#/district/2053');
ok((await page.textContent('.dname')) === 'Esenyurt', '#/district/2053 opens Esenyurt');
await open('#/ranking?y=2023');
ok((await page.$('.note')) !== null && (await page.$$eval('.chip b', e => e[2].textContent)) === '–', '2023: housing boom shown as empty with a note');

// ---------- S3-S5: pages x languages x widths; offline, no errors, no horizontal scroll, how-to + tooltips
console.log('\n== pages x EN/TR x 1280/390 (S3-S5)');
for (const lang of ['en', 'tr']) for (const width of [1280, 390]) for (const p of ['overview', 'ranking', 'district/2053', 'method']) {
  await open('#/' + p, lang, width);
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const howto = await page.$$eval('.howto', e => e.length);
  const tips = await page.$$eval('.kpi', els => els.every(el => (el.querySelector('.tip')?.textContent || '').length > 10));
  const lhtml = await page.evaluate(() => document.documentElement.lang);
  const name = `${p.split('/')[0]}_${lang}_${width}.png`;
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true });
  ok(scroll <= 0 && howto === 1 && tips && lhtml === lang, `${name}: no h-scroll, how-to note, KPI tooltips, lang=${lang}`, `scroll ${scroll}, howto ${howto}, tips ${tips}, lang ${lhtml}`);
}
const trSample = await (async () => { await open('#/overview', 'tr'); return (await kpis())[5]; })();
ok(trSample === '1.760.292', 'Turkish number format (1.760.292)', trSample);
ok(network.length === 0, 'no network requests (offline context)', network.slice(0, 3).join(', '));
ok(errors.length === 0, 'no console errors', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures ? `\nUI TESTS FAILED: ${failures}` : '\nUI TESTS OK');
process.exit(failures ? 1 : 0);
