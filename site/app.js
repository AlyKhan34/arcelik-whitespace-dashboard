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
    flag: { white_space: '#d03b3b', under_served: '#ec835a', housing_boom: '#fab219', over_served: '#a3a29c', none: '#9ec5f4' },
    div: { lo2: '#c7393a', lo1: '#ef9f9c', mid: '#bdbcb6', hi1: '#86b6ef', hi2: '#256abf' },
    // one hue per measure, used the same way on every page: map colour modes, score bars, weight sliders.
    // Sequential ramps, light -> dark; red stays reserved for the white-space flag.
    ramp: {
      score: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
      households: ['#e4e0fb', '#c7befa', '#a597f0', '#8574e6', '#6250d6', '#4a3aa7', '#2f2470'],
      income: ['#d6f0d6', '#a8dca8', '#6fc26f', '#3ea33e', '#1e861e', '#0f6a0f', '#064a06'],
      housing: ['#fde3d6', '#f9bfa3', '#f39a6f', '#eb6834', '#c9521f', '#9f3f15', '#6e2a0b'],
      per100k: ['#fbe0ea', '#f5b8cd', '#ec8bac', '#e05c8c', '#c63d70', '#9c2a55', '#6b1a3a'],
    },
    mid: { score: '#3987e5', households: '#8574e6', income: '#3ea33e', housing: '#eb6834', per100k: '#e05c8c' },
    dark: { score: '#256abf', households: '#4a3aa7', income: '#0f6a0f', housing: '#9f3f15', per100k: '#9c2a55' },
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
    w: [CFG.weights.households, CFG.weights.income, CFG.weights.housing], flags: [], fm: 'all', sf: '', s: 'rank', d: 1, color: 'score' };
  const COLOR_MODES = ['score', 'households', 'income', 'housing', 'per100k'];
  const SORTS = ['rank', 'district', 'region', 'households', 'tier', 'sales', 'yoy', 'stores', 'per100k', 'score'];
  let S = parseHash();
  let ui = { q: '', pg: 1, fopen: false };
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
    if (DATA.formats.includes(q.get('f'))) st.f = q.get('f');
    if (CFG.years.includes(+q.get('y'))) st.y = +q.get('y');
    const mm = q.get('m');
    if (mm && /^\d{4}-\d{2}$/.test(mm) && M.monthInt(mm) >= M_FIRST && M.monthInt(mm) <= M_LAST) st.m = mm;
    const w = (q.get('w') || '').split('-').map(Number);
    if (w.length === 3 && w.every(x => Number.isInteger(x) && x >= 0) && w[0] + w[1] + w[2] === 100) st.w = w;
    st.flags = FLAGS.filter(f => (q.get('flag') || '').split(',').includes(f));
    if (q.get('fm') === 'any') st.fm = 'any';
    if (['0', '1'].includes(q.get('sf'))) st.sf = q.get('sf');
    if (SORTS.includes(q.get('s'))) st.s = q.get('s');
    if (q.get('d') === '-1') st.d = -1;
    if (COLOR_MODES.includes(q.get('c'))) st.color = q.get('c');
    if (st.p && st.r && REGION_CODE[provRegion.get(st.p)] !== st.r) st.p = '';
    return st;
  }
  function query(st) {
    const q = [];
    const add = (k, v, def) => { if (v !== def && v !== '' && v !== null) q.push(k + '=' + encodeURIComponent(v)); };
    add('r', st.r, ''); add('p', st.p, ''); add('t', st.t, ''); add('f', st.f, '');
    add('y', st.y, DEF.y); add('m', st.m, DEF.m); add('w', st.w.join('-'), DEF.w.join('-'));
    add('flag', st.flags.join(','), ''); add('fm', st.fm, 'all'); add('sf', st.sf, ''); add('s', st.s, DEF.s); add('d', st.d, 1); add('c', st.color, DEF.color);
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
    const res = M.compute(DATA, { year: S.y, month: S.m, format: DATA.formats.indexOf(S.f),
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

  // ------------------------------------------------------------------ active filters, empty states, notices
  function activeFilters(st = S) {
    const out = [];
    if (st.r) out.push({ k: 'r', label: t('f_region'), value: DATA.regions[REGION_CODE.indexOf(st.r)] });
    if (st.p) out.push({ k: 'p', label: t('f_province'), value: st.p });
    if (st.t) out.push({ k: 't', label: t('f_tier'), value: t('tier_n', { n: st.t }) });
    if (st.f) out.push({ k: 'f', label: t('f_format'), value: t('fmt_' + st.f) });
    if (st.y !== DEF.y) out.push({ k: 'y', label: t('f_year'), value: String(st.y) });
    if (st.m !== DEF.m) out.push({ k: 'm', label: t('f_month'), value: fMonth(M.monthInt(st.m)) });
    return out;
  }
  const unsetPatch = (k) => ({ [k]: k === 'y' ? DEF.y : k === 'm' ? DEF.m : '' });
  function countDistricts(st) {
    const rIdx = st.r ? REGION_CODE.indexOf(st.r) : -1;
    let n = 0;
    for (let i = 0; i < N; i++) if ((rIdx < 0 || D.region[i] === rIdx) && (!st.p || D.il[i] === st.p) && (!st.t || D.sege_tier[i] === +st.t)) n++;
    return n;
  }
  function countStores(idx, st) {
    const a = M.activeStores(DATA, M.monthInt(st.m), DATA.formats.indexOf(st.f));
    let n = 0; for (const i of idx) n += a[i]; return n;
  }
  function areaLabel() {
    const base = S.p || (S.r ? DATA.regions[REGION_CODE.indexOf(S.r)] : t('turkiye'));
    return S.t ? base + ' · ' + t('tier_n', { n: S.t }) : base;
  }
  function contextBar(v) {
    const chips = activeFilters().map(a => `<button type="button" class="fchip" data-act="unset" data-k="${a.k}" title="${esc(t('remove_filter'))}">
      <span class="muted">${esc(a.label)}:</span> ${esc(a.value)} <span aria-hidden="true">✕</span><span class="sr">${esc(t('remove_filter'))}</span></button>`).join('');
    const scope = v.idx.length === N ? t('ctx_all', { n: fInt(N) }) : t('ctx_some', { n: fInt(v.idx.length), N: fInt(N) });
    return `<div class="context" role="status"><span class="ctx-scope">${scope}</span>${chips}${chips ? `<button type="button" class="fchip clear" data-act="reset">${esc(t('reset'))}</button>` : `<span class="muted">${esc(t('ctx_hint'))}</span>`}</div>`;
  }
  function emptyState() {
    const act = activeFilters().filter(a => ['r', 'p', 't'].includes(a.k));
    const sugg = act.map(a => {
      const n = countDistricts(Object.assign({}, S, unsetPatch(a.k)));
      return n ? `<button type="button" class="btn primary" data-act="unset" data-k="${a.k}">${esc(t('sugg_remove', { f: a.label, v: a.value }))} → ${esc(t('n_rows', { n: fInt(n) }))}</button>` : '';
    }).join('');
    return `<div class="empty-state"><div class="es-icon" aria-hidden="true">⌕</div><h2>${esc(t('empty_title'))}</h2>
      <p>${esc(t('empty_text', { f: act.map(a => a.value).join(' + ') }))}</p>
      <div class="es-actions">${sugg}<button type="button" class="btn" data-act="reset">${esc(t('reset'))}</button></div></div>`;
  }
  function storeNotice(v) {
    let st = 0; for (const i of v.idx) st += v.res.stores[i];
    if (st > 0) return '';
    const what = S.f ? t('fmt_' + S.f) : t('any_store');
    const opts = [];
    if (S.f) opts.push(['f', t('sugg_all_formats')]);
    if (S.m !== DEF.m) opts.push(['m', t('sugg_latest', { m: fMonth(M_LAST) })]);
    const btns = opts.map(([k, label]) => {
      const n = countStores(v.idx, Object.assign({}, S, unsetPatch(k)));
      return n ? `<button type="button" class="btn" data-act="unset" data-k="${k}">${esc(label)} → ${esc(t('n_stores', { n: fInt(n) }))}</button>` : '';
    }).join('');
    return `<div class="notice" role="status"><b>${esc(t('nostore_title'))}</b> ${esc(t('nostore_text', { w: what, a: areaLabel(), m: fMonth(M.monthInt(S.m)) }))}
      ${btns ? `<div class="es-actions">${btns}</div>` : ''}</div>`;
  }

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
    const changed = S.r || S.p || S.t || S.f || S.y !== DEF.y || S.m !== DEF.m;
    const nActive = activeFilters().length;
    el.classList.toggle('open', ui.fopen);
    el.innerHTML = `
      <button type="button" class="ftoggle" data-act="ftoggle" aria-expanded="${ui.fopen}">☰ ${esc(t('filters_btn'))}${nActive ? ` <b class="badge">${nActive}</b>` : ''}<span aria-hidden="true">${ui.fopen ? '▴' : '▾'}</span></button>
      <label class="f"><span>${t('f_region')}</span><select data-f="r">${opt('', t('all'), S.r)}${DATA.regions.map((r, i) => opt(REGION_CODE[i], r, S.r)).join('')}</select></label>
      <label class="f"><span>${t('f_province')}</span><select data-f="p">${opt('', t('all'), S.p)}${provs.map(p => opt(p, p, S.p)).join('')}</select></label>
      <label class="f"><span>${t('f_tier')}</span><select data-f="t">${opt('', t('all'), S.t)}${[1, 2, 3, 4, 5, 6].map(k => opt(String(k), t('tier_n', { n: k }), S.t)).join('')}</select></label>
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
    if (b) b.disabled = !(S.r || S.p || S.t || S.f || S.y !== DEF.y || S.m !== DEF.m);
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
      if (act === 'reset') set({ r: '', p: '', t: '', b: '', f: '', y: DEF.y, m: DEF.m, flags: [], sf: '', fm: 'all' });
      else if (act === 'unset') set(unsetPatch(a.dataset.k));
      else if (act === 'ftoggle') { ui.fopen = !ui.fopen; renderFilters(); }
      else if (act === 'clearq') { ui.q = ''; ui.pg = 1; renderTable(); }
      else if (act === 'color') set({ color: a.dataset.v });
      else if (act === 'flag') { const f = a.dataset.v; set({ flags: S.flags.includes(f) ? S.flags.filter(x => x !== f) : FLAGS.filter(x => x === f || S.flags.includes(x)) }); }
      else if (act === 'fm') set({ fm: a.dataset.v });
      else if (act === 'sf') set({ sf: a.dataset.v });
      else if (act === 'clearflags') set({ flags: [], sf: '', fm: 'all' });
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
  function kpi(label, value, sub, formula, cls = '') {
    return `<div class="kpi ${cls}"><div class="kpi-label">${esc(label)}<button type="button" class="info" aria-label="${esc(t('formula'))}">i</button>
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
  function pageHead(key, v) {
    return `<h1>${esc(t('nav_' + key))}</h1>${contextBar(v)}${howTo('howto_' + key)}`;
  }
  function opportunities(v) {
    const { res } = v;
    const inView = res.order.filter(i => v.set.has(i));
    let kind = 'white_space', list = inView.filter(i => res.flags.white_space[i]);
    if (!list.length) { kind = 'under_served'; list = inView.filter(i => res.flags.under_served[i]); }
    if (!list.length) { kind = 'top'; list = inView; }
    const total = list.length;
    const items = list.slice(0, 6).map(i => {
      const yo = Number.isFinite(res.yoy[i]) ? `<br><span class="nw">${esc(t('housing_short'))} <span class="${res.yoy[i] < 0 ? 'neg' : 'pos'}">${fYoY(res.yoy[i])}</span></span>` : '';
      return `<li><a class="opp" href="${hashFor('district', D.code[i])}">
        <span class="opp-top"><span class="opp-rank">#${res.rank[i]}</span><span class="opp-score" title="${esc(t('score'))}">${fDec(res.score[i], 1)}</span></span>
        <span class="opp-name">${esc(D.ilce[i])}</span><span class="opp-prov">${esc(D.il[i])}</span>
        <span class="opp-sub">${fInt(res.hh[i])} ${esc(t('hh_short'))} · ${esc(res.stores[i] ? t('n_stores', { n: fInt(res.stores[i]) }) : t('no_store_short'))}${yo}</span></a></li>`;
    }).join('');
    const intro = kind === 'white_space' ? t('opp_ws', { n: fInt(total) }) : kind === 'under_served' ? t('opp_us', { n: fInt(total) }) : t('opp_top');
    const more = kind === 'top' ? hashFor('ranking', null) : hashFor('ranking', null, Object.assign({}, S, { flags: [kind], sf: '' }));
    return `<section class="card opps ${kind}"><div class="card-head"><h2>${esc(t('opp_title'))}</h2>
      <a class="more" href="${more}">${esc(t(kind === 'top' ? 'opp_more_all' : 'opp_more', { n: fInt(total) }))} →</a></div>
      <p class="opp-intro">${kind === 'top' ? '' : FLAG_EMOJI[kind] + ' '}${esc(intro)}</p><ol class="opp-list">${items}</ol></section>`;
  }
  function pageOverview(v) {
    const { res, idx } = v;
    if (!idx.length) { document.getElementById('page').innerHTML = pageHead('overview', v) + emptyState(); return; }
    let st = 0, hh = 0, hhCov = 0, none = 0, ws = 0, sales = 0, prev = 0;
    for (const i of idx) {
      st += res.stores[i]; hh += res.hh[i]; if (res.stores[i] > 0) hhCov += res.hh[i]; else none++;
      if (res.flags.white_space[i]) ws++; sales += res.hs[i]; if (res.prev) prev += res.prev[i];
    }
    const per = st / hh * 1e5, yoy = res.prev && prev ? (sales / prev - 1) * 100 : NaN;
    const ratio = per / res.national;
    const yoyTxt = Number.isFinite(yoy) ? `<span class="${yoy < 0 ? 'neg' : 'pos'}">${esc(t('yoy_val', { v: fYoY(yoy) }))}</span>` : esc(t(res.prev ? 'no_sales_prev' : 'no_yoy'));
    const wsLink = ws ? ` · <a href="${hashFor('ranking', null, Object.assign({}, S, { flags: ['white_space'], sf: '' }))}">${esc(t('view_list'))} →</a>` : '';
    const kpis = [
      kpi(t('k_stores'), fInt(st), esc(t('k_stores_sub', { m: fMonth(M.monthInt(S.m)) })), t('k_stores_f')),
      kpi(t('k_per100k'), fDec(per, 1), `<span class="${ratio < 1 ? 'neg' : 'pos'}">${esc(t('vs_national', { n: fDec(res.national, 2) }))}</span>`, t('k_per100k_f')),
      kpi(t('k_coverage'), fPct(hhCov / hh), esc(t('k_coverage_sub', { n: fInt(hhCov) })), t('k_coverage_f')),
      kpi(t('k_nostore'), fInt(none), esc(t('of_n', { n: fInt(idx.length) })), t('k_nostore_f')),
      kpi(t('k_ws'), `${FLAG_EMOJI.white_space} ${fInt(ws)}`, esc(t('k_ws_sub', { s: CFG.flags.white_space.min_score })) + wsLink, ruleText('white_space'), ws ? 'alert' : ''),
      kpi(t('k_sales', { y: S.y }), fInt(sales), yoyTxt, t('k_sales_f')),
    ].join('');
    const seg = COLOR_MODES.map(c => `<button type="button" data-act="color" data-v="${c}" class="${S.color === c ? 'active' : ''}" aria-pressed="${S.color === c}" style="--c:${C.dark[c]};--g:linear-gradient(90deg,${C.ramp[c][1]},${C.ramp[c][5]})"><i class="sw" aria-hidden="true"></i>${esc(t('c_' + c))}</button>`).join('');
    document.getElementById('page').innerHTML = `
      ${pageHead('overview', v)}${storeNotice(v)}
      <div class="kpis">${kpis}</div>
      ${opportunities(v)}
      ${card(t('map_title'), `<div class="chart map" id="ch-map"></div><p class="legend-note">${esc(t('map_legend', { c: t('c_' + S.color) }))} <span class="ring" aria-hidden="true"></span> ${esc(t('map_ring'))}</p>`,
        `<div class="seg colors" role="group" aria-label="${esc(t('color_by'))}"><span class="seg-label">${esc(t('color_by'))}</span>${seg}</div>`)}
      <div class="two">
        ${card(t('trend_title'), `<div class="chart trend" id="ch-trend"></div>`)}
        ${card(S.r || S.p ? t('break_title_prov') : t('break_title'), `<p class="insight" id="break-insight"></p><div class="chart" id="ch-break"></div><p class="legend-note">${esc(t('break_note'))}</p>`)}
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
  const GEO_ASPECT = (() => {      // width / height of Türkiye as drawn (lon/lat box × aspectScale 0.78)
    let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
    const walk = (a) => { if (typeof a[0] === 'number') { x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]); } else a.forEach(walk); };
    DATA.geo.features.forEach(f => walk(f.geometry.coordinates));
    return (x1 - x0) / (y1 - y0) * 0.78;
  })();
  let lastW = window.innerWidth, resizeT = null;
  window.addEventListener('resize', () => {     // the map box depends on the width: redraw it after a width change
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth; clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (S.page === 'overview') renderPage(); }, 200);
  });
  function drawMap(v) {
    const { res, idx } = v;
    if (!echarts.getMap('tr')) echarts.registerMap('tr', DATA.geo);
    const maxHH = Math.sqrt(Math.max(...res.hh));
    let k = narrow() ? 0.5 : 1;
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
      zoom = Math.max(1, Math.min(4.5, Math.min(19.5 / Math.max(x1 - x0, 1.2), 6.5 / Math.max(y1 - y0, 0.8)) * 0.75));
      k *= Math.min(2.2, Math.max(1, Math.sqrt(zoom)));   // bigger bubbles when zoomed in
    }
    // highlight the selected province / region, label it, dim the rest
    const rIdx = S.r ? REGION_CODE.indexOf(S.r) : -1;
    const hl = provinces.filter(p => (S.p ? p === S.p : rIdx >= 0 && provRegion.get(p) === rIdx));
    const regions = hl.map(name => ({ name, itemStyle: { areaColor: '#e6eefa', borderColor: C.accent, borderWidth: 1.4 },
      label: { show: true, color: C.ink2, fontSize: 11, fontWeight: 600 } }));
    // size the box from the map's own aspect ratio, so the map is never stretched or squashed
    const el = document.getElementById('ch-map'), LEG = 38, w = el.clientWidth;
    const h = Math.round(Math.min(620, Math.max(200, (w - 12) / GEO_ASPECT + LEG + 6)));
    el.style.height = h + 'px';
    const mapW = Math.min(w - 12, (h - LEG - 6) * GEO_ASPECT);
    const c = chart(el, {
      tooltip: Object.assign({ trigger: 'item', formatter: (p) => p.componentType === 'geo' ? `<b>${esc(p.name)}</b><br>${esc(t(S.p === p.name ? 'map_unprov' : 'map_prov'))}` : tipDistrict(res, p.data.i) }, ttStyle),
      geo: { map: 'tr', roam: true, center, zoom, scaleLimit: { min: 1, max: 14 }, aspectScale: 0.78, selectedMode: false,
        layoutCenter: [w / 2, (h - LEG) / 2 + 2], layoutSize: mapW, regions, tooltip: { show: true },
        itemStyle: { areaColor: hl.length ? '#f6f6f4' : C.geo, borderColor: C.geoLine, borderWidth: 0.7 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: '#dfe9f7' } } },
      visualMap: { type: 'continuous', seriesIndex: 0, dimension: 2, min: 0, max: mx, calculable: false, orient: 'horizontal',
        left: 'center', bottom: 0, itemWidth: 10, itemHeight: narrow() ? 140 : 200, inRange: { color: C.ramp[S.color].slice(1) },
        text: [(per ? '≥ ' + fInt(mx) : '100') + '  ·  ' + t('c_' + S.color), '0'], textStyle: { color: C.ink2, fontSize: 11 } },
      series: [
        { type: 'scatter', coordinateSystem: 'geo', data: pts, symbolSize: (val, p) => size(p.data.i),
          itemStyle: { borderColor: '#fff', borderWidth: 0.6, opacity: 0.92 }, emphasis: { itemStyle: { borderColor: C.ink, borderWidth: 1.5 } } },
        // white halo under the red ring keeps it visible on every colour ramp
        { type: 'scatter', coordinateSystem: 'geo', data: ring, symbolSize: (val, p) => size(p.data.i) + 7, z: 4, silent: true,
          itemStyle: { color: 'rgba(0,0,0,0)', borderColor: '#fff', borderWidth: 5 } },
        { type: 'scatter', coordinateSystem: 'geo', data: ring, symbolSize: (val, p) => size(p.data.i) + 7, z: 5,
          itemStyle: { color: 'rgba(0,0,0,0)', borderColor: C.flag.white_space, borderWidth: 2.2 } },
      ],
    });
    c.on('click', (p) => {
      if (p.componentType === 'geo') { set(S.p === p.name ? { p: '' } : { p: p.name, r: REGION_CODE[provRegion.get(p.name)] }); return; }
      if (p.data && p.data.i !== undefined) go('district', D.code[p.data.i]);
    });
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
    const f = DATA.formats.indexOf(S.f);
    const ks = []; for (let k = 0; k < ST.id.length; k++) if (inSet.has(ST.district[k]) && (f < 0 || ST.format[k] === f)) ks.push(k);
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
      yAxis: [Object.assign({ gridIndex: 0 }, yax(t('trend_sales'))), Object.assign({ gridIndex: 1, scale: true, minInterval: 1 }, yax(t('trend_stores')))],
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
    const byProv = !!(S.r || S.p), groups = new Map();
    for (const i of idx) {
      const key = byProv ? D.il[i] : D.region[i];
      const g = groups.get(key) || { st: 0, hh: 0 }; g.st += res.stores[i]; g.hh += res.hh[i]; groups.set(key, g);
    }
    const rows = Array.from(groups, ([k, g]) => ({ k, name: byProv ? k : DATA.regions[k], v: g.st / g.hh * 1e5 })).sort((a, b) => a.v - b.v);
    const nat = res.national;
    const ins = document.getElementById('break-insight');
    if (ins && rows.length > 1) {
      const lo = rows[0], hi = rows[rows.length - 1];
      ins.innerHTML = t('break_insight', { lo: `<b>${esc(lo.name)}</b>`, lv: fDec(lo.v, 1), lp: fYoY((lo.v / nat - 1) * 100), hi: `<b>${esc(hi.name)}</b>`, hv: fDec(hi.v, 1) });
    } else if (ins) ins.remove();
    const col = (x) => { const r = x / nat; return r < 0.75 ? C.div.lo2 : r < 0.95 ? C.div.lo1 : r <= 1.05 ? C.div.mid : r <= 1.25 ? C.div.hi1 : C.div.hi2; };
    const el = document.getElementById('ch-break');
    el.style.height = Math.max(220, rows.length * 24 + 60) + 'px';
    const c = chart(el, {
      tooltip: Object.assign({ trigger: 'item', formatter: (p) => `<b>${esc(p.name)}</b><br>${fDec(p.value, 2)} ${esc(t('per100k_short'))}<br>${esc(t('ratio_nat', { r: fDec(p.value / nat, 2) }))}` }, ttStyle),
      grid: { left: narrow() ? 112 : 150, right: 40, top: 22, bottom: 24 },
      xAxis: { type: 'value', max: (e) => Math.ceil(Math.max(e.max, nat * 1.2)), axisLabel: { color: C.muted, fontSize: 10 }, splitLine: { lineStyle: { color: C.grid } } },
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
    lastView = v;
    if (!idx.length) { document.getElementById('page').innerHTML = pageHead('ranking', v) + emptyState(); return; }
    const counts = Object.fromEntries(FLAGS.map(f => [f, idx.filter(i => res.flags[f][i]).length]));
    const chips = FLAGS.map(f => `<button type="button" class="chip flag-${f}${S.flags.includes(f) ? ' active' : ''}" data-act="flag" data-v="${f}" aria-pressed="${S.flags.includes(f)}" title="${esc(ruleText(f))}">
      <span><span class="tick" aria-hidden="true">${S.flags.includes(f) ? '✓' : ''}</span>${flagLabel(f)}</span><b>${f === 'housing_boom' && S.y === CFG.years[0] ? '–' : fInt(counts[f])}</b></button>`).join('');
    const boomNote = S.y === CFG.years[0] ? `<p class="note">${esc(t('boom_2023'))}</p>` : '';
    const legend = ['white_space', 'under_served', 'housing_boom', 'over_served', 'none'].map(f => `<span class="lg"><i style="background:${C.flag[f]}"></i>${esc(t(f === 'none' ? 'no_flags' : 'flag_' + f))}</span>`).join('');
    document.getElementById('page').innerHTML = `
      ${pageHead('ranking', v)}${storeNotice(v)}
      <div class="chips" role="group" aria-label="${esc(t('flags'))}">${chips}</div>${rankFilterBar(v)}${boomNote}
      ${card(t(S.flags.length || S.sf ? 'top20_title_f' : 'top20_title'), `<div class="chart" id="ch-top"></div><p class="legend">${legend}</p>`)}
      <section class="card" id="tbl"></section>`;
    const top = res.order.filter(i => v.set.has(i) && rowMatch(res, i)).slice(0, 20);
    const el = document.getElementById('ch-top');
    if (!top.length) { el.outerHTML = `<p class="empty-row">${esc(t('no_rows_flag'))}</p>`; lastView = v; renderTable(); return; }
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
  function rowMatch(res, i) {
    if (S.sf === '0' && res.stores[i] > 0) return false;
    if (S.sf === '1' && res.stores[i] === 0) return false;
    if (!S.flags.length) return true;
    return S.fm === 'all' ? S.flags.every(f => res.flags[f][i]) : S.flags.some(f => res.flags[f][i]);
  }
  function rankFilterBar(v) {
    const seg = (act, cur, opts) => `<div class="seg sm">${opts.map(([val, lbl, dis]) => `<button type="button" data-act="${act}" data-v="${val}" class="${cur === val ? 'active' : ''}" aria-pressed="${cur === val}" ${dis ? 'disabled' : ''}>${esc(lbl)}</button>`).join('')}</div>`;
    const n = v.idx.filter(i => rowMatch(v.res, i)).length;
    const names = S.flags.map(f => t('flag_' + f)).join(S.fm === 'all' ? t('and_sep') : t('or_sep'));
    const parts = [];
    if (S.flags.length) parts.push(t(S.flags.length > 1 && S.fm === 'all' ? 'sum_flags_all' : 'sum_flags_any', { f: names }));
    if (S.sf) parts.push(t(S.sf === '0' ? 'sum_nostore' : 'sum_store'));
    const summary = parts.length ? `<b>${esc(t('n_rows', { n: fInt(n) }))}</b> · ${esc(parts.join(' · '))}` : esc(t('rf_hint'));
    return `<div class="rank-filters">
      <span class="rf-group"><span class="rf-label">${esc(t('rf_match'))}</span>${seg('fm', S.fm, [['all', t('rf_all'), S.flags.length < 2], ['any', t('rf_any'), S.flags.length < 2]])}</span>
      <span class="rf-group"><span class="rf-label">${esc(t('c_stores'))}</span>${seg('sf', S.sf, [['', t('all')], ['0', t('rf_nostore')], ['1', t('rf_store')]])}</span>
      <span class="rf-summary" role="status">${summary}</span>
      ${S.flags.length || S.sf ? `<button type="button" class="btn" data-act="clearflags">${esc(t('clear_flag'))}</button>` : ''}
    </div>${conflictNote()}`;
  }
  // Flag rules that exclude each other by definition (design.md section 5), so "all of them" is always empty
  const EXCLUSIVE = [['white_space', 'under_served', 'x_ws_us'], ['white_space', 'over_served', 'x_ws_os'],
    ['under_served', 'over_served', 'x_us_os']];
  const STORE_RULE = { white_space: '0', under_served: '1', over_served: '1' };   // the store count each flag requires
  function conflictNote() {
    const why = [];
    if (S.fm === 'all') EXCLUSIVE.forEach(([a, b, k]) => { if (S.flags.includes(a) && S.flags.includes(b)) why.push(t(k)); });
    if (S.sf) {
      const clash = S.flags.filter(f => STORE_RULE[f] && STORE_RULE[f] !== S.sf);
      if (clash.length && (S.fm === 'all' || clash.length === S.flags.length))
        clash.forEach(f => why.push(t(STORE_RULE[f] === '0' ? 'x_store_none' : 'x_store_some', { f: t('flag_' + f) })));
    }
    if (!why.length) return '';
    const fix = S.fm === 'all' && S.flags.length > 1 ? `<button type="button" class="btn" data-act="fm" data-v="any">${esc(t('x_use_any'))}</button>` : '';
    return `<div class="notice conflict" role="status"><b>${esc(t('x_title'))}</b> ${why.map(esc).join(' ')}${fix ? `<div class="es-actions">${fix}</div>` : ''}</div>`;
  }
  const COLS = [
    ['rank', 'c_rank', 'num'], ['district', 'c_district', ''], ['region', 'c_region', 'hide-s'], ['households', 'c_households', 'num'],
    ['tier', 'c_tier', 'num hide-s'], ['sales', 'c_sales', 'num'], ['yoy', 'c_yoy', 'num'], ['stores', 'c_stores', 'num'],
    ['per100k', 'c_per100k', 'num hide-s'], ['score', 'c_score', 'num'], ['flags', 'c_flags', ''],
  ];
  function tableRows(v) {
    const { res, idx } = v;
    const q = ui.q.trim().toLocaleLowerCase('tr');
    let rows = idx.filter(i => rowMatch(res, i) && (!q || dname(i).toLocaleLowerCase('tr').includes(q)));
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
    const body = slice.map(i => `<tr data-code="${D.code[i]}" tabindex="0" class="${res.flags.white_space[i] ? 'row-ws' : ''}">
      <td class="num">${res.rank[i]}</td><td class="nw"><a href="${hashFor('district', D.code[i])}">${esc(D.ilce[i])}</a> <span class="muted">${esc(D.il[i])}</span></td>
      <td class="hide-s nw">${esc(DATA.regions[D.region[i]])}</td><td class="num">${fInt(res.hh[i])}</td><td class="num hide-s">${D.sege_tier[i]}</td>
      <td class="num">${fInt(res.hs[i])}</td><td class="num ${res.yoy[i] < 0 ? 'neg' : ''}">${fYoY(res.yoy[i])}</td><td class="num">${fInt(res.stores[i])}</td>
      <td class="num hide-s">${fDec(res.per100k[i], 1)}</td><td class="num"><b>${fDec(res.score[i], 1)}</b></td><td class="flags">${flagChips(res, i)}</td></tr>`).join('');
    const pager = pages > 1 ? `<div class="pager">${ui.pg > 1 ? `<button type="button" class="btn" data-act="page" data-v="${ui.pg - 1}">‹ ${esc(t('prev'))}</button>` : ''}
      <span>${esc(t('page_of', { p: ui.pg, n: pages }))}</span>${ui.pg < pages ? `<button type="button" class="btn" data-act="page" data-v="${ui.pg + 1}">${esc(t('next'))} ›</button>` : ''}</div>` : '';
    const focused = document.activeElement && document.activeElement.id === 'search';
    el.innerHTML = `<div class="card-head"><h2>${esc(t('table_title'))}</h2>
      <div class="tools"><input type="search" id="search" placeholder="${esc(t('search_ph'))}" value="${esc(ui.q)}" aria-label="${esc(t('search_ph'))}">
      <span class="muted">${esc(t('n_rows', { n: fInt(rows.length) }))}</span>
      <button type="button" class="btn" data-act="csv">⤓ ${esc(t('csv'))}</button></div></div>
      <div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="11" class="empty-row">${esc(ui.q ? t('no_rows_q', { q: ui.q }) : t('no_rows_flag'))}
        ${ui.q ? `<button type="button" class="btn" data-act="clearq">${esc(t('clear_search'))}</button>` : ''}${!ui.q && (S.flags.length || S.sf) ? `<button type="button" class="btn" data-act="clearflags">${esc(t('clear_flag'))}</button>` : ''}</td></tr>`}</tbody></table></div>${pager}`;
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
  function prevNext(res, i) {
    const r = res.rank[i], a = r > 1 ? res.order[r - 2] : null, b = r < N ? res.order[r] : null;
    const link = (j, lbl) => j === null ? `<span class="btn" aria-disabled="true">${lbl}</span>` :
      `<a class="btn" href="${hashFor('district', D.code[j])}" title="${esc(dname(j))}">${lbl}</a>`;
    return link(a, a === null ? '‹' : `‹ #${r - 1}`) + `<span class="muted">${esc(t('rank_of', { r, n: N }))}</span>` + link(b, b === null ? '›' : `#${r + 1} ›`);
  }
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
    // stores active in M after the format filter
    const f = DATA.formats.indexOf(S.f), mi = M.monthInt(S.m);
    const ks = storesByDistrict[i].filter(k => M.isActive(DATA, k, mi) && (f < 0 || ST.format[k] === f)).sort((x, y) => ST.open[x] - ST.open[y]);
    const storeTbl = ks.length ? `<div class="tablewrap tall"><table><thead><tr><th>${t('c_store')}</th><th>${t('f_format')}</th><th>${t('c_opened')}</th><th class="num">${t('c_size')}</th></tr></thead><tbody>` +
      ks.map(k => `<tr><td class="muted">${esc(ST.id[k])}</td><td class="nw">${esc(t('fmt_' + DATA.formats[ST.format[k]]))}</td><td class="nw">${esc(fMonth(ST.open[k]))}</td><td class="num">${fInt(ST.size[k])}</td></tr>`).join('') + '</tbody></table></div>'
      : `<div class="notice ${res.flags.white_space[i] ? 'ws' : ''}"><b>${esc(t('no_stores_title'))}</b> ${esc(t('no_stores', { m: fMonth(mi) }))}${res.flags.white_space[i] ? ' ' + esc(t('no_stores_ws')) : ''}</div>`;
    const peers = D.il.map((x, j) => x === D.il[i] ? j : -1).filter(j => j >= 0).sort((a, b2) => res.rank[a] - res.rank[b2]);
    const peerTbl = `<div class="tablewrap tall"><table><thead><tr><th class="num">${t('c_rank')}</th><th>${t('c_district')}</th><th class="num">${t('c_score')}</th><th class="num">${t('c_stores')}</th><th>${t('c_flags')}</th></tr></thead><tbody>` +
      peers.map(j => `<tr data-code="${D.code[j]}" tabindex="0" class="${j === i ? 'current' : ''}"><td class="num">${res.rank[j]}</td><td><a href="${hashFor('district', D.code[j])}">${esc(D.ilce[j])}</a></td><td class="num">${fDec(res.score[j], 1)}</td><td class="num">${fInt(res.stores[j])}</td><td class="flags">${flagChips(res, j)}</td></tr>`).join('') + '</tbody></table></div>';
    document.getElementById('page').innerHTML = `
      <h1 class="sr">${esc(t('nav_district'))}</h1>
      <div class="dnav">
        <a class="btn" href="${hashFor('ranking', null)}">← ${esc(t('back_ranking'))}</a>
        <div class="picker"><label for="pick" class="sr">${esc(t('pick'))}</label><span class="pick-ico" aria-hidden="true">⌕</span><input id="pick" list="pick-list" placeholder="${esc(t('pick_ph'))}" autocomplete="off"><datalist id="pick-list">${opts}</datalist></div>
        <span class="stepper">${prevNext(res, i)}</span>
      </div>
      ${howTo('howto_district')}
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
    const comps = [[t('comp_households'), res.pH[i], S.w[0], C.mid.households], [t('comp_income'), res.pI[i], S.w[1], C.mid.income], [t('comp_housing'), res.pS[i], S.w[2], C.mid.housing]];
    chart(document.getElementById('ch-score'), {
      tooltip: Object.assign({ trigger: 'item' }, ttStyle),
      grid: { left: narrow() ? 96 : 130, right: 70, top: 6, bottom: 22 },
      xAxis: { type: 'value', max: 100, axisLabel: { color: C.muted, fontSize: 10 }, splitLine: { lineStyle: { color: C.grid } } },
      yAxis: { type: 'category', inverse: true, data: comps.map(c => c[0]).concat(t('comp_total')), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: C.ink2, fontSize: 11 } },
      series: [{ type: 'bar', barMaxWidth: 18,
        data: comps.map(c => ({ value: c[1], itemStyle: { color: c[3], borderRadius: [0, 3, 3, 0] }, tip: `${fDec(c[1], 1)} × ${c[2]}% = ${fDec(c[1] * c[2] / 100, 1)}` }))
          .concat({ value: res.score[i], itemStyle: { color: C.dark.score, borderRadius: [0, 3, 3, 0] }, tip: t('score') }),
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
    const sliders = [['households', 0], ['income', 1], ['housing', 2]].map(([k, j]) => `<label class="wrow" style="--c:${C.dark[k]}"><span><i class="sw" aria-hidden="true"></i>${esc(t('comp_' + k))}</span>
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
