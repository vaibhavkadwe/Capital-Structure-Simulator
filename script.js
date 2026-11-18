'use strict';
(() => {
  initChrome();
  if (!document.getElementById('c-wacc') || typeof Chart === 'undefined') return;

  // ---------- Configuration ----------
  const FIELDS = [
    { id:'capital', g:'earn', label:'Total capital (V)',               unit:'$M', min:10,  max:1000, step:5,    def:100,  dec:0 },
    { id:'ratio',   g:'earn', label:'Target debt ratio (D/V)',         unit:'%',  min:0,   max:90,   step:1,    def:30,   dec:0 },
    { id:'ebit',    g:'earn', label:'EBIT / operating income',         unit:'$M', min:1,   max:200,  step:0.5,  def:15,   dec:1 },
    { id:'rf',      g:'mkt',  label:'Risk-free rate (R<sub>f</sub>)',  unit:'%',  min:1,   max:10,   step:0.1,  def:4.2,  dec:1 },
    { id:'erp',     g:'mkt',  label:'Equity risk premium (ERP)',       unit:'%',  min:2,   max:10,   step:0.1,  def:5.5,  dec:1 },
    { id:'rd',      g:'mkt',  label:'Base pre-tax cost of debt (R<sub>d</sub>)', unit:'%', min:2, max:15, step:0.1, def:5.5, dec:1 },
    { id:'bu',      g:'risk', label:'Unlevered beta (&beta;<sub>u</sub>)', unit:'', min:0.4, max:2.5,  step:0.05, def:1.1,  dec:2 },
    { id:'tc',      g:'risk', label:'Corporate tax rate (T<sub>c</sub>)', unit:'%', min:0,  max:40,   step:1,    def:25,   dec:0 },
  ];
  const PRESETS = {
    tech:    { capital:400, ratio:10, ebit:60, rf:4.2, erp:5.5, rd:6.5, bu:1.5,  tc:21, sens:'high' },
    utility: { capital:800, ratio:55, ebit:70, rf:4.2, erp:5.0, rd:5.0, bu:0.45, tc:25, sens:'low' },
    retail:  { capital:150, ratio:60, ebit:14, rf:4.2, erp:6.0, rd:9.5, bu:1.3,  tc:21, sens:'high' },
  };
  const SENS = { low:0.6, medium:1, high:1.6 };
  const DEF = { sens:'medium' }; FIELDS.forEach(f => DEF[f.id] = f.def);
  const state = { ...DEF };

  // Synthetic rating: [min coverage, rating, spread %] (large-cap coverage bands)
  const BANDS = [[8.5,'AAA',.63],[6.5,'AA',.78],[5.5,'A+',.98],[4.25,'A',1.08],[3,'A-',1.22],[2.5,'BBB',1.56],
    [2.25,'BB+',2.0],[2,'BB',2.4],[1.75,'B+',3.51],[1.5,'B',4.21],[1.25,'B-',5.15],[.8,'CCC',8],[.65,'CC',10.5],[.2,'C',12],[-Infinity,'D',14]];
  const KNOTS = [[0,14],[.2,12],[.65,10.5],[.8,8],[1.25,5.15],[1.5,4.21],[1.75,3.51],[2,2.4],[2.25,2],[2.5,1.56],[3,1.22],[4.25,1.08],[5.5,.98],[6.5,.78],[8.5,.63]];

  // ---------- Math engine ----------
  const rating = icr => BANDS.find(b => icr >= b[0])[1];
  const tier = r => ['AAA','AA','A+','A','A-'].includes(r) ? 'a' : ['BBB','BB+','BB'].includes(r) ? 'b' : ['B+','B','B-'].includes(r) ? 'c' : 'd';
  function spread(icr) { // continuous, decimal; piecewise-linear through KNOTS
    if (icr >= 8.5) return .0063;
    for (let i = 1; i < KNOTS.length; i++) if (icr <= KNOTS[i][0]) {
      const [x0,y0] = KNOTS[i-1], [x1,y1] = KNOTS[i];
      return (y0 + (y1 - y0) * (icr - x0) / (x1 - x0)) / 100;
    }
    return .0063;
  }
  const params = () => ({
    V: state.capital, ebit: state.ebit, rf: state.rf/100, erp: state.erp/100, rd: state.rd/100,
    bu: state.bu, tc: state.tc/100, m: SENS[state.sens],
  });
  function calc(w, p) {
    const D = w * p.V, de = w / (1 - w);
    const bl = p.bu * (1 + (1 - p.tc) * de);
    const ke = p.rf + bl * p.erp;
    let kd = p.rd, icr = Infinity;
    if (D > 0) { // interest <-> spread circularity solved by damped iteration
      for (let i = 0; i < 14; i++) {
        icr = p.ebit / (kd * D);
        const target = p.rd + p.m * (spread(icr) - .0063) + p.m * .05 * w ** 3;
        kd = Math.min(.35, .5 * kd + .5 * target);
      }
      icr = p.ebit / (kd * D);
    }
    const wacc = (1 - w) * ke + w * kd * (1 - p.tc);
    const fcff = p.ebit * (1 - p.tc);
    const vu = fcff / (p.rf + p.bu * p.erp);
    return { w, D, bl, ke, kd, kdat: kd * (1 - p.tc), icr, wacc, ev: fcff / Math.max(wacc, .005), vu, ceil: vu + p.tc * D };
  }
  function sweep() {
    const p = params(), rows = [];
    for (let i = 0; i <= 90; i++) rows.push(calc(i / 100, p));
    let opt = rows[0];
    rows.forEach(r => { if (r.wacc < opt.wacc) opt = r; });
    return { p, rows, opt, cur: calc(state.ratio / 100, p) };
  }

  // ---------- Formatting ----------
  const pct = (x, d = 2) => (x * 100).toFixed(d) + '%';
  const usd = x => '$' + x.toFixed(1) + 'M';
  const xf = i => isFinite(i) ? i.toFixed(1) + 'x' : 'n/a';
  const sgn = (x, f) => (x >= 0 ? '+' : '−') + f(Math.abs(x));
  const $ = id => document.getElementById(id);

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function themeColors() {
    return {
      ink: cssVar('--ink'),
      muted: cssVar('--muted'),
      grid: cssVar('--rule'),
      wacc: cssVar('--chart-wacc'),
      ke: cssVar('--chart-ke'),
      kd: cssVar('--chart-kd'),
      gold: cssVar('--chart-opt'),
      shield: cssVar('--chart-shield'),
      distress: cssVar('--chart-distress'),
      unlev: cssVar('--chart-unlev'),
    };
  }

  // ---------- Controls ----------
  const nums = {}, ranges = {};
  FIELDS.forEach(f => {
    const host = $('g-' + f.g);
    if (!host) return;
    const el = document.createElement('div'); el.className = 'field';
    el.innerHTML = `<div class="row1"><label for="n-${f.id}">${f.label}</label>
      <div class="num"><input id="n-${f.id}" type="number" min="${f.min}" max="${f.max}" step="${f.step}" inputmode="decimal"><span>${f.unit}</span></div></div>
      <input id="r-${f.id}" type="range" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.label.replace(/<[^>]+>/g,'')}">`;
    host.appendChild(el);
    const n = nums[f.id] = el.querySelector('input[type=number]'), r = ranges[f.id] = el.querySelector('input[type=range]');
    r.addEventListener('input', () => { state[f.id] = +r.value; n.value = (+r.value).toFixed(f.dec); paintRange(f); changed(); });
    n.addEventListener('input', () => {
      const v = parseFloat(n.value);
      if (isFinite(v) && v >= f.min && v <= f.max) { state[f.id] = v; r.value = v; paintRange(f); changed(); }
    });
    n.addEventListener('change', () => { // clamp on commit
      let v = parseFloat(n.value); if (!isFinite(v)) v = state[f.id];
      v = Math.min(f.max, Math.max(f.min, v)); state[f.id] = v; r.value = v; n.value = v.toFixed(f.dec); paintRange(f); changed();
    });
  });
  function paintRange(f) {
    const r = ranges[f.id];
    if (!r) return;
    r.style.setProperty('--fill', ((state[f.id] - f.min) / (f.max - f.min) * 100) + '%');
  }
  function syncControls() {
    FIELDS.forEach(f => {
      if (!nums[f.id]) return;
      nums[f.id].value = state[f.id].toFixed(f.dec);
      ranges[f.id].value = state[f.id];
      paintRange(f);
    });
    const sens = document.querySelector(`input[name=sens][value=${state.sens}]`);
    if (sens) sens.checked = true;
  }
  function markPreset(id) {
    document.querySelectorAll('[data-preset]').forEach(x => x.classList.toggle('on', x.dataset.preset === id));
  }
  function applyPreset(id) {
    if (!PRESETS[id]) return;
    Object.assign(state, PRESETS[id]);
    syncControls();
    markPreset(id);
    schedule();
  }
  document.querySelectorAll('input[name=sens]').forEach(r => r.addEventListener('change', () => { state.sens = r.value; changed(); }));
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
  const resetBtn = $('reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      Object.assign(state, DEF); syncControls(); schedule();
      markPreset(null);
    });
  }
  function changed() { markPreset(null); schedule(); }

  function applyHashPreset() {
    const m = /(?:^|#|&)preset=([a-z]+)/i.exec(location.hash);
    if (m) applyPreset(m[1].toLowerCase());
  }
  window.addEventListener('hashchange', applyHashPreset);

  // ---------- Charts ----------
  let C = themeColors();
  const labels = Array.from({ length: 91 }, (_, i) => i);
  const markers = { // vertical guides for current & optimal debt ratio, with dots on one series
    id: 'markers',
    afterDatasetsDraw(c, _a, o) {
      if (o.cur == null) return;
      const { ctx, chartArea: a, scales: { x, y } } = c, optRight = o.opt >= o.cur;
      [[o.opt, C.gold, 'Optimal ' + o.opt + '%', optRight, true], [o.cur, C.ink, 'Current ' + o.cur + '%', !optRight, false]].forEach(([i, col, text, left, dash]) => {
        const px = x.getPixelForValue(i), py = y.getPixelForValue(c.data.datasets[o.series].data[i]);
        ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = dash ? 2.2 : 1.5;
        if (dash) { ctx.shadowColor = col; ctx.shadowBlur = 10; }
        ctx.setLineDash(dash ? [5, 4] : []); ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
        ctx.setLineDash([]); ctx.beginPath(); ctx.arc(px, Math.min(a.bottom, Math.max(a.top, py)), 4.5, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = '600 11px Inter, sans-serif'; ctx.textAlign = left ? 'left' : 'right';
        ctx.fillText(text, px + (left ? 6 : -6), a.top + 12); ctx.restore();
      });
    },
  };
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.color = C.muted;
  const baseOpts = (fmt, title) => ({
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: { callbacks: { title: t => 'Debt ratio ' + t[0].label + '%', label: t => t.dataset.label + ': ' + fmt(t.parsed.y) } },
      markers: {},
    },
    scales: {
      x: { grid: { display: false }, title: { display: true, text: 'Debt-to-total-capital (D/V)' },
           ticks: { autoSkip: false, maxRotation: 0, callback(v, i) { return i % 10 === 0 ? i + '%' : ''; } } },
      y: { grid: { color: C.grid }, title: { display: true, text: title }, ticks: { callback: v => fmt(v) } },
    },
  });
  const ds = (label, color, extra = {}) => ({ label, data: [], borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .2, ...extra });
  const cW = new Chart($('c-wacc'), { type: 'line', plugins: [markers], data: { labels, datasets: [
    ds('WACC', C.wacc, { borderWidth: 3.5 }), ds('Cost of equity', C.ke), ds('After-tax cost of debt', C.kd) ] },
    options: baseOpts(v => v.toFixed(1) + '%', 'Cost (%)') });
  const cE = new Chart($('c-ev'), { type: 'line', plugins: [markers], data: { labels, datasets: [
    ds('Unlevered value', C.unlev, { borderDash: [4, 4], borderWidth: 1.5 }),
    ds('Unlevered + tax shield', C.kd, { borderDash: [6, 4], fill: '-1', backgroundColor: C.shield }),
    ds('Levered value (net of distress)', C.ink, { borderWidth: 3, fill: '-1', backgroundColor: C.distress }) ] },
    options: baseOpts(v => '$' + v.toFixed(0) + 'M', 'Enterprise value ($M)') });
  [cW, cE].forEach(ch => ch.canvas.addEventListener('click', e => { // click-to-set debt ratio
    const i = Math.min(90, Math.max(0, Math.round(ch.scales.x.getValueForPixel(e.offsetX))));
    state.ratio = i; nums.ratio.value = i; ranges.ratio.value = i; paintRange(FIELDS.find(f => f.id === 'ratio')); changed();
  }));

  function applyChartTheme() {
    C = themeColors();
    Chart.defaults.color = C.muted;
    const w = cW.data.datasets, e = cE.data.datasets;
    w[0].borderColor = w[0].backgroundColor = C.wacc;
    w[1].borderColor = w[1].backgroundColor = C.ke;
    w[2].borderColor = w[2].backgroundColor = C.kd;
    e[0].borderColor = e[0].backgroundColor = C.unlev;
    e[1].borderColor = C.kd; e[1].backgroundColor = C.shield;
    e[2].borderColor = C.ink; e[2].backgroundColor = C.distress;
    cW.options.scales.y.grid.color = C.grid;
    cE.options.scales.y.grid.color = C.grid;
    cW.options.scales.x.ticks.color = cW.options.scales.y.ticks.color = C.muted;
    cE.options.scales.x.ticks.color = cE.options.scales.y.ticks.color = C.muted;
    cW.options.plugins.legend.labels.color = cE.options.plugins.legend.labels.color = C.ink;
    cW.update('none'); cE.update('none');
  }
  document.addEventListener('ocs-theme', applyChartTheme);

  // ---------- Render ----------
  let raf = 0;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }

  function render() {
    const { p, rows, opt, cur } = sweep();
    const curI = Math.round(cur.w * 100), optI = Math.round(opt.w * 100);
    const dBps = (cur.wacc - opt.wacc) * 1e4, dEV = opt.ev - cur.ev, dDebt = (opt.w - cur.w) * p.V;

    // KPIs
    $('k-wacc').innerHTML = `${pct(cur.wacc)} <small>vs ${pct(opt.wacc)}</small>`;
    $('k-wacc-sub').innerHTML = dBps > 0.5 ? `<span class="down">${dBps.toFixed(0)} bps above optimum</span>` : '<span class="up">At the minimum</span>';
    $('k-ev').textContent = usd(cur.ev);
    $('k-ev-sub').textContent = dEV > 0.05 ? `${usd(dEV)} more at optimal leverage` : `Unlevered: ${usd(cur.vu)}`;
    const r = rating(cur.icr);
    $('k-icr').textContent = xf(cur.icr);
    const b = $('k-badge'); b.textContent = isFinite(cur.icr) ? r : 'n/a'; b.dataset.t = isFinite(cur.icr) ? tier(r) : '';
    $('k-icr-sub').textContent = isFinite(cur.icr) ? `Pre-tax cost of debt ${pct(cur.kd)}` : 'No debt outstanding';
    $('k-opt').textContent = optI + '%';
    $('k-opt-sub').textContent = Math.abs(dDebt) < 0.05 * p.V / 10 ? `Already at optimum (${curI}%)`
      : `Currently ${curI}%: ${dDebt > 0 ? 'add' : 'repay'} ${usd(Math.abs(dDebt))} of debt`;

    // Charts
    const pc = k => rows.map(x => x[k] * 100);
    cW.data.datasets[0].data = pc('wacc'); cW.data.datasets[1].data = pc('ke'); cW.data.datasets[2].data = pc('kdat');
    const yMax = Math.ceil(Math.max(Math.max(...pc('wacc')) + 3, rows[70].ke * 100) / 2) * 2;
    cW.options.scales.y.max = yMax;
    $('clip-note').textContent = rows[90].ke * 100 > yMax ? 'Cost of equity runs off the top at high leverage.' : '';
    cW.options.plugins.markers = { cur: curI, opt: optI, series: 0 };
    cE.data.datasets[0].data = rows.map(x => x.vu); cE.data.datasets[1].data = rows.map(x => x.ceil); cE.data.datasets[2].data = rows.map(x => x.ev);
    cE.options.plugins.markers = { cur: curI, opt: optI, series: 2 };
    cW.update('none'); cE.update('none');

    insight(p, cur, opt, curI, optI, dBps, dEV);
    table(cur, opt);
  }

  function insight(p, cur, opt, curI, optI, dBps, dEV) {
    const gap = curI - optI, r = rating(cur.icr), out = [];
    let sev = 'ok';
    if (Math.abs(gap) <= 2) out.push(`Your <b>${curI}%</b> debt ratio is within 2 points of the simulated optimum (<b>${optI}%</b>). Moving to the optimum changes WACC by only <b>${Math.abs(dBps).toFixed(0)} bps</b>.`);
    else if (gap < 0) { out.push(`At <b>${curI}%</b> debt the firm is <b>under-levered</b>. Moving to <b>${optI}%</b> cuts WACC from ${pct(cur.wacc)} to ${pct(opt.wacc)} (<b>${dBps.toFixed(0)} bps</b>) and unlocks about <b>${usd(dEV)}</b> of enterprise value (${(dEV / cur.ev * 100).toFixed(1)}%).`);
      if (p.tc === 0) out[0] += ' With a 0% tax rate there is no tax shield, so leverage adds risk without a tax benefit.'; sev = 'warn'; }
    else { out.push(`At <b>${curI}%</b> debt the firm is <b>past its optimum</b> (${optI}%). Higher spreads and equity risk outweigh the tax shield. Reducing debt to ${optI}% would cut WACC by <b>${dBps.toFixed(0)} bps</b> and recover about <b>${usd(dEV)}</b> of value.`); sev = 'warn'; }
    if (!isFinite(cur.icr)) out.push('With no debt there is no interest burden, but the firm forgoes its tax shield entirely.');
    else if (cur.icr < 1) { out.push(`<b>Warning:</b> EBIT covers interest only <b>${xf(cur.icr)}</b>. The firm cannot service its debt from operations, implying a synthetic <b>${r}</b> rating and a ${pct(cur.kd)} cost of debt.`); sev = 'bad'; }
    else if (cur.icr < 1.5) { out.push(`<b>Warning:</b> interest coverage of <b>${xf(cur.icr)}</b> is below 1.5x (synthetic <b>${r}</b>). Lenders will price in significant default risk, and covenant breaches are likely in a downturn.`); sev = 'bad'; }
    else if (cur.icr < 3) out.push(`Interest coverage of <b>${xf(cur.icr)}</b> is thin (synthetic <b>${r}</b>); an earnings dip would quickly raise borrowing costs.`);
    else out.push(`Interest coverage of <b>${xf(cur.icr)}</b> supports a synthetic <b>${r}</b> rating and a ${pct(cur.kd)} cost of debt.`);
    if (p.tc > 0 && isFinite(cur.icr)) out.push(`The gross tax shield is worth about <b>${usd(p.tc * cur.D)}</b> (T<sub>c</sub> × D). Levered value is <b>${usd(cur.ev)}</b> against <b>${usd(cur.vu)}</b> unlevered.`);
    $('insight').className = 'card insight' + (sev === 'ok' ? '' : ' ' + sev);
    $('insight-body').innerHTML = out.map(t => `<p>${t}</p>`).join('');
  }

  function table(c, o) {
    const rows = [
      ['Debt ratio (D/V)', x => pct(x.w, 0), (a, b) => sgn((a - b) * 100, v => v.toFixed(0) + ' pts')],
      ['Levered beta', x => x.bl.toFixed(2), (a, b) => sgn(a - b, v => v.toFixed(2))],
      ['Cost of equity', x => pct(x.ke), (a, b) => sgn((a - b) * 1e4, v => v.toFixed(0) + ' bps')],
      ['Pre-tax cost of debt', x => pct(x.kd), (a, b) => sgn((a - b) * 1e4, v => v.toFixed(0) + ' bps')],
      ['After-tax cost of debt', x => pct(x.kdat), (a, b) => sgn((a - b) * 1e4, v => v.toFixed(0) + ' bps')],
      ['WACC', x => pct(x.wacc), (a, b) => sgn((a - b) * 1e4, v => v.toFixed(0) + ' bps')],
      ['Interest coverage', x => xf(x.icr), () => ''],
      ['Synthetic rating', x => isFinite(x.icr) ? rating(x.icr) : 'n/a', () => ''],
      ['Enterprise value', x => usd(x.ev), (a, b) => sgn(a - b, v => '$' + v.toFixed(1) + 'M')],
    ];
    const val = { 'Debt ratio (D/V)': 'w', 'Levered beta': 'bl', 'Cost of equity': 'ke', 'Pre-tax cost of debt': 'kd', 'After-tax cost of debt': 'kdat', 'WACC': 'wacc', 'Enterprise value': 'ev' };
    $('cmp').innerHTML = '<thead><tr><th></th><th>Current</th><th>Optimal</th><th>Change to optimal</th></tr></thead><tbody>' +
      rows.map(([n, f, d]) => `<tr><td>${n}</td><td>${f(c)}</td><td>${f(o)}</td><td>${val[n] ? d(o[val[n]], c[val[n]]) : ''}</td></tr>`).join('') + '</tbody>';
  }

  syncControls();
  applyHashPreset();
  render();
})();

function initChrome() {
  const root = document.documentElement;
  const KEY = 'ocs-theme';
  let mode = 'light';
  try {
    if (localStorage.getItem(KEY) === 'dark') mode = 'dark';
  } catch (_) { /* private mode */ }
  const apply = () => {
    if (mode === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
      btn.textContent = mode === 'dark' ? 'Daylight' : 'Evening';
    }
    document.dispatchEvent(new CustomEvent('ocs-theme'));
  };
  apply();
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      mode = mode === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, mode); } catch (_) { /* ignore */ }
      apply();
    });
  }
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('open', !open);
    });
  }
}
