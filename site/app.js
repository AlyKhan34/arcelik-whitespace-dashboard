/* Store white-space dashboard: state, routing, rendering. Metrics come from metrics.js. */
(function () {
  'use strict';
  const DATA = JSON.parse(document.getElementById('ws-data').textContent);
  const M = window.WSMetrics, I18N = window.WS_I18N;
  const CFG = DATA.config, D = DATA.districts, N = D.code.length, ST = DATA.stores;
  const PAGES = ['overview', 'ranking', 'district', 'method'];
  const FLAGS = ['white_space', 'under_served', 'housing_boom', 'over_served'];
  const FLAG_EMOJI = { white_space: '🔴', under_served: '🟠', housing_boom: '🟡', over_served: '⚪' };
  const C = {
    accent: '#2a78d6', ink: '#0b0b0b', ink2: '#52514e', muted: '#8a8984', grid: '#e7e6e2', geo: '#f1f0ec', geoLine: '#c9c7c1',
    seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
    flag: { white_space: '#d03b3b', under_served: '#ec835a', housing_boom: '#fab219', over_served: '#a3a29c', none: '#9ec5f4' },
    div: { lo2: '#c7393a', lo1: '#ef9f9c', mid: '#bdbcb6', hi1: '#86b6ef', hi2: '#256abf' },
  };
  const REGION_CODE = DATA.regions.map(r => r.split(' ')[0]);
  const M_FIRST = M.monthInt(CFG.store_month_first), M_LAST = M.monthInt(CFG.default_store_month);
  const SALES_M0 = M.monthInt(DATA.sales_months[0]), NS = DATA.sales_months.length;
  const codeIdx = new Map(D.code.map((c, i) => [c, i]));
  const provinces = Array.from(new Set(D.il)).sort((a, b) => a.localeCompare(b, 'tr'));
  const provRegion = new Map(D.il.map((p, i) => [p, D.region[i]]));
  const storesByDistrict = Array.from({ length: N }, () => []);
  ST.id.forEach((_, k) => storesByDistrict[ST.district[k]].push(k));

  // ------------------------------------------------------------------ language and formats
  function getLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'tr') return q;
    try { const s = localStorage.getItem('ws-lang'); if (s === 'en' || s === 'tr') return s; } catch (e) { /* storage off */ }
    return 'en';
  }
  let LANG = getLang();
  const t = (k, p) => {
    let s = (I18N[LANG] && I18N[LANG][k]) ?? I18N.en[k] ?? k;
    if (p) for (const [a, b] of Object.entries(p)) s = s.split('{' + a + '}').join(b);
    return s;
  };
  const loc = () => (LANG === 'tr' ? 'tr-TR' : 'en-GB');
  const nfCache = {};
  const nf = (o) => { const k = LANG + JSON.stringify(o); return nfCache[k] || (nfCache[k] = new Intl.NumberFormat(loc(), o)); };
  const fInt = (v) => nf({ maximumFractionDigits: 0 }).format(v);
  const fDec = (v, d) => (Number.isFinite(v) ? nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(v) : '–');
  const fPct = (ratio, d = 1) => (Number.isFinite(ratio) ? nf({ style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(ratio) : '–');
  const fYoY = (pct) => (Number.isFinite(pct) ? nf({ style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(pct / 100) : '–');
  const fMonth = (mi) => new Intl.DateTimeFormat(loc(), { month: 'short', year: 'numeric' }).format(new Date(Math.floor(mi / 12), mi % 12, 1));
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dname = (i) => D.il[i] + ' / ' + D.ilce[i];

  // ------------------------------------------------------------------ state <-> URL hash
  const DEF = { page: 'overview', district: null, r: '', p: '', t: '', b: '', f: '', y: CFG.default_year, m: CFG.default_store_month,
    w: [CFG.weights.households, CFG.weights.income, CFG.weights.housing], flag: '', s: 'rank', d: 1, color: 'score' };
  const COLOR_MODES = ['score', 'households', 'income', 'housing', 'per100k'];
  const SORTS = ['rank', 'district', 'region', 'households', 'tier', 'sales', 'yoy', 'stores', 'per100k', 'score'];
  let S = parseHash();
  let ui = { q: '', pg: 1 };
  let lastHash = location.hash;

  function parseHash() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const qi = h.indexOf('?'), path = qi < 0 ? h : h.slice(0, qi), q = new URLSearchParams(qi < 0 ? '' : h.slice(qi + 1));
    const st = Object.assign({}, DEF, { w: DEF.w.slice() });
    const parts = path.split('/');
    if (PAGES.includes(parts[0])) st.page = parts[0];
    if (st.page === 'district' && codeIdx.has(+parts[1])) st.district = +parts[1];
    if (REGION_CODE.includes(q.get('r'))) st.r = q.get('r');
    if (provinces.includes(q.get('p'))) st.p = q.get('p');
    if (/^[1-6]$/.test(q.get('t') || '')) st.t = q.get('t');
    if (DATA.brands.includes(q.get('b'))) st.b = q.get('b');
    if (DATA.formats.includes(q.get('f'))) st.f = q.get('f');
    if (CFG.years.includes(+q.get('y'))) st.y = +q.get('y');
    const mm = q.get('m');
    if (mm && /^\d{4}-\d{2}$/.test(mm) && M.monthInt(mm) >= M_FIRST && M.monthInt(mm) <= M_LAST) st.m = mm;
    const w = (q.get('w') || '').split('-').map(Number);
    if (w.length === 3 && w.every(x => Number.isInteger(x) && x >= 0) && w[0] + w[1] + w[2] === 100) st.w = w;
    if (FLAGS.includes(q.get('flag'))) st.flag = q.get('flag');
    if (SORTS.includes(q.get('s'))) st.s = q.get('s');
    if (q.get('d') === '-1') st.d = -1;
    if (COLOR_MODES.includes(q.get('c'))) st.color = q.get('c');
    if (st.p && st.r && REGION_CODE[provRegion.get(st.p)] !== st.r) st.p = '';
    return st;
  }
  function query(st) {
    const q = [];
    const add = (k, v, def) => { if (v !== def && v !== '' && v !== null) q.push(k + '=' + encodeURIComponent(v)); };
    add('r', st.r, ''); add('p', st.p, ''); add('t', st.t, ''); add('b', st.b, ''); add('f', st.f, '');
    add('y', st.y, DEF.y); add('m', st.m, DEF.m); add('w', st.w.join('-'), DEF.w.join('-'));
    add('flag', st.flag, ''); add('s', st.s, DEF.s); add('d', st.d, 1); add('c', st.color, DEF.color);
    return q.length ? '?' + q.join('&') : '';
  }
  function hashFor(page, district, st = S) { return '#/' + page + (page === 'district' && district ? '/' + district : '') + query(st); }
  function writeHash(push) {
    const h = hashFor(S.page, S.district);
    if (h === location.hash) return;
    lastHash = h;
    if (push) { location.hash = h; return; }
    try { history.replaceState(null, '', h); } catch (e) { location.hash = h; }
  }
  function set(patch, push) {
    Object.assign(S, patch);
    if (!('pg' in patch)) ui.pg = 1;
    writeHash(push);
    render();
    if (push) window.scrollTo(0, 0);
  }
  function go(page, district) { set({ page, district: district ?? S.district }, true); }
  window.addEventListener('hashchange', () => {
    if (location.hash === lastHash) return;
    lastHash = location.hash; S = parseHash(); render(); window.scrollTo(0, 0);
  });

  // ------------------------------------------------------------------ compute the view
  let demCache = { key: '', v: null };
  function view() {
    const key = S.y + '|' + S.w.join('-');
    if (demCache.key !== key) {
      demCache = { key, v: M.demand(DATA, S.y, { households: S.w[0], income: S.w[1], housing: S.w[2] }) };
    }
    const res = M.compute(DATA, { year: S.y, month: S.m, brand: DATA.brands.indexOf(S.b), format: DATA.formats.indexOf(S.f),
      weights: { households: S.w[0], income: S.w[1], housing: S.w[2] } }, demCache.v);
    const rIdx = S.r ? REGION_CODE.indexOf(S.r) : -1;
    const idx = [];
    for (let i = 0; i < N; i++) {
      if (rIdx >= 0 && D.region[i] !== rIdx) continue;
      if (S.p && D.il[i] !== S.p) continue;
      if (S.t && D.sege_tier[i] !== +S.t) continue;
      idx.push(i);
    }
    return { res, idx, set: new Set(idx) };
  }
  const flagsOf = (res, i) => FLAGS.filter(f => res.flags[f][i]);
  const mainFlag = (res, i) => flagsOf(res, i)[0] || 'none';
  const flagLabel = (f) => FLAG_EMOJI[f] + ' ' + t('flag_' + f);

  // ------------------------------------------------------------------ charts registry
  let charts = [];
  function chart(el, option) {
    const c = echarts.init(el, null, { renderer: 'canvas' });
    c.setOption(Object.assign({ animation: false, textStyle: { fontFamily: 'inherit', color: C.ink2 } }, option));
    charts.push(c);
    return c;
  }
  function disposeCharts() { charts.forEach(c => c.dispose()); charts = []; }
  window.addEventListener('resize', () => charts.forEach(c => c.resize()));
  const narrow = () => window.innerWidth < 700;
  const ttStyle = { backgroundColor: '#fff', borderColor: C.grid, textStyle: { color: C.ink, fontSize: 12 }, extraCssText: 'box-shadow:0 2px 10px rgba(0,0,0,.12);max-width:280px;white-space:normal;' };

  // ------------------------------------------------------------------ shell: nav, filters, footer
  const ICONS = { overview: '◉', ranking: '≡', district: '⌖', method: 'ƒ' };
  function renderShell() {
    document.documentElement.lang = LANG;
    document.title = t('app_title');
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.getElementById('nav').innerHTML = PAGES.map(p =>
      `<a href="${hashFor(p, p === 'district' ? (S.district || topDistrict()) : null)}" class="${S.page === p ? 'active' : ''}" ${S.page === p ? 'aria-current="page"' : ''}><span class="ico" aria-hidden="true">${ICONS[p]}</span>${esc(t('nav_' + p))}</a>`).join('');
    document.querySelectorAll('.lang button').forEach(b => b.classList.toggle('active', b.dataset.lang === LANG));
    document.getElementById('foot').innerHTML = esc(t('footer', { built: DATA.built }));
    renderFilters();
  }
  function topDistrict() { return D.code[(demCache.v || M.demand(DATA, S.y, { households: S.w[0], income: S.w[1], housing: S.w[2] })).order[0]]; }

  function opt(v, label, sel) { return `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(label)}</option>`; }
  function renderFilters() {
    const el = document.getElementById('filters');
    el.hidden = S.page === 'method';
    if (el.hidden) return;
    const rIdx = S.r ? REGION_CODE.indexOf(S.r) : -1;
    const provs = provinces.filter(p => rIdx < 0 || provRegion.get(p) === rIdx);
    const mi = M.monthInt(S.m);
    const changed = S.r || S.p || S.t || S.b || S.f || S.y !== DEF.y || S.m !== DEF.m;
    el.innerHTML = `
      <label class="f"><span>${t('f_region')}</span><select data-f="r">${opt('', t('all'), S.r)}${DATA.regions.map((r, i) => opt(REGION_CODE[i], r, S.r)).join('')}</select></label>
      <label class="f"><span>${t('f_province')}</span><select data-f="p">${opt('', t('all'), S.p)}${provs.map(p => opt(p, p, S.p)).join('')}</select></label>
      <label class="f"><span>${t('f_tier')}</span><select data-f="t">${opt('', t('all'), S.t)}${[1, 2, 3, 4, 5, 6].map(k => opt(String(k), t('tier_n', { n: k }), S.t)).join('')}</select></label>
      <label class="f"><span>${t('f_brand')}</span><select data-f="b">${opt('', t('all'), S.b)}${DATA.brands.map(b => opt(b, b, S.b)).join('')}</select></label>
      <label class="f"><span>${t('f_format')}</span><select data-f="f">${opt('', t('all'), S.f)}${DATA.formats.map(f => opt(f, t('fmt_' + f), S.f)).join('')}</select></label>
      <label class="f"><span>${t('f_year')}</span><select data-f="y">${CFG.years.map(y => opt(String(y), String(y), String(S.y))).join('')}</select></label>
      <label class="f f-month"><span>${t('f_month')} <b id="mlabel">${esc(fMonth(mi))}</b></span>
        <input type="range" data-f="m" min="${M_FIRST}" max="${M_LAST}" step="1" value="${mi}" aria-label="${esc(t('f_month'))}"></label>
      <button type="button" class="btn reset" data-act="reset" ${changed ? '' : 'disabled'}>${t('reset')}</button>`;
  }
  let rafPending = null;
  document.getElementById('filters').addEventListener('change', (e) => {
    const k = e.target.dataset.f; if (!k || k === 'm') return;
    const v = e.target.value, patch = { [k]: k === 'y' ? +v : v };
    if (k === 'r' && S.p && REGION_CODE[provRegion.get(S.p)] !== v && v) patch.p = '';
    set(patch);
  });
  document.getElementById('filters').addEventListener('input', (e) => {
    if (e.target.dataset.f !== 'm') return;
    const m = M.monthStr(+e.target.value);
    document.getElementById('mlabel').textContent = fMonth(+e.target.value);
    if (rafPending) cancelAnimationFrame(rafPending);
    rafPending = requestAnimationFrame(() => { rafPending = null; Object.assign(S, { m }); ui.pg = 1; writeHash(false); renderPage(); syncReset(); });
  });
  function syncReset() {
    const b = document.querySelector('[data-act="reset"]');
    if (b) b.disabled = !(S.r || S.p || S.t || S.b || S.f || S.y !== DEF.y || S.m !== DEF.m);
  }
  document.querySelector('.lang').addEventListener('click', (e) => {
    const l = e.target.dataset.lang; if (!l || l === LANG) return;
    LANG = l;
    try { localStorage.setItem('ws-lang', l); } catch (err) { /* storage off */ }
    const u = new URL(location.href);
    if (u.searchParams.has('lang')) { u.searchParams.set('lang', l); try { history.replaceState(null, '', u.href); } catch (err) { /* file:// */ } }
    render();
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'reset') set({ r: '', p: '', t: '', b: '', f: '', y: DEF.y, m: DEF.m, flag: '' });
      else if (act === 'color') set({ color: a.dataset.v });
      else if (act === 'flag') set({ flag: S.flag === a.dataset.v ? '' : a.dataset.v });
      else if (act === 'sort') { const k = a.dataset.v; set({ s: k, d: S.s === k ? -S.d : (k === 'district' || k === 'region' || k === 'rank' || k === 'tier' ? 1 : -1) }); }
      else if (act === 'page') { ui.pg = +a.dataset.v; renderTable(); document.getElementById('tbl').scrollIntoView({ block: 'start' }); }
      else if (act === 'csv') exportCsv();
      else if (act === 'wreset') set({ w: DEF.w.slice() });
      return;
    }
    const row = e.target.closest('tr[data-code]');
    if (row && !e.target.closest('a')) go('district', +row.dataset.code);
  });

  // ------------------------------------------------------------------ building blocks
  function howTo(key) { return `<p class="howto"><b>${t('howto')}</b> ${esc(t(key))}</p>`; }
  function kpi(label, value, sub, formula) {
    return `<div class="kpi"><div class="kpi-label">${esc(label)}<button type="button" class="info" aria-label="${esc(t('formula'))}">i</button>
      <span class="tip" role="tooltip">${esc(formula)}</span></div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
  }
  function card(title, body, extra = '') { return `<section class="card"><div class="card-head"><h2>${esc(title)}</h2>${extra}</div>${body}</section>`; }
  function flagChips(res, i, withRule) {
    const f = flagsOf(res, i);
    if (!f.length) return withRule ? `<span class="muted">${t('no_flags')}</span>` : '';
    return f.map(x => `<span class="flag flag-${x}" title="${esc(ruleText(x))}">${flagLabel(x)}</span>`).join(' ');
  }
  function ruleText(f) {
    const c = CFG.flags[f];
    if (f === 'white_space') return t('rule_white_space', { s: c.min_score });
    if (f === 'under_served') return t('rule_under_served', { s: c.min_score, r: fPct(c.max_ratio_to_national, 0) });
    if (f === 'housing_boom') return t('rule_housing_boom', { y: c.min_yoy_pct, h: fInt(c.min_households), n: c.max_stores });
    return t('rule_over_served', { s: c.max_score, r: c.min_ratio_to_national });
  }

  // ------------------------------------------------------------------ page 1: overview
  function pageOverview(v) {
    const { res, idx } = v;
    let st = 0, hh = 0, hhCov = 0, none = 0, ws = 0, sales = 0, prev = 0;
    for (const i of idx) {
      st += res.stores[i]; hh += res.hh[i]; if (res.stores[i] > 0) hhCov += res.hh[i]; else none++;
      if (res.flags.white_space[i]) ws++; sales += res.hs[i]; if (res.prev) prev += res.prev[i];
    }
    const per = st / hh * 1e5, yoy = res.prev && prev ? (sales / prev - 1) * 100 : NaN;
    const ratio = per / res.national;
    const kpis = [
      kpi(t('k_stores'), fInt(st), esc(t('k_stores_sub', { m: fMonth(M.monthInt(S.m)) })), t('k_stores_f')),
      kpi(t('k_per100k'), fDec(per, 1), `<span class="${ratio < 1 ? 'neg' : 'pos'}">${esc(t('vs_national', { n: fDec(res.national, 2) }))}</span>`, t('k_per100k_f')),
      kpi(t('k_coverage'), fPct(hhCov / hh), esc(t('k_coverage_sub', { n: fInt(hhCov) })), t('k_coverage_f')),
      kpi(t('k_nostore'), fInt(none), esc(t('of_n', { n: fInt(idx.length) })), t('k_nostore_f')),
      kpi(t('k_ws'), `${FLAG_EMOJI.white_space} ${fInt(ws)}`, esc(t('k_ws_sub', { s: CFG.flags.white_space.min_score })), ruleText('white_space')),
      kpi(t('k_sales', { y: S.y }), fInt(sales), Number.isFinite(yoy) ? `<span class="${yoy < 0 ? 'neg' : 'pos'}">${esc(t('yoy_val', { v: fYoY(yoy) }))}</span>` : esc(t('no_yoy')), t('k_sales_f')),
    ].join('');
    const seg = COLOR_MODES.map(c => `<button type="button" data-act="color" data-v="${c}" class="${S.color === c ? 'active' : ''}" aria-pressed="${S.color === c}">${esc(t('c_' + c))}</button>`).join('');
    document.getElementById('page').innerHTML = `
      <h1>${esc(t('nav_overview'))}</h1>${howTo('howto_overview')}
      <div class="kpis">${kpis}</div>
      ${card(t('map_title'), `<div class="chart map" id="ch-map"></div><p class="legend-note">${esc(t('map_legend', { c: t('c_' + S.color) }))} <span class="ring" aria-hidden="true"></span> ${esc(t('map_ring'))}</p>`, `<div class="seg" role="group" aria-label="${esc(t('color_by'))}">${seg}</div>`)}
      <div class="two">
        ${card(t('trend_title'), `<div class="chart trend" id="ch-trend"></div>`)}
        ${card(S.r ? t('break_title_prov') : t('break_title'), `<div class="chart" id="ch-break"></div><p class="legend-note">${esc(t('break_note'))}</p>`)}
      </div>`;
    drawMap(v); drawTrend(v); drawBreakdown(v);
  }

  function colorValue(res, i, mode) {
    if (mode === 'households') return res.pH[i];
    if (mode === 'income') return res.pI[i];
    if (mode === 'housing') return res.pS[i];
    if (mode === 'per100k') return res.per100k[i];
    return res.score[i];
  }
  function drawMap(v) {
    const { res, idx } = v;
    if (!echarts.getMap('tr')) echarts.registerMap('tr', DATA.geo);
    const k = narrow() ? 0.5 : 1, maxHH = Math.sqrt(Math.max(...res.hh));
    const size = (i) => Math.max(3, Math.sqrt(res.hh[i]) / maxHH * 30 * k);
    const sorted = idx.slice().sort((a, b) => res.hh[b] - res.hh[a]);
    const pts = sorted.map(i => ({ value: [D.lon[i], D.lat[i], colorValue(res, i, S.color)], i }));
    const ring = sorted.filter(i => res.flags.white_space[i]).map(i => ({ value: [D.lon[i], D.lat[i], 0], i }));
    const per = S.color === 'per100k', mx = per ? Math.ceil(res.national * 3) : 100;
    // zoom to the filtered districts
    let center, zoom = 1;
    if (idx.length < N && idx.length) {
      const lo = idx.map(i => D.lon[i]), la = idx.map(i => D.lat[i]);
      const x0 = Math.min(...lo), x1 = Math.max(...lo), y0 = Math.min(...la), y1 = Math.max(...la);
      center = [(x0 + x1) / 2, (y0 + y1) / 2];
      zoom = Math.max(1, Math.min(8, Math.min(19.5 / Math.max(x1 - x0, 0.4), 6.5 / Math.max(y1 - y0, 0.25)) * 0.7));
    }
    const c = chart(document.getElementById('ch-map'), {
      tooltip: Object.assign({ trigger: 'item', formatter: (p) => tipDistrict(res, p.data.i) }, ttStyle),
      geo: { map: 'tr', roam: true, center, zoom, scaleLimit: { min: 1, max: 14 }, silent: true, aspectScale: 0.78,
        left: 6, right: 6, top: 6, bottom: 34,
        itemStyle: { areaColor: C.geo, borderColor: C.geoLine, borderWidth: 0.7 } },
      visualMap: { type: 'continuous', seriesIndex: 0, dimension: 2, min: 0, max: mx, calculable: false, orient: 'horizontal',
        left: 'center', bottom: 0, itemWidth: 10, itemHeight: narrow() ? 140 : 200, inRange: { color: C.seq },
        text: [per ? '≥ ' + fInt(mx) : '100', '0'], textStyle: { color: C.ink2, fontSize: 11 } },
      series: [
        { type: 'scatter', coordinateSystem: 'geo', data: pts, symbolSize: (val, p) => size(p.data.i),
          itemStyle: { borderColor: '#fff', borderWidth: 0.6, opacity: 0.92 }, emphasis: { itemStyle: { borderColor: C.ink, borderWidth: 1.5 } } },
        { type: 'scatter', coordinateSystem: 'geo', data: ring, symbolSize: (val, p) => size(p.data.i) + 7, z: 5,
          itemStyle: { color: 'rgba(0,0,0,0)', borderColor: C.flag.white_space, borderWidth: 2.2 } },
      ],
    });
    c.on('click', (p) => { if (p.data && p.data.i !== undefined) go('district', D.code[p.data.i]); });
  }
  function tipDistrict(res, i) {
    const f = flagsOf(res, i).map(flagLabel).join('<br>');
    return `<b>${esc(dname(i))}</b><br>${esc(t('score'))}: <b>${fDec(res.score[i], 1)}</b> (${esc(t('rank_of', { r: res.rank[i], n: N }))})<br>` +
      `${esc(t('households'))}: ${fInt(res.hh[i])}<br>${esc(t('stores'))}: ${fInt(res.stores[i])} (${fDec(res.per100k[i], 1)} ${esc(t('per100k_short'))})` +
      (f ? '<br>' + f : '');
  }

  function drawTrend(v) {
    const { idx, set: inSet } = v;
    const months = []; for (let m = M_FIRST; m <= M_LAST; m++) months.push(m);
    const sales = months.map(m => {
      const j = m - SALES_M0; if (j < 0 || j >= NS) return null;
      let s = 0; for (const i of idx) s += DATA.sales[i * NS + j]; return s;
    });
    const b = DATA.brands.indexOf(S.b), f = DATA.formats.indexOf(S.f);
    const ks = []; for (let k = 0; k < ST.id.length; k++) if (inSet.has(ST.district[k]) && (b < 0 || ST.brand[k] === b) && (f < 0 || ST.format[k] === f)) ks.push(k);
    const act = months.map(m => { let n = 0; for (const k of ks) if (M.isActive(DATA, k, m)) n++; return n; });
    const labels = months.map(fMonth), sel = M.monthInt(S.m) - M_FIRST;
    const ax = { type: 'category', data: labels, boundaryGap: true, axisTick: { show: false }, axisLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.muted, fontSize: 10, interval: (k) => k % (narrow() ? 12 : 6) === 0 } };
    const yax = (name) => ({ type: 'value', name, nameTextStyle: { color: C.ink2, fontSize: 11, align: 'left' }, splitNumber: 3, axisLabel: { color: C.muted, fontSize: 10, formatter: (x) => fInt(x) }, splitLine: { lineStyle: { color: C.grid } } });
    chart(document.getElementById('ch-trend'), {
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: C.muted } },
        formatter: (ps) => `<b>${esc(ps[0].axisValue)}</b>` + ps.map(p => `<br>${p.marker}${esc(p.seriesName)}: ${p.value == null ? '–' : fInt(p.value)}`).join('') }, ttStyle),
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [{ left: 52, right: 30, top: 26, height: '33%' }, { left: 52, right: 30, top: '60%', bottom: 26 }],
      xAxis: [Object.assign({ gridIndex: 0 }, ax, { axisLabel: { show: false } }), Object.assign({ gridIndex: 1 }, ax)],
      yAxis: [Object.assign({ gridIndex: 0 }, yax(t('trend_sales'))), Object.assign({ gridIndex: 1, scale: true }, yax(t('trend_stores')))],
      series: [
        { name: t('trend_sales'), type: 'bar', xAxisIndex: 0, yAxisIndex: 0, barCategoryGap: '18%',
          data: sales.map((s, k) => s === null ? null : { value: s, itemStyle: { color: Math.floor(months[k] / 12) === S.y ? C.accent : '#b7d3f6', borderRadius: [2, 2, 0, 0] } }) },
        { name: t('trend_stores'), type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: act, symbol: 'none', lineStyle: { width: 2, color: C.ink }, itemStyle: { color: C.ink },
          markLine: { silent: true, symbol: 'none', lineStyle: { color: C.flag.white_space, type: 'dashed' }, label: { formatter: fMonth(M.monthInt(S.m)), color: C.ink2, fontSize: 10, position: 'end' }, data: [{ xAxis: sel }] } },
      ],
    });
  }

  function drawBreakdown(v) {
    const { res, idx } = v;
    const byProv = !!S.r, groups = new Map();
    for (const i of idx) {
      const key = byProv ? D.il[i] : D.region[i];
      const g = groups.get(key) || { st: 0, hh: 0 }; g.st += res.stores[i]; g.hh += res.hh[i]; groups.set(key, g);
    }
    const rows = Array.from(groups, ([k, g]) => ({ k, name: byProv ? k : DATA.regions[k], v: g.st / g.hh * 1e5 })).sort((a, b) => a.v - b.v);
    const nat = res.national;
    const col = (x) => { const r = x / nat; return r < 0.75 ? C.div.lo2 : r < 0.95 ? C.div.lo1 : r <= 1.05 ? C.div.mid : r <= 1.25 ? C.div.hi1 : C.div.hi2; };
    const el = document.getElementById('ch-break');
    el.style.height = Math.max(220, rows.length * 24 + 60) + 'px';
    const c = chart(el, {
      tooltip: Object.assign({ trigger: 'item', formatter: (p) => `<b>${esc(p.name)}</b><br>${fDec(p.value, 2)} ${esc(t('per100k_short'))}<br>${esc(t('ratio_nat', { r: fDec(p.value / nat, 2) }))}` }, ttStyle),
      grid: { left: narrow() ? 112 : 150, right: 40, top: 22, bottom: 24 },
      xAxis: { type: 'value', axisLabel: { color: C.muted, fontSize: 10 }, splitLine: { lineStyle: { color: C.grid } } },
      yAxis: { type: 'category', data: rows.map(r => r.name), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 11, width: narrow() ? 104 : 142, overflow: 'truncate' } },
      series: [{ type: 'bar', barMaxWidth: 16, data: rows.map(r => ({ value: r.v, itemStyle: { color: col(r.v), borderRadius: [0, 3, 3, 0] } })),
        label: { show: true, position: 'right', fontSize: 10, color: C.ink2, formatter: (p) => fDec(p.value, 1) },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: C.ink, type: 'solid', width: 1.5 },
          label: { formatter: t('national_short', { n: fDec(nat, 2) }), position: 'end', color: C.ink, fontSize: 10 }, data: [{ xAxis: nat }] } }],
    });
    c.on('click', (p) => { const r = rows[p.dataIndex]; if (!r) return; byProv ? set({ p: r.k }) : set({ r: REGION_CODE[r.k] }); });
  }

  // ------------------------------------------------------------------ page 2: ranking & flags
  let lastView = null;
  function pageRanking(v) {
    const { res, idx } = v;
    const counts = Object.fromEntries(FLAGS.map(f => [f, idx.filter(i => res.flags[f][i]).length]));
    const chips = FLAGS.map(f => `<button type="button" class="chip flag-${f}${S.flag === f ? ' active' : ''}" data-act="flag" data-v="${f}" aria-pressed="${S.flag === f}" title="${esc(ruleText(f))}">
      <span>${flagLabel(f)}</span><b>${f === 'housing_boom' && S.y === CFG.years[0] ? '–' : fInt(counts[f])}</b></button>`).join('');
    const boomNote = S.y === CFG.years[0] ? `<p class="note">${esc(t('boom_2023'))}</p>` : '';
    const legend = ['white_space', 'under_served', 'housing_boom', 'over_served', 'none'].map(f => `<span class="lg"><i style="background:${C.flag[f]}"></i>${esc(t(f === 'none' ? 'no_flags' : 'flag_' + f))}</span>`).join('');
    document.getElementById('page').innerHTML = `
      <h1>${esc(t('nav_ranking'))}</h1>${howTo('howto_ranking')}
      <div class="chips" role="group" aria-label="${esc(t('flags'))}">${chips}</div>${boomNote}
      ${card(t('top20_title'), `<div class="chart" id="ch-top"></div><p class="legend">${legend}</p>`)}
      <section class="card" id="tbl"></section>`;
    const top = res.order.filter(i => v.set.has(i)).slice(0, 20);
    const el = document.getElementById('ch-top');
    el.style.height = Math.max(160, top.length * 24 + 40) + 'px';
    const c = chart(el, {
      tooltip: Object.assign({ trigger: 'item', formatter: (p) => tipDistrict(res, top[p.dataIndex]) }, ttStyle),
      grid: { left: narrow() ? 132 : 190, right: 40, top: 8, bottom: 24 },
      xAxis: { type: 'value', max: 100, axisLabel: { color: C.muted, fontSize: 10 }, splitLine: { lineStyle: { color: C.grid } } },
      yAxis: { type: 'category', inverse: true, data: top.map(i => `${res.rank[i]}. ${D.ilce[i]} (${D.il[i]})`), axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { color: C.ink2, fontSize: 11, width: narrow() ? 124 : 182, overflow: 'truncate' } },
      series: [{ type: 'bar', barMaxWidth: 16, data: top.map(i => ({ value: res.score[i], itemStyle: { color: C.flag[mainFlag(res, i)], borderRadius: [0, 3, 3, 0] } })),
        label: { show: true, position: 'right', fontSize: 10, color: C.ink2, formatter: (p) => fDec(p.value, 1) } }],
    });
    c.on('click', (p) => go('district', D.code[top[p.dataIndex]]));
    lastView = v;
    renderTable();
  }
  const COLS = [
    ['rank', 'c_rank', 'num'], ['district', 'c_district', ''], ['region', 'c_region', 'hide-s'], ['households', 'c_households', 'num'],
    ['tier', 'c_tier', 'num hide-s'], ['sales', 'c_sales', 'num'], ['yoy', 'c_yoy', 'num'], ['stores', 'c_stores', 'num'],
    ['per100k', 'c_per100k', 'num hide-s'], ['score', 'c_score', 'num'], ['flags', 'c_flags', ''],
  ];
  function tableRows(v) {
    const { res, idx } = v;
    const q = ui.q.trim().toLocaleLowerCase('tr');
    let rows = idx.filter(i => (!S.flag || res.flags[S.flag][i]) && (!q || dname(i).toLocaleLowerCase('tr').includes(q)));
    const key = {
      rank: i => res.rank[i], district: i => dname(i), region: i => DATA.regions[D.region[i]], households: i => res.hh[i], tier: i => D.sege_tier[i],
      sales: i => res.hs[i], yoy: i => (Number.isFinite(res.yoy[i]) ? res.yoy[i] : -Infinity), stores: i => res.stores[i], per100k: i => res.per100k[i], score: i => res.score[i],
    }[S.s];
    rows.sort((a, b) => { const x = key(a), y = key(b); const c = typeof x === 'string' ? x.localeCompare(y, 'tr') : x - y; return (c || res.rank[a] - res.rank[b]) * (c ? S.d : 1); });
    return rows;
  }
  function renderTable() {
    const v = lastView, { res } = v, el = document.getElementById('tbl'); if (!el) return;
    const rows = tableRows(v), per = 50, pages = Math.max(1, Math.ceil(rows.length / per));
    ui.pg = Math.min(ui.pg, pages);
    const slice = rows.slice((ui.pg - 1) * per, ui.pg * per);
    const head = COLS.map(([k, l, cls]) => k === 'flags' ? `<th class="${cls}">${esc(t(l))}</th>` :
      `<th class="${cls}" aria-sort="${S.s === k ? (S.d > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-act="sort" data-v="${k}">${esc(t(l, { y: S.y }))}${S.s === k ? (S.d > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
    const body = slice.map(i => `<tr data-code="${D.code[i]}" tabindex="0">
      <td class="num">${res.rank[i]}</td><td class="nw"><a href="${hashFor('district', D.code[i])}">${esc(D.ilce[i])}</a> <span class="muted">${esc(D.il[i])}</span></td>
      <td class="hide-s nw">${esc(DATA.regions[D.region[i]])}</td><td class="num">${fInt(res.hh[i])}</td><td class="num hide-s">${D.sege_tier[i]}</td>
      <td class="num">${fInt(res.hs[i])}</td><td class="num ${res.yoy[i] < 0 ? 'neg' : ''}">${fYoY(res.yoy[i])}</td><td class="num">${fInt(res.stores[i])}</td>
      <td class="num hide-s">${fDec(res.per100k[i], 1)}</td><td class="num"><b>${fDec(res.score[i], 1)}</b></td><td class="flags">${flagChips(res, i)}</td></tr>`).join('');
    const pager = pages > 1 ? `<div class="pager">${ui.pg > 1 ? `<button type="button" class="btn" data-act="page" data-v="${ui.pg - 1}">‹ ${esc(t('prev'))}</button>` : ''}
      <span>${esc(t('page_of', { p: ui.pg, n: pages }))}</span>${ui.pg < pages ? `<button type="button" class="btn" data-act="page" data-v="${ui.pg + 1}">${esc(t('next'))} ›</button>` : ''}</div>` : '';
    const focused = document.activeElement && document.activeElement.id === 'search';
    el.innerHTML = `<div class="card-head"><h2>${esc(t('table_title'))}</h2>
      <div class="tools"><input type="search" id="search" placeholder="${esc(t('search_ph'))}" value="${esc(ui.q)}" aria-label="${esc(t('search_ph'))}">
      <span class="muted">${esc(t('n_rows', { n: fInt(rows.length) }))}${S.flag ? ' · ' + esc(flagLabel(S.flag)) : ''}</span>
      <button type="button" class="btn" data-act="csv">⤓ ${esc(t('csv'))}</button></div></div>
      <div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="11" class="muted">${esc(t('no_rows'))}</td></tr>`}</tbody></table></div>${pager}`;
    const s = document.getElementById('search');
    s.addEventListener('input', () => { ui.q = s.value; ui.pg = 1; renderTable(); });
    if (focused) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }
  function exportCsv() {
    const v = lastView, { res } = v, rows = tableRows(v);
    const head = ['rank', 'tuik_code', 'il', 'ilce', 'region', `households_${S.y}`, 'sege_tier', 'sege_score', `housing_sales_${S.y}`, 'housing_yoy_pct', 'stores', 'stores_per_100k_hh', 'p_households', 'p_income', 'p_housing', 'score', 'flags'];
    const q = (x) => /[",\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : x;
    const lines = [head.join(',')].concat(rows.map(i => [res.rank[i], D.code[i], D.il[i], D.ilce[i], DATA.regions[D.region[i]], res.hh[i], D.sege_tier[i], D.sege_score[i],
      res.hs[i], Number.isFinite(res.yoy[i]) ? res.yoy[i] : '', res.stores[i], res.per100k[i], res.pH[i], res.pI[i], res.pS[i], res.score[i], flagsOf(res, i).join(' ')].map(q).join(',')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `whitespace_${S.y}_stores_${S.m}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ------------------------------------------------------------------ page 3: district
  function pageDistrict(v) {
    const { res } = v;
    if (!S.district) { S.district = D.code[res.order[0]]; writeHash(false); }
    const i = codeIdx.get(S.district);
    const fl = flagsOf(res, i);
    const opts = provinces.map(p => D.il.map((x, j) => x === p ? j : -1).filter(j => j >= 0).sort((a, b) => D.ilce[a].localeCompare(D.ilce[b], 'tr')))
      .flat().map(j => `<option value="${esc(dname(j))}"></option>`).join('');
    const hiddenNote = v.set.has(i) ? '' : `<p class="note">${esc(t('outside_filter'))}</p>`;
    const kp = [
      kpi(t('households'), fInt(res.hh[i]), esc(t('hh_sub', { p: fInt(D.population[S.y][i]), s: fDec(D.hh_size[S.y][i], 2) })), t('k_hh_f')),
      kpi(t('sege'), fDec(D.sege_score[i], 3), esc(t('sege_sub', { k: D.sege_tier[i], r: fInt(D.sege_rank[i]) })), t('k_sege_f')),
      kpi(t('k_sales', { y: S.y }), fInt(res.hs[i]), Number.isFinite(res.yoy[i]) ? `<span class="${res.yoy[i] < 0 ? 'neg' : 'pos'}">${esc(t('yoy_val', { v: fYoY(res.yoy[i]) }))}</span>` : esc(D.housing_missing[i] ? t('housing_missing') : t('no_yoy')), t('k_sales_f')),
      kpi(t('k_stores'), fInt(res.stores[i]), esc(t('per100k_val', { v: fDec(res.per100k[i], 1), n: fDec(res.national, 2) })), t('k_per100k_f')),
    ].join('');
    // stores active in M after brand / format filters
    const b = DATA.brands.indexOf(S.b), f = DATA.formats.indexOf(S.f), mi = M.monthInt(S.m);
    const ks = storesByDistrict[i].filter(k => M.isActive(DATA, k, mi) && (b < 0 || ST.brand[k] === b) && (f < 0 || ST.format[k] === f)).sort((x, y) => ST.open[x] - ST.open[y]);
    const storeTbl = ks.length ? `<div class="tablewrap tall"><table><thead><tr><th>${t('c_store')}</th><th>${t('f_brand')}</th><th>${t('f_format')}</th><th>${t('c_opened')}</th><th class="num">${t('c_size')}</th></tr></thead><tbody>` +
      ks.map(k => `<tr><td class="muted">${esc(ST.id[k])}</td><td>${esc(DATA.brands[ST.brand[k]])}</td><td>${esc(t('fmt_' + DATA.formats[ST.format[k]]))}</td><td>${esc(fMonth(ST.open[k]))}</td><td class="num">${fInt(ST.size[k])}</td></tr>`).join('') + '</tbody></table></div>'
      : `<p class="empty">${esc(t('no_stores', { m: fMonth(mi) }))}</p>`;
    const peers = D.il.map((x, j) => x === D.il[i] ? j : -1).filter(j => j >= 0).sort((a, b2) => res.rank[a] - res.rank[b2]);
    const peerTbl = `<div class="tablewrap tall"><table><thead><tr><th class="num">${t('c_rank')}</th><th>${t('c_district')}</th><th class="num">${t('c_score')}</th><th class="num">${t('c_stores')}</th><th>${t('c_flags')}</th></tr></thead><tbody>` +
      peers.map(j => `<tr data-code="${D.code[j]}" tabindex="0" class="${j === i ? 'current' : ''}"><td class="num">${res.rank[j]}</td><td><a href="${hashFor('district', D.code[j])}">${esc(D.ilce[j])}</a></td><td class="num">${fDec(res.score[j], 1)}</td><td class="num">${fInt(res.stores[j])}</td><td class="flags">${flagChips(res, j)}</td></tr>`).join('') + '</tbody></table></div>';
    document.getElementById('page').innerHTML = `
      <h1 class="sr">${esc(t('nav_district'))}</h1>${howTo('howto_district')}
      <div class="picker"><label for="pick">${esc(t('pick'))}</label><input id="pick" list="pick-list" placeholder="${esc(t('pick_ph'))}" autocomplete="off"><datalist id="pick-list">${opts}</datalist></div>
      <header class="dhead"><div><h2 class="dname">${esc(D.ilce[i])}</h2><div class="dsub">${esc(D.il[i])} · ${esc(DATA.regions[D.region[i]])} · <b>${esc(t('rank_of', { r: res.rank[i], n: N }))}</b> · ${esc(t('score'))} <b>${fDec(res.score[i], 1)}</b></div></div>
        <ul class="dflags">${fl.length ? fl.map(x => `<li><span class="flag flag-${x}">${flagLabel(x)}</span> <span class="muted">${esc(ruleText(x))}</span></li>`).join('') : `<li class="muted">${esc(t('no_flags_long'))}</li>`}</ul></header>
      ${hiddenNote}
      <div class="kpis k4">${kp}</div>
      <div class="two">
        ${card(t('score_title'), `<div class="chart" id="ch-score" style="height:210px"></div><p class="legend-note">${esc(t('score_note', { w1: S.w[0], w2: S.w[1], w3: S.w[2] }))}</p>`)}
        ${card(t('dsales_title'), `<div class="chart" id="ch-dsales" style="height:250px"></div>`)}
      </div>
      <div class="two">
        ${card(t('stores_title', { n: ks.length }), storeTbl)}
        ${card(t('peers_title', { p: D.il[i] }), peerTbl)}
      </div>`;
    const pick = document.getElementById('pick');
    pick.addEventListener('change', () => { const j = D.il.findIndex((_, k) => dname(k) === pick.value); if (j >= 0) go('district', D.code[j]); });
    // score bars
    const comps = [[t('comp_households'), res.pH[i], S.w[0]], [t('comp_income'), res.pI[i], S.w[1]], [t('comp_housing'), res.pS[i], S.w[2]]];
    chart(document.getElementById('ch-score'), {
      tooltip: Object.assign({ trigger: 'item' }, ttStyle),
      grid: { left: narrow() ? 96 : 130, right: 70, top: 6, bottom: 22 },
      xAxis: { type: 'value', max: 100, axisLabel: { color: C.muted, fontSize: 10 }, splitLine: { lineStyle: { color: C.grid } } },
      yAxis: { type: 'category', inverse: true, data: comps.map(c => c[0]).concat(t('comp_total')), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 11 } },
      series: [{ type: 'bar', barMaxWidth: 18,
        data: comps.map(c => ({ value: c[1], itemStyle: { color: '#86b6ef', borderRadius: [0, 3, 3, 0] }, tip: `${fDec(c[1], 1)} × ${c[2]}% = ${fDec(c[1] * c[2] / 100, 1)}` }))
          .concat({ value: res.score[i], itemStyle: { color: C.seq[5], borderRadius: [0, 3, 3, 0] }, tip: t('score') }),
        label: { show: true, position: 'right', fontSize: 11, color: C.ink, formatter: (p) => p.dataIndex < 3 ? `${fDec(p.value, 1)} ×${comps[p.dataIndex][2]}%` : fDec(p.value, 1) },
        tooltip: { formatter: (p) => `<b>${esc(p.name)}</b><br>${esc(p.data.tip)}` } }],
    });
    // monthly sales vs province average district
    const pv = peers;
    const own = [], avg = [];
    for (let j = 0; j < NS; j++) { own.push(DATA.sales[i * NS + j]); let s = 0; for (const k of pv) s += DATA.sales[k * NS + j]; avg.push(Math.round(s / pv.length * 10) / 10); }
    const lbl = DATA.sales_months.map(m => fMonth(M.monthInt(m)));
    chart(document.getElementById('ch-dsales'), {
      tooltip: Object.assign({ trigger: 'axis', formatter: (ps) => `<b>${esc(ps[0].axisValue)}</b>` + ps.map(p => `<br>${p.marker}${esc(p.seriesName)}: ${fDec(p.value, p.seriesIndex ? 1 : 0)}`).join('') }, ttStyle),
      legend: { top: 0, left: 0, itemWidth: 18, itemHeight: 8, textStyle: { color: C.ink2, fontSize: 11 }, data: [D.ilce[i], t('prov_avg', { p: D.il[i] })] },
      grid: { left: 44, right: 12, top: 34, bottom: 26 },
      xAxis: { type: 'category', data: lbl, axisTick: { show: false }, axisLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.muted, fontSize: 10, interval: 5 } },
      yAxis: { type: 'value', splitNumber: 3, axisLabel: { color: C.muted, fontSize: 10, formatter: (x) => fInt(x) }, splitLine: { lineStyle: { color: C.grid } } },
      series: [
        { name: D.ilce[i], type: 'line', data: own, symbol: 'none', lineStyle: { width: 2, color: C.accent }, itemStyle: { color: C.accent } },
        { name: t('prov_avg', { p: D.il[i] }), type: 'line', data: avg, symbol: 'none', lineStyle: { width: 2, type: 'dashed', color: C.muted }, itemStyle: { color: C.muted } },
      ],
    });
  }

  // ------------------------------------------------------------------ page 4: method & data
  function pageMethod(v) {
    const { res } = v;
    const top = res.order[0];
    const F = CFG.flags;
    const sliders = [['households', 0], ['income', 1], ['housing', 2]].map(([k, j]) => `<label class="wrow"><span>${esc(t('comp_' + k))}</span>
      <input type="range" min="0" max="100" step="5" value="${S.w[j]}" data-w="${j}" aria-label="${esc(t('comp_' + k))}"><b id="wv${j}">${S.w[j]}%</b></label>`).join('');
    const isDef = S.w.join() === DEF.w.join();
    const tr = (cells) => '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
    const counts = FLAGS.map(f => res.flags[f].filter(Boolean).length);
    document.getElementById('page').innerHTML = `
      <h1>${esc(t('nav_method'))}</h1>${howTo('howto_method')}
      <div class="dummy">⚠ <b>${esc(t('dummy_title'))}</b> ${esc(t('dummy_text'))}</div>
      <div class="two">
        ${card(t('weights_title'), `<p>${esc(t('weights_text'))}</p><div class="weights">${sliders}</div>
          <p class="wsum">${esc(t('weights_sum'))}: <b>100%</b> · ${esc(t('rank1_now', { d: dname(top), s: fDec(res.score[top], 1) }))}</p>
          <button type="button" class="btn" data-act="wreset" ${isDef ? 'disabled' : ''}>${esc(t('weights_reset', { w: DEF.w.join(' / ') }))}</button>`)}
        ${card(t('score_formula_title'), `<p class="formula">${esc(t('score_formula', { a: S.w[0], b: S.w[1], c: S.w[2] }))}</p><p>${esc(t('score_pct'))}</p><p class="muted">${esc(t('score_example'))}</p><p>${esc(t('score_filters'))}</p>`)}
      </div>
      ${card(t('flags_title'), `<div class="tablewrap"><table><thead><tr><th>${t('c_flags')}</th><th>${t('rule')}</th><th class="num">${t('count_now')}</th></tr></thead><tbody>
        ${FLAGS.map((f, k) => tr([`<span class="flag flag-${f}">${flagLabel(f)}</span>`, esc(ruleText(f)), `<span class="num">${f === 'housing_boom' && S.y === CFG.years[0] ? '–' : fInt(counts[k])}</span>`])).join('')}
        </tbody></table></div><p class="muted">${esc(t('flags_note', { n: fDec(res.national, 2), y: S.y, m: fMonth(M.monthInt(S.m)) }))}</p>`)}
      ${card(t('metrics_title'), `<div class="tablewrap"><table><thead><tr><th>${t('metric')}</th><th>${t('formula')}</th></tr></thead><tbody>
        ${['m_stores', 'm_per100k', 'm_housing', 'm_yoy', 'm_national', 'm_coverage'].map(k => tr([esc(t(k)), `<code>${esc(t(k + '_f'))}</code>`])).join('')}</tbody></table></div>`)}
      ${card(t('sources_title'), `<div class="tablewrap"><table><thead><tr><th>${t('data')}</th><th>${t('source')}</th><th>${t('period')}</th></tr></thead><tbody>
        ${['src_pop', 'src_sales', 'src_sege', 'src_points', 'src_geo', 'src_stores'].map(k => tr([esc(t(k)), esc(t(k + '_s')), esc(t(k + '_p'))])).join('')}</tbody></table></div>`)}
      ${card(t('assumptions_title'), `<ol class="assume">${[1, 2, 3, 4, 5, 6].map(k => `<li>${esc(t('as' + k))}</li>`).join('')}</ol>`)}`;
    document.querySelectorAll('[data-w]').forEach(inp => inp.addEventListener('input', () => {
      const j = +inp.dataset.w, val = +inp.value, others = [0, 1, 2].filter(x => x !== j);
      const rest = 100 - val, os = S.w[others[0]] + S.w[others[1]];
      const w = S.w.slice(); w[j] = val;
      const a = os === 0 ? Math.round(rest / 2 / 5) * 5 : Math.round(rest * S.w[others[0]] / os / 5) * 5;
      w[others[0]] = a; w[others[1]] = rest - a;
      S.w = w; writeHash(false);
      if (rafPending) cancelAnimationFrame(rafPending);
      rafPending = requestAnimationFrame(() => { rafPending = null; const y = window.scrollY; renderPage(); window.scrollTo(0, y); const n = document.querySelector(`[data-w="${j}"]`); if (n) n.focus(); });
    }));
  }

  // ------------------------------------------------------------------ render
  function renderPage() {
    disposeCharts();
    const v = view();
    lastView = v;
    ({ overview: pageOverview, ranking: pageRanking, district: pageDistrict, method: pageMethod })[S.page](v);
  }
  function render() { view(); renderShell(); renderPage(); }
  render();
  window.__ws = { state: () => S, view, DATA }; // for tests
})();
