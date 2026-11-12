/* White-space metrics (design.md sections 3-5). Same logic as scripts/metrics.py, which is the
 * reference: tests/parity.mjs runs this file under Node and compares all 973 districts.
 * Rounding follows numpy (round half to even after scaling), because the reference rounds the
 * intermediate values before it ranks and compares them. */
(function (root) {
  'use strict';

  function rint(x) {                       // numpy.rint: round half to even
    if (Math.abs(x - Math.trunc(x)) === 0.5) return 2 * Math.round(x / 2);
    return Math.round(x);
  }
  function round(x, d) {                   // numpy.round(x, d) for finite x
    if (!isFinite(x)) return x;
    const f = Math.pow(10, d);
    return rint(x * f) / f;
  }
  function monthInt(s) { const [y, m] = s.split('-'); return +y * 12 + (+m - 1); }
  function monthStr(i) { const y = Math.floor(i / 12), m = i % 12 + 1; return y + '-' + (m < 10 ? '0' : '') + m; }

  /* Percentile rank 0..100 over all values: (rank - 1) / (n - 1) * 100, ties get their average
   * rank (pandas rank(method='average')). NaN values get NaN. */
  function percentile(values) {
    const n = values.length, out = new Float64Array(n);
    const idx = [];
    for (let i = 0; i < n; i++) { if (Number.isNaN(values[i])) out[i] = NaN; else idx.push(i); }
    idx.sort((a, b) => values[a] - values[b]);
    const m = idx.length;               // denominator uses n, like pandas len(x)
    for (let s = 0; s < m;) {
      let e = s;
      while (e + 1 < m && values[idx[e + 1]] === values[idx[s]]) e++;
      const rank = (s + 1 + e + 1) / 2;
      for (let k = s; k <= e; k++) out[idx[k]] = (rank - 1) / (n - 1) * 100;
      s = e + 1;
    }
    return out;
  }

  /* Count stores active in month m (int) per district, after the format filter.
   * format: index into DATA.formats, or -1 for all. */
  function activeStores(data, m, format) {
    const st = data.stores, n = data.districts.code.length, out = new Int32Array(n);
    for (let k = 0; k < st.id.length; k++) {
      if (format >= 0 && st.format[k] !== format) continue;
      if (st.open[k] <= m && (st.close[k] === null || st.close[k] > m)) out[st.district[k]]++;
    }
    return out;
  }
  function isActive(data, k, m) {
    const st = data.stores;
    return st.open[k] <= m && (st.close[k] === null || st.close[k] > m);
  }

  /* Demand side: depends on the year and the weights only, never on stores or filters. */
  function demand(data, year, weights) {
    const D = data.districts, n = D.code.length;
    const hh = D.households[year], hs = D.housing_sales[year], prev = D.housing_sales[year - 1];
    const housingPer1k = new Float64Array(n), yoy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      housingPer1k[i] = round(hs[i] / hh[i] * 1e3, 2);
      yoy[i] = (!prev || prev[i] === 0) ? NaN : round((hs[i] / prev[i] - 1) * 100, 1);
    }
    const pH = percentile(Array.from(hh)).map(v => round(v, 1));
    const pI = percentile(Array.from(D.sege_score)).map(v => round(v, 1));
    const pS = percentile(Array.from(housingPer1k)).map(v => round(v, 1));
    const wH = weights.households / 100, wI = weights.income / 100, wS = weights.housing / 100;
    const score = new Float64Array(n);
    for (let i = 0; i < n; i++) score[i] = round(wH * pH[i] + wI * pI[i] + wS * pS[i], 1);
    // rank 1 = highest score; ties keep the order of districts.csv (pandas method='first')
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => score[b] - score[a] || a - b);
    const rank = new Int32Array(n);
    order.forEach((i, r) => { rank[i] = r + 1; });
    return { year, hh, hs, prev: prev || null, housingPer1k, yoy, pH, pI, pS, score, rank, order };
  }

  /* Full metrics for one view. opts: {year, month ('YYYY-MM'), format, weights}. */
  function compute(data, opts, cachedDemand) {
    const cfg = data.config.flags;
    const dem = cachedDemand || demand(data, opts.year, opts.weights);
    const n = data.districts.code.length;
    const stores = activeStores(data, monthInt(opts.month), opts.format);
    let sumStores = 0, sumHH = 0;
    for (let i = 0; i < n; i++) { sumStores += stores[i]; sumHH += dem.hh[i]; }
    const national = sumStores / sumHH * 1e5;    // over all 973 districts, never the filtered ones
    const per100k = new Float64Array(n);
    const flags = { white_space: [], under_served: [], housing_boom: [], over_served: [] };
    for (let i = 0; i < n; i++) {
      per100k[i] = round(stores[i] / dem.hh[i] * 1e5, 2);
      const sc = dem.score[i], st = stores[i];
      flags.white_space[i] = sc >= cfg.white_space.min_score && st <= cfg.white_space.max_stores;
      flags.under_served[i] = sc >= cfg.under_served.min_score && st >= cfg.under_served.min_stores &&
        per100k[i] < cfg.under_served.max_ratio_to_national * national;
      flags.housing_boom[i] = dem.yoy[i] >= cfg.housing_boom.min_yoy_pct &&
        dem.hh[i] >= cfg.housing_boom.min_households && st <= cfg.housing_boom.max_stores;
      flags.over_served[i] = sc < cfg.over_served.max_score &&
        per100k[i] > cfg.over_served.min_ratio_to_national * national;
    }
    return Object.assign({}, dem, { stores, per100k, national, sumStores, sumHH, flags });
  }

  const api = { rint, round, percentile, activeStores, isActive, demand, compute, monthInt, monthStr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WSMetrics = api;
})(typeof self !== 'undefined' ? self : this);
