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
  { name: 'format AVM (via select)', f: { f: 'AVM' }, ui: async () => { await open('#/overview'); await page.selectOption('select[data-f="f"]', 'AVM'); } },
  { name: 'province Ankara', f: { p: 'Ankara' } },
  { name: 'SEGE tier 2 + dealers', f: { t: '2', f: 'Bayi' } },
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

// ---------- usability: empty states, notices, filter chips, map, navigation
console.log('\n== usability');
await open('#/overview?p=%C4%B0stanbul&t=3');
ok(await page.isVisible('.empty-state') && (await page.$$('.kpi')).length === 0, 'İstanbul + tier 3: empty state instead of an empty map');
await page.click('.empty-state [data-k="t"]');
await page.waitForTimeout(150);
k = await kpis();
const scope = await page.textContent('.ctx-scope');
ok(toNum(k[0]) === expected({ p: 'İstanbul' }).stores && scope.includes('39'), '  "remove tier" suggestion -> İstanbul, 39 districts', `${k[0]} / ${scope}`);
await open('#/ranking?p=%C4%B0stanbul&t=3');
ok(await page.isVisible('.empty-state'), 'ranking page shows the same empty state');
await open('#/overview?p=Hakkari&f=AVM');
ok(await page.isVisible('.notice') && toNum((await kpis())[0]) === 0, 'Hakkari + mall shops: "no active store" notice');
await page.click('.notice [data-k="f"]');
await page.waitForTimeout(150);
k = await kpis();
ok(toNum(k[0]) === expected({ p: 'Hakkari' }).stores && !(await page.$('.notice')), '  "show all formats" -> Hakkari stores, notice gone', k[0]);
await open('#/overview?r=TR1&f=AVM');
await page.click('.context .fchip[data-k="f"]');
await page.waitForTimeout(150);
ok(toNum((await kpis())[0]) === expected({ r: 'TR1' }).stores, 'removing the mall-shop chip in the context bar -> all İstanbul stores');
// Beko is gone: no brand filter, and an old link with b=Beko shows the default view
await open('#/overview?b=Beko');
ok(!(await page.$('select[data-f="b"]')) && toNum((await kpis())[0]) === 3069 && !(await page.textContent('body')).includes('Beko'),
  'no brand filter and no "Beko" anywhere; an old ?b=Beko link shows all 3,069 stores');
ok(stores.every(s => s.brand === 'Arçelik'), 'stores_dummy.csv: every row is Arçelik');
await open('#/overview');
ok((await page.textContent('.opp-list li:first-child')).includes('Atakum'), 'opportunities list starts with Atakum (rank-9 white space)');
await page.click('.kpi.alert a');
await page.waitForSelector('#tbl table');
ok(toNum(await page.textContent('#tbl .tools .muted')) === 30, 'white-space KPI "view list" -> ranking filtered to 30');
await open('#/overview');
await page.evaluate(() => document.getElementById('ch-map').scrollIntoView({ block: 'center' }));
const px = await page.evaluate(() => {
  const c = echarts.getInstanceByDom(document.getElementById('ch-map'));
  const r = document.getElementById('ch-map').getBoundingClientRect();
  const q = c.convertToPixel({ geoIndex: 0 }, [33.35, 38.8]); // Tuz Gölü: inside provinces, away from district centres
  return [r.left + q[0], r.top + q[1]];
});
await page.mouse.click(px[0], px[1]);
await page.waitForTimeout(200);
const picked = await page.evaluate(() => window.__ws.state().p);
ok(['Konya', 'Aksaray', 'Ankara'].includes(picked) && (await page.isVisible('.context .fchip[data-k="p"]')), 'clicking a province on the map filters to it', picked);
await open('#/district/2053');
await page.click('.stepper a');
await page.waitForTimeout(150);
ok((await page.textContent('.dname')) === 'Nilüfer', 'district page "#2 ›" goes to the rank-2 district');
await open('#/overview', 'en', 390);
const hiddenBefore = !(await page.isVisible('select[data-f="r"]'));
await page.click('.ftoggle');
ok(hiddenBefore && await page.isVisible('select[data-f="r"]'), 'phone: filters collapse behind a "Filters" button and open on tap');
await open('#/ranking');
await page.fill('#search', 'zzzz');
await page.waitForTimeout(100);
ok(await page.isVisible('[data-act="clearq"]'), 'empty search shows a "clear search" button');
await page.click('[data-act="clearq"]');
await page.waitForTimeout(100);
ok(toNum(await page.textContent('#tbl .tools .muted')) === 973, '  ...which restores all 973 rows');

// keyboard: Enter on a focused table row opens that district
await open('#/ranking');
await page.focus('#tbl tbody tr:first-child');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
ok((await page.evaluate(() => window.__ws.state().page)) === 'district' && (await page.textContent('.dname')) === 'Esenyurt', 'Enter on a focused ranking row opens the district');
// district search: exact pick opens at once, a partial name + Enter takes the best match, no match says so
const pickTo = async (text, enter) => {
  await open('#/district/2053');
  await page.fill('#pick', text);
  if (enter) await page.press('#pick', 'Enter');
  await page.waitForTimeout(200);
};
await pickTo('Ankara / Çankaya', false);
ok((await page.textContent('.dname')) === 'Çankaya', 'district search: picking "Ankara / Çankaya" opens it without Enter');
await pickTo('kadık', true);
ok((await page.textContent('.dname')) === 'Kadıköy', 'district search: "kadık" + Enter opens Kadıköy');
await pickTo('zzzz', true);
ok((await page.textContent('#pick-msg')).includes('zzzz') && (await page.textContent('.dname')) === 'Esenyurt', 'district search: no match shows a message and stays put');
await open('#/district/2053?w=60-20-20&r=TR1');
ok(await page.isVisible('.context .fchip[data-k="w"]') && await page.isVisible('.context .fchip[data-k="r"]'), 'district page shows the active filters and weights');

// score weights: mouse drag works, and the new weights follow you to every page
await open('#/method');
{
  const box = await (await page.$('[data-w="0"]')).boundingBox();
  const x0 = box.x + box.width * 0.40, x1 = box.x + box.width * 0.80, yy = box.y + box.height / 2;
  await page.mouse.move(x0, yy); await page.mouse.down();
  for (let k = 1; k <= 10; k++) { await page.mouse.move(x0 + (x1 - x0) * k / 10, yy); await page.waitForTimeout(30); }
  await page.mouse.up(); await page.waitForTimeout(200);
}
const wNow = await page.evaluate(() => window.__ws.state().w.join('/'));
ok(wNow === '80/10/10', 'dragging the households slider from 40% to 80% gives 80 / 10 / 10 (others keep their 30:30 ratio)', wNow);
ok((await page.textContent('#wformula')).includes('80%'), '  ...the formula text updates while dragging');
await page.focus('[data-w="0"]');
for (let k = 0; k < 4; k++) await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
const topHH = districts.reduce((a, b) => (+b.households_2025 > +a.households_2025 ? b : a));
await page.click('#nav a[href^="#/ranking"]');
await page.waitForSelector('#tbl table');
ok((await page.textContent('#tbl tbody tr:first-child')).includes(topHH.ilce) && await page.isVisible('.context .fchip[data-k="w"]'),
  `weights 100/0/0, then the sidebar link to Ranking: rank 1 = ${topHH.ilce} (most households) and a weights chip is shown`);
await page.click('#nav a[href^="#/overview"]');
await page.waitForTimeout(200);
ok(decodeURIComponent(await page.evaluate(() => location.hash)).includes('w=100-0-0'), '  ...the Overview link keeps the weights too');
await page.click('.context .fchip[data-k="w"]');
await page.waitForTimeout(200);
ok(await page.evaluate(() => window.__ws.state().w.join('/')) === '40/30/30' && (await page.textContent('.opp-list li:first-child')).includes('Atakum'),
  '  removing the weights chip restores 40 / 30 / 30');

// several flags at once (any / all) + store quick filter, chart and table agree
const has = (d, f) => d[`flag_${f}`] === 'True';
const union = districts.filter(d => has(d, 'white_space') || has(d, 'housing_boom')).length;
const inter = districts.filter(d => has(d, 'white_space') && has(d, 'housing_boom')).length;
const usNoStore = districts.filter(d => has(d, 'under_served') && +d.stores === 0).length;
await open('#/ranking');
await page.click('.chip.flag-white_space');
await page.click('.chip.flag-housing_boom');
await page.waitForTimeout(150);
const rowsN = async () => toNum(await page.textContent('#tbl .tools .muted'));
const topN = async () => page.evaluate(() => { const el = document.getElementById('ch-top'); return el ? echarts.getInstanceByDom(el).getOption().series[0].data.length : 0; });
ok(await rowsN() === inter && await topN() === Math.min(20, inter) && decodeURIComponent(await page.evaluate(() => location.hash)).includes('flag=white_space,housing_boom'),
  `white space + housing boom (default AND): only the ${inter} districts with both flags, chart agrees, kept in the URL`, `${await rowsN()} / ${await topN()}`);
const bothFlags = await page.$$eval('#tbl tbody tr', trs => trs.every(tr => tr.querySelector('.flag-white_space') && tr.querySelector('.flag-housing_boom')));
ok(bothFlags, '  ...every listed row carries both flags');
await page.click('[data-act="fm"][data-v="any"]');
await page.waitForTimeout(150);
ok(await rowsN() === union, `  ...switch to OR: ${union} rows`, String(await rowsN()));
await page.click('[data-act="clearflags"]');
await page.click('.chip.flag-white_space');
await page.click('.chip.flag-under_served');
await page.waitForTimeout(150);
ok(await rowsN() === 0 && await page.isVisible('.notice.conflict'), 'white space + under-served (AND): 0 rows, with a note that they never co-occur');
await page.click('.notice.conflict [data-act="fm"]');
await page.waitForTimeout(150);
const wsOrUs = districts.filter(d => has(d, 'white_space') || has(d, 'under_served')).length;
ok(await rowsN() === wsOrUs && !(await page.$('.notice.conflict')), `  ...its "any of these" button -> ${wsOrUs} rows`, String(await rowsN()));
await page.click('[data-act="clearflags"]');
await page.click('.chip.flag-under_served');
await page.click('[data-act="sf"][data-v="0"]');
await page.waitForTimeout(150);
ok(await rowsN() === usNoStore && (await page.isVisible('#tbl [data-act="clearflags"]')), `under-served + "no store" -> ${usNoStore} rows with a clear button`, String(await rowsN()));
await page.click('#tbl [data-act="clearflags"]');
await page.waitForTimeout(150);
ok(await rowsN() === 973, '  clear -> all 973 rows');
// the map keeps Türkiye's proportions (no stretch) at both widths
for (const width of [1280, 390]) {
  await open('#/overview', 'en', width);
  const ratio = await page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.getElementById('ch-map'));
    const a = c.convertToPixel({ geoIndex: 0 }, [26, 36]), b = c.convertToPixel({ geoIndex: 0 }, [45, 42]);
    return Math.abs(b[0] - a[0]) / Math.abs(b[1] - a[1]);   // drawn width / height of a 19° × 6° box
  });
  ok(Math.abs(ratio - 19 / 6 * 0.78) < 0.05, `map at ${width}px keeps its aspect ratio (${(19 / 6 * 0.78).toFixed(2)})`, ratio.toFixed(2));
}

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
for (const [hash, name] of [['#/overview?p=%C4%B0stanbul&t=3', 'empty'], ['#/overview?p=Hakkari&f=AVM', 'nostore'], ['#/overview?r=TR5', 'region']]) {
  for (const width of [1280, 390]) { await open(hash, 'tr', width); await page.screenshot({ path: path.join(SHOTS, `state_${name}_tr_${width}.png`), fullPage: true }); }
}
const trSample = await (async () => { await open('#/overview', 'tr'); return (await kpis())[5]; })();
ok(trSample === '1.760.292', 'Turkish number format (1.760.292)', trSample);
ok(network.length === 0, 'no network requests (offline context)', network.slice(0, 3).join(', '));
ok(errors.length === 0, 'no console errors', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures ? `\nUI TESTS FAILED: ${failures}` : '\nUI TESTS OK');
process.exit(failures ? 1 : 0);
