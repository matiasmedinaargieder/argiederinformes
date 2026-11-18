/* ===== Formato ===== */
const nf = (v, d) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtP = v => nf(Math.abs(v) * 100, 1);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const COL = { idx: '#2563eb', fix: '#2a9d8f', neg: '#e5484d', act: '#9aa3b2' };

const S = { file: null, sheets: [], sel: null, pfile: null, psheets: [], psel: null, opts: { client: '', period: '', showNames: true, types: {} },
  vfile: null, vsheets: [], vsel: null, vadv: [], vopts: { showNames: true, types: {}, adv: '' } };
const $ = id => document.getElementById(id);

/* ===== Informe ===== */
function renderComparison() {
  const sh = S.sel;
  const m = buildModel(sh, { types: S.opts.types, showNames: S.opts.showNames });
  const gas = m.kind === 'gas';
  const dec = m.actual.total < 1500 ? 2 : 0;
  const E = v => nf(v, dec) + ' €';
  const client = (S.opts.client || '').trim(), period = (S.opts.period || '').trim();
  const sub = [client, 'Tarifa ' + sh.tariff, period].filter(Boolean).join(' · ')
    + (sh.kwh ? ` (consumo facturado: ${nf(sh.kwh, 0)} kWh)` : '');
  const kpi = (title, best, cls, kind) => {
    if (!best) return `<div class="kpi"><div class="l">${title}</div><div class="v none">—</div><div class="s">No hay ofertas ${kind === 'fix' ? 'de precio fijo' : 'indexadas'}</div></div>`;
    if (best.saving <= 0) return `<div class="kpi"><div class="l">${title}</div><div class="v none">—</div><div class="s">Sin ahorro (${esc(best.label)})</div></div>`;
    const an = best.annual && best.annual > 0 ? `<div class="s2">≈ ${nf(best.annual, 0)} € al año</div>` : '';
    return `<div class="kpi"><div class="l">${title}</div><div class="v ${cls}">${E(best.saving)}</div>
      <div class="s">${fmtP(best.pct)}% menos en esta factura · ${esc(best.label)}</div>${an}</div>`;
  };
  const maxAbs = Math.max(...m.offers.map(o => Math.abs(o.saving)), 1);
  const maxTot = Math.max(m.actual.total, ...m.offers.map(o => o.total));
  const colorOf = o => (o.saving <= 0 ? COL.neg : o.type === 'idx' ? COL.idx : COL.fix);
  const hasIdx = m.offers.some(o => o.type === 'idx'), hasFix = m.offers.some(o => o.type === 'fix'), hasNeg = m.offers.some(o => o.saving <= 0);
  const leg = [hasIdx ? ['Indexado', COL.idx] : null, hasFix ? ['Precio fijo', COL.fix] : null, hasNeg ? ['Sin ahorro', COL.neg] : null]
    .filter(Boolean).map(([t, c]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');

  const rowsA = m.offers.map(o => {
    const w = Math.max(Math.abs(o.saving) / maxAbs * 100, 2.5);
    const sign = o.saving >= 0 ? '+' : '−';
    return `<div class="br"><div class="n">${esc(o.label)}<small>${esc(o.sub)}</small></div>
      <div class="trk"><div class="fl" style="width:${w}%;background:${colorOf(o)}"></div></div>
      <div class="val ${o.saving > 0 ? 'pos' : 'neg'}">${sign}${E(Math.abs(o.saving))}<small>${fmtP(o.pct)}%</small></div></div>`;
  }).join('');
  const rowsB = [`<div class="brs"><div class="n">Actual<small style="display:block;font-size:11px;font-weight:500;color:#64748b">Tu factura hoy</small></div>
      <div class="trk"><div class="fl" style="width:${m.actual.total / maxTot * 100}%;background:${COL.act}"></div></div><div class="val">${E(m.actual.total)}</div></div>`]
    .concat(m.offers.map(o => `<div class="brs"><div class="n">${esc(o.label)}<small style="display:block;font-size:11px;font-weight:500;color:#64748b">${esc(o.sub)}</small></div>
      <div class="trk"><div class="fl" style="width:${o.total / maxTot * 100}%;background:${colorOf(o)}"></div></div><div class="val">${E(o.total)}</div></div>`)).join('');

  // ---- desglose
  const cols = [{ t: 'Actual', d: m.actual }];
  if (m.bestFix) cols.push({ t: `${m.bestFix.label} · Fijo`, d: m.bestFix });
  if (m.bestIdx) cols.push({ t: `${m.bestIdx.label} · Indexado`, d: m.bestIdx });
  const CON = gas
    ? [['pot', 'Término fijo', '#2563eb'], ['ene', 'Consumo de gas', '#f59e0b'], ['ie', 'Imp. hidrocarburos', '#8b5cf6'], ['iva', 'IVA', '#94a3b8'], ['otros', 'Otros', '#d4d8df']]
    : [['pot', 'Potencia', '#2563eb'], ['ene', 'Energía', '#f59e0b'], ['serv', 'Servicios de ajuste', '#14b8a6'], ['ie', 'Imp. eléctrico', '#8b5cf6'], ['iva', 'IVA', '#94a3b8'], ['otros', 'Otros', '#d4d8df']];
  const con = CON.filter(([k]) => cols.some(c => Math.abs(c.d[k]) >= 0.005));
  const maxC = Math.max(...cols.map(c => c.d.total));
  const stack = cols.map(c => `<div class="brs"><div class="n">${esc(c.t)}</div><div class="trk">${con.map(([k, , colr]) => c.d[k] > 0 ? `<div class="seg" style="width:${c.d[k] / maxC * 100}%;background:${colr}"></div>` : '').join('')}</div><div class="val">${E(c.d.total)}</div></div>`).join('');
  const legC = con.map(([, t, colr]) => `<span><i style="background:${colr}"></i>${t}</span>`).join('');
  const tbl = `<table><thead><tr><th></th>${cols.map(c => `<th>${esc(c.t)}</th>`).join('')}</tr></thead><tbody>
    ${con.map(([k, t]) => `<tr><td>${t}</td>${cols.map(c => `<td>${E(c.d[k])}</td>`).join('')}</tr>`).join('')}
    <tr class="tot"><td>Total factura</td>${cols.map(c => `<td>${E(c.d.total)}</td>`).join('')}</tr></tbody></table>`;
  const cmpTxt = cols.length === 3 ? 'la mejor oferta de precio fijo y la mejor de indexado' : cols.length === 2 ? 'la mejor oferta' : 'las ofertas';

  const a = sh.advisor || {};
  const adv = a.name ? `<br><b>Tu asesor:</b> ${esc([a.name, a.email, a.mobile || a.office].filter(Boolean).join(' · '))}` : '';
  const baseTxt = period ? `el consumo de ${esc(period)}` : 'el consumo de la factura analizada';

  return `<div class="rep">
  <div class="blk"><div class="head"><div><h1>Ahorro en tu factura de ${gas ? 'gas' : 'luz'}</h1><div class="sub">${esc(sub)}</div></div><img class="logo" src="img/logo.png" alt=""></div>
    <div class="kpis">
      <div class="kpi"><div class="l">Tu factura actual</div><div class="v">${E(m.actual.total)}</div><div class="s">${period ? esc(period) + ', ' : ''}IVA incluido</div></div>
      ${kpi('Mejor ahorro con precio fijo', m.bestFix, 'fix', 'fix')}
      ${kpi('Mejor ahorro con indexado', m.bestIdx, 'idx', 'idx')}
    </div></div>
  <div class="blk"><div class="box"><h2>¿Cuánto te ahorras con cada oferta?</h2>
    <p class="d">Ahorro en euros ${period ? 'durante ' + esc(period) : 'en esta factura'} frente a tu factura actual.</p>
    <div class="legend">${leg}</div><div class="bars">${rowsA}</div></div></div>
  <div class="blk"><div class="box"><h2>Lo que pagarías con cada oferta</h2>
    <p class="d">Importe total de la factura (con IVA) según la oferta elegida.</p>
    <div class="stack">${rowsB}</div></div></div>
  <div class="blk"><div class="box"><h2>¿De dónde sale el ahorro?</h2>
    <p class="d">Desglose de tu factura: situación actual frente a ${cmpTxt}.</p>
    <div class="legend">${legC}</div><div class="stack">${stack}</div>${tbl}</div></div>
  <div class="blk"><div class="foot">Ahorro calculado con ${baseTxt}. Las ofertas indexadas dependen del precio del mercado, por lo que su importe puede variar en cada factura; las de precio fijo mantienen el precio pactado. Simulación orientativa: los precios pueden cambiar hasta la contratación.${adv}</div></div>
  </div>`;
}

/* ===== Informe de ajuste de potencia ===== */
/* ===== Comparativa V2 (Excel de Verónica) ===== */
function advisorV2() {
  const i = S.vopts.adv;
  if (i !== '' && S.vadv[+i]) return S.vadv[+i];
  const a = S.vsel && S.vsel.advisor;
  return a && a.name ? a : null;
}

function renderComparisonV2() {
  const sh = S.vsel;
  const m = buildModelV2(sh, { types: S.vopts.types, showNames: S.vopts.showNames });
  const gas = m.kind === 'gas';
  const dec = m.actual.total < 1500 ? 2 : 0;
  const E = v => nf(v, dec) + ' €';
  const E2 = v => nf(v, 2) + ' €';
  const kwf = v => nf(v, Number.isInteger(v) ? 0 : 2);
  const client = (S.opts.client || '').trim(), period = (S.opts.period || '').trim();
  const sub = [client, 'Tarifa ' + sh.tariff, period, sh.cups ? 'CUPS ' + sh.cups : ''].filter(Boolean).join(' · ')
    + (sh.kwh ? ` (consumo facturado: ${nf(sh.kwh, 0)} kWh)` : '');
  const small = t => t ? `<small>${esc(t)}</small>` : '';
  const cond = o => { const x = v2SsInfo(o); return [x && x.short, v2Dur(o)].filter(Boolean).join(' · '); };

  // ---- cabecera y tarjetas
  const kpi = (title, best, cls, kind) => {
    if (!best) return `<div class="kpi"><div class="l">${title}</div><div class="v none">—</div><div class="s">No hay ofertas ${kind === 'fix' ? 'de precio fijo' : 'indexadas'}</div></div>`;
    if (best.saving <= 0) return `<div class="kpi"><div class="l">${title}</div><div class="v none">—</div><div class="s">Sin ahorro (${esc(best.label)})</div></div>`;
    const an = best.annual && best.annual > 0 ? `<div class="s2">≈ ${nf(best.annual, 0)} € al año</div>` : '';
    return `<div class="kpi"><div class="l">${title}</div><div class="v ${cls}">${E(best.saving)}</div>
      <div class="s">${fmtP(best.pct)}% menos en esta factura · ${esc(best.label)}</div>
      <div class="s">${esc([best.sub, cond(best)].filter(Boolean).join(' · '))}</div>${an}</div>`;
  };
  const actKpi = `<div class="kpi"><div class="l">Tu factura actual</div><div class="v">${E(m.actual.total)}</div>
      <div class="s">${period ? esc(period) + ', ' : ''}IVA incluido</div>
      ${m.actual.brand ? `<div class="s2">${esc(m.actual.brand)} · ${esc(m.actual.sub)}</div>` : ''}
      ${sh.contractEnd ? `<div class="s">Fin de contrato: ${esc(sh.contractEnd)}</div>` : ''}</div>`;

  // ---- datos del contrato y del consumo
  const kws = sh.periods.filter(p => p.kw > 0);
  const facts = [
    ['Comercializadora actual', m.actual.brand], ['Tipo de precio actual', m.actual.sub], ['Fin de contrato', sh.contractEnd],
    ['CUPS', sh.cups], ['Periodo de consumo', sh.periodTxt],
    ['Consumo anual', sh.kwhYear ? nf(sh.kwhYear, 0) + ' kWh' : ''], ['Consumo medio mensual', sh.kwhAvg ? nf(sh.kwhAvg, 0) + ' kWh' : ''],
    ['Consumo de la factura', sh.kwh ? nf(sh.kwh, 0) + ' kWh' : ''],
    ['Potencia contratada', kws.length ? kws.map(p => `${p.label} ${kwf(p.kw)}`).join(' · ') + ' kW' : '', true]
  ].filter(f => f[1]);
  const factsBlk = facts.length >= 2 ? `<div class="blk"><div class="box"><h2>Tu situación actual</h2>
    <p class="d">Datos de tu contrato y de tu consumo que hemos usado para la comparativa.</p>
    <div class="facts">${facts.map(([l, v, w]) => `<div class="fact${w ? ' wide' : ''}"><span>${l}</span><b>${esc(v)}</b></div>`).join('')}</div></div></div>` : '';

  // ---- barras
  const maxAbs = Math.max(...m.offers.map(o => Math.abs(o.saving)), 1);
  const maxTot = Math.max(m.actual.total, ...m.offers.map(o => o.total));
  const colorOf = o => (o.saving <= 0 ? COL.neg : o.type === 'idx' ? COL.idx : COL.fix);
  const hasIdx = m.offers.some(o => o.type === 'idx'), hasFix = m.offers.some(o => o.type === 'fix'), hasNeg = m.offers.some(o => o.saving <= 0);
  const leg = [hasIdx ? ['Indexado', COL.idx] : null, hasFix ? ['Precio fijo', COL.fix] : null, hasNeg ? ['Sin ahorro', COL.neg] : null]
    .filter(Boolean).map(([t, c]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
  const rowsA = m.offers.map(o => {
    const w = Math.max(Math.abs(o.saving) / maxAbs * 100, 2.5);
    const sign = o.saving >= 0 ? '+' : '−';
    const an = o.saving > 0 && o.annual && o.annual > 0 ? `<small>≈ ${nf(o.annual, 0)} €/año</small>` : '';
    return `<div class="br"><div class="n">${esc(o.label)}${small(o.sub)}${small(cond(o))}</div>
      <div class="trk"><div class="fl" style="width:${w}%;background:${colorOf(o)}"></div></div>
      <div class="val ${o.saving > 0 ? 'pos' : 'neg'}">${sign}${E(Math.abs(o.saving))}<small>${fmtP(o.pct)}%</small>${an}</div></div>`;
  }).join('');
  const rowsB = [`<div class="brs"><div class="n">Actual${small(m.actual.brand ? m.actual.brand + ' · ' + m.actual.sub : 'Tu factura hoy')}</div>
      <div class="trk"><div class="fl" style="width:${m.actual.total / maxTot * 100}%;background:${COL.act}"></div></div><div class="val">${E(m.actual.total)}</div></div>`]
    .concat(m.offers.map(o => `<div class="brs"><div class="n">${esc(o.label)}${small(o.sub)}</div>
      <div class="trk"><div class="fl" style="width:${o.total / maxTot * 100}%;background:${colorOf(o)}"></div></div><div class="val">${E(o.total)}</div></div>`)).join('');

  // ---- condiciones de cada oferta
  const ssTxt = o => { const x = v2SsInfo(o); return x ? esc(x.txt) + (x.cost ? ` (+${E2(x.cost)})` : '') : '—'; };
  const showSS = m.offers.some(o => v2SsInfo(o)), showDur = m.offers.some(o => o.dur), showDto = m.offers.some(o => o.dtoPct > 0.0001);
  const condHead = `<tr><th>Oferta</th>${showSS ? '<th>Servicios de ajuste</th>' : ''}${showDur ? '<th>Duración</th>' : ''}${showDto ? '<th>Descuento</th>' : ''}<th>Factura</th><th>Ahorro</th><th>Ahorro anual</th></tr>`;
  const empty = (showSS ? '<td>—</td>' : '') + (showDur ? '<td>—</td>' : '') + (showDto ? '<td>—</td>' : '');
  const condRows = `<tr class="act"><td>Tu situación actual<span class="tag2">${esc([m.actual.brand, m.actual.sub].filter(Boolean).join(' · '))}</span></td>${empty}<td>${E(m.actual.total)}</td><td>—</td><td>—</td></tr>`
    + m.offers.map(o => `<tr><td>${esc(o.label)}<span class="tag2">${esc(o.sub)}</span></td>
      ${showSS ? `<td>${ssTxt(o)}</td>` : ''}${showDur ? `<td>${esc(v2Dur(o)) || '—'}</td>` : ''}${showDto ? `<td>${o.dtoPct > 0.0001 ? nf(o.dtoPct, 0) + ' %' : '—'}</td>` : ''}
      <td>${E(o.total)}</td><td class="${o.saving > 0 ? 'pos' : 'neg'}">${o.saving > 0 ? '+' : '−'}${E(Math.abs(o.saving))}</td>
      <td>${o.saving > 0 && o.annual > 0 ? '≈ ' + nf(o.annual, 0) + ' €' : '—'}</td></tr>`).join('');

  // ---- ¿de dónde sale el ahorro?
  const cols = [{ t: 'Actual', d: m.actual }];
  if (m.bestFix) cols.push({ t: `${m.bestFix.label} · Fijo`, d: m.bestFix });
  if (m.bestIdx) cols.push({ t: `${m.bestIdx.label} · Indexado`, d: m.bestIdx });
  const hasDto = cols.some(c => c.d.dtoAmt > 0.005);
  const CON = gas
    ? [['pot', 'Término fijo', '#2563eb'], ['ene', hasDto ? 'Consumo de gas (con dto.)' : 'Consumo de gas', '#f59e0b'], ['serv', 'Servigas', '#14b8a6'], ['ie', 'Imp. hidrocarburos', '#8b5cf6'],
       ['alq', 'Alquiler de equipo', '#64748b'], ['iva', 'IVA', '#94a3b8'], ['otros', 'Otros', '#d4d8df']]
    : [['pot', 'Potencia', '#2563eb'], ['ene', hasDto ? 'Energía (con dto.)' : 'Energía', '#f59e0b'], ['serv', 'Servicios de ajuste', '#14b8a6'], ['cm', 'Costes de mercado', '#ec4899'],
       ['react', 'Energía reactiva', '#f97316'], ['exc', 'Exceso de potencia', '#ef4444'], ['ie', 'Imp. eléctrico', '#8b5cf6'], ['alq', 'Alquiler de equipo', '#64748b'],
       ['bono', 'Bono social', '#0ea5e9'], ['iva', 'IVA', '#94a3b8'], ['otros', 'Otros', '#d4d8df']];
  const con = CON.filter(([k]) => cols.some(c => Math.abs(c.d[k]) >= 0.005));
  const maxC = Math.max(...cols.map(c => c.d.total));
  const stack = cols.map(c => `<div class="brs"><div class="n">${esc(c.t)}</div><div class="trk">${con.map(([k, , colr]) => c.d[k] > 0 ? `<div class="seg" style="width:${c.d[k] / maxC * 100}%;background:${colr}"></div>` : '').join('')}</div><div class="val">${E(c.d.total)}</div></div>`).join('');
  const legC = con.map(([, t, colr]) => `<span><i style="background:${colr}"></i>${t}</span>`).join('');
  const dtoRow = hasDto ? `<tr class="ex"><td>Descuento aplicado</td>${cols.map(c => `<td>${c.d.dtoAmt > 0.005 ? '−' + E2(c.d.dtoAmt) + ' (' + nf(c.d.dtoPct, 0) + ' %)' : '—'}</td>`).join('')}</tr>` : '';
  const kwhRow = sh.kwh > 0 ? `<tr class="ex"><td>Coste medio por kWh</td>${cols.map(c => `<td>${nf(c.d.total / sh.kwh, 3)} €</td>`).join('')}</tr>` : '';
  const tbl = `<table><thead><tr><th></th>${cols.map(c => `<th>${esc(c.t)}</th>`).join('')}</tr></thead><tbody>
    ${con.map(([k, t]) => `<tr><td>${t}</td>${cols.map(c => `<td>${E(c.d[k])}</td>`).join('')}</tr>`).join('')}
    <tr class="tot"><td>Total factura</td>${cols.map(c => `<td>${E(c.d.total)}</td>`).join('')}</tr>${dtoRow}${kwhRow}</tbody></table>`;
  const cmpTxt = cols.length === 3 ? 'la mejor oferta de precio fijo y la mejor de indexado' : cols.length === 2 ? 'la mejor oferta' : 'las ofertas';

  // ---- precios por periodo (luz) o precios del gas
  const names = cols.map((c, i) => (i === 0 ? 'Hoy' : c.d.type === 'idx' ? 'Indexado' : 'Fijo'));
  let prices = '';
  if (!gas && sh.periods.length) {
    const pr = (c, key, p) => { const v = c.d[key][p.n]; return v === null || v === undefined ? '—' : nf(v, 4); };
    const nm = cols.slice(1).map(c => esc(c.t)).join(' y ');
    prices = `<div class="blk"><div class="box"><h2>Precios por periodo</h2>
      <p class="d">Tu potencia contratada y tu consumo en cada periodo, con los precios de hoy${nm ? ' y los de ' + nm : ''}.</p>
      <table class="pp"><thead><tr><th rowspan="2">Periodo</th><th rowspan="2">kW contr.</th><th rowspan="2">kWh periodo</th><th colspan="${cols.length}" class="grp">Potencia (€/kW·mes)</th><th colspan="${cols.length}" class="grp">Energía (€/kWh)</th></tr>
      <tr>${names.map(n => `<th>${n}</th>`).join('')}${names.map(n => `<th>${n}</th>`).join('')}</tr></thead><tbody>
      ${sh.periods.map(p => `<tr><td>${p.label}</td><td>${p.kw != null ? kwf(p.kw) : '—'}</td><td>${p.kwh != null ? nf(p.kwh, 0) : '—'}</td>${cols.map(c => `<td>${pr(c, 'potP', p)}</td>`).join('')}${cols.map(c => `<td>${pr(c, 'eneP', p)}</td>`).join('')}</tr>`).join('')}
      </tbody></table>${cols.slice(1).some(c => c.d.type === 'idx') ? '<p class="d" style="margin-top:10px">En las ofertas indexadas, el precio de la energía no incluye el coste de la energía en el mercado: se factura aparte como «Costes de mercado».</p>' : ''}</div></div>`;
  } else if (gas && cols.some(c => c.d.fixedP !== null || c.d.gasP !== null)) {
    const f = (v, d) => (v === null || v === undefined ? '—' : nf(v, d));
    prices = `<div class="blk"><div class="box"><h2>Precios del gas</h2>
      <p class="d">Precios de hoy frente a los de ${cols.slice(1).map(c => esc(c.t)).join(' y ') || 'las ofertas'}.</p>
      <table class="pp"><thead><tr><th></th>${names.map(n => `<th>${n}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Término fijo (€/mes)</td>${cols.map(c => `<td>${f(c.d.fixedP, 2)}</td>`).join('')}</tr>
      <tr><td>Precio del gas (€/kWh)</td>${cols.map(c => `<td>${f(c.d.gasP, 4)}</td>`).join('')}</tr>
      ${cols.some(c => c.d.dtoPct > 0.0001) ? `<tr><td>Descuento</td>${cols.map(c => `<td>${c.d.dtoPct > 0.0001 ? nf(c.d.dtoPct, 0) + ' %' : '—'}</td>`).join('')}</tr>` : ''}
      </tbody></table></div></div>`;
  }

  const a = advisorV2();
  const adv = a ? `<br><b>Tu asesor:</b> ${esc([a.name, a.email, a.mobile || a.office].filter(Boolean).join(' · '))}` : '';
  const ssNote = m.offers.some(o => /^(CCAA|SSAA)$/i.test(o.ss || '')) ? `<br>${esc(V2_SS_NOTE)}` : '';
  const baseTxt = period ? `el consumo de ${esc(period)}` : 'el consumo de la factura analizada';

  return `<div class="rep v2">
  <div class="blk"><div class="head"><div><h1>Ahorro en tu factura de ${gas ? 'gas' : 'luz'}</h1><div class="sub">${esc(sub)}</div></div><img class="logo" src="img/logo.png" alt=""></div>
    <div class="kpis">${actKpi}${kpi('Mejor ahorro con precio fijo', m.bestFix, 'fix', 'fix')}${kpi('Mejor ahorro con indexado', m.bestIdx, 'idx', 'idx')}</div></div>
  ${factsBlk}
  <div class="blk"><div class="box"><h2>¿Cuánto te ahorras con cada oferta?</h2>
    <p class="d">Ahorro en euros ${period ? 'durante ' + esc(period) : 'en esta factura'} frente a tu factura actual.</p>
    <div class="legend">${leg}</div><div class="bars">${rowsA}</div></div></div>
  <div class="blk"><div class="box"><h2>Lo que pagarías con cada oferta</h2>
    <p class="d">Importe total de la factura (con IVA) según la oferta elegida.</p>
    <div class="stack">${rowsB}</div></div></div>
  <div class="blk"><div class="box"><h2>Condiciones de cada oferta</h2>
    <p class="d">Tipo de precio, servicios de ajuste, duración y descuento de cada comercializadora.</p>
    <table class="cmp"><thead>${condHead}</thead><tbody>${condRows}</tbody></table></div></div>
  <div class="blk"><div class="box"><h2>¿De dónde sale el ahorro?</h2>
    <p class="d">Desglose de tu factura: situación actual frente a ${cmpTxt}.</p>
    <div class="legend">${legC}</div><div class="stack">${stack}</div>${tbl}</div></div>
  ${prices}
  <div class="blk"><div class="foot">Ahorro calculado con ${baseTxt}. Las ofertas indexadas dependen del precio del mercado, por lo que su importe puede variar en cada factura; las de precio fijo mantienen el precio pactado. Simulación orientativa: los precios pueden cambiar hasta la contratación.${ssNote}${adv}</div></div>
  </div>`;
}

function renderPower(p) {
  const E = v => nf(v, 2) + ' €';
  const kw = v => nf(v, Number.isInteger(v) ? 0 : 2);
  const who = (S.opts.clientEdited ? S.opts.client : (p.holder || S.opts.client) || '').trim();
  const sub = [who, p.cups ? 'CUPS ' + p.cups : '', 'Tarifa ' + p.tariff].filter(Boolean).join(' · ')
    + (p.days ? ` (${nf(p.days, Number.isInteger(p.days) ? 0 : 2)} días facturados)` : '');
  const pct = p.totalOldIva ? (p.totalOldIva - p.totalNewIva) / p.totalOldIva : 0;
  const good = p.savMIva > 0.005;
  const per = p.periods.filter(x => x.kwOld > 0 || x.kwNew > 0);
  const maxKw = Math.max(...per.map(x => Math.max(x.kwOld, x.kwNew)), 1);
  const maxT = Math.max(p.totalOldIva, p.totalNewIva, 1);

  const kpi3 = good
    ? `<div class="kpi"><div class="l">Ahorro mensual</div><div class="v fix">${E(p.savMIva)}</div><div class="s">${fmtP(pct)}% menos en potencia · IVA incluido</div>${p.savAIva > 0 ? `<div class="s2">≈ ${E(p.savAIva)} al año</div>` : ''}</div>`
    : `<div class="kpi"><div class="l">${p.savMIva < -0.005 ? 'Sobrecoste mensual' : 'Ahorro mensual'}</div><div class="v ${p.savMIva < -0.005 ? 'neg' : 'none'}">${p.savMIva < -0.005 ? '−' + E(Math.abs(p.savMIva)) : '—'}</div><div class="s">${p.savMIva < -0.005 ? 'La nueva potencia cuesta más' : 'Sin cambios en el coste'}</div></div>`;

  const rowsKw = per.map(x => {
    const d = x.kwNew - x.kwOld;
    const dTxt = Math.abs(d) < 1e-9 ? 'sin cambios' : `${d < 0 ? '−' : '+'}${kw(Math.abs(d))} kW`;
    const dCls = Math.abs(d) < 1e-9 ? 'muted' : d < 0 ? 'pos' : 'neg';
    return `<div class="brp"><div class="n">${x.label}</div>
      <div class="twin"><div class="trk"><div class="fl" style="width:${x.kwOld / maxKw * 100}%;background:${COL.act}"></div></div>
      <div class="trk"><div class="fl" style="width:${x.kwNew / maxKw * 100}%;background:${COL.fix}"></div></div></div>
      <div class="val">${kw(x.kwOld)} → ${kw(x.kwNew)} kW<small class="${dCls}">${dTxt}</small></div></div>`;
  }).join('');

  const stack = `<div class="brs"><div class="n">Actual<small style="display:block;font-size:11px;font-weight:500;color:#64748b">Tu potencia hoy</small></div>
      <div class="trk"><div class="fl" style="width:${p.totalOldIva / maxT * 100}%;background:${COL.act}"></div></div><div class="val">${E(p.totalOldIva)}</div></div>
    <div class="brs"><div class="n">Con ajuste<small style="display:block;font-size:11px;font-weight:500;color:#64748b">Potencia nueva</small></div>
      <div class="trk"><div class="fl" style="width:${p.totalNewIva / maxT * 100}%;background:${COL.fix}"></div></div><div class="val">${E(p.totalNewIva)}</div></div>`;

  const sv = v => `<td class="${v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : ''}">${v > 0.005 ? '+' : v < -0.005 ? '−' : ''}${E(Math.abs(v))}</td>`;
  const tbl = `<table class="pw"><thead><tr><th>Periodo</th><th>kW hoy</th><th>kW nueva</th><th>€/kW·día</th><th>Coste hoy</th><th>Coste nuevo</th><th>Ahorro</th></tr></thead><tbody>
    ${per.map(x => `<tr><td>${x.label}</td><td>${kw(x.kwOld)}</td><td>${kw(x.kwNew)}</td><td>${nf(x.price, 6)}</td><td>${E(x.costOld)}</td><td>${E(x.costNew)}</td>${sv(x.costOld - x.costNew)}</tr>`).join('')}
    <tr class="sub"><td colspan="4">Total potencia (sin IVA)</td><td>${E(p.totalOld)}</td><td>${E(p.totalNew)}</td>${sv(p.totalOld - p.totalNew)}</tr>
    <tr><td colspan="4">IVA (${nf(p.rate * 100, 0)}%)</td><td>${E(p.ivaOld)}</td><td>${E(p.ivaNew)}</td>${sv(p.ivaOld - p.ivaNew)}</tr>
    <tr class="tot"><td colspan="4">Total con IVA</td><td>${E(p.totalOldIva)}</td><td>${E(p.totalNewIva)}</td>${sv(p.totalOldIva - p.totalNewIva)}</tr></tbody></table>`;
  const sum = `<div class="sum">
    <div class="${p.savMIva < 0 ? 'bad' : ''}"><span>Ahorro mensual</span><b>${E(p.savMIva)}</b><small>Sin IVA: ${E(p.savM)}</small></div>
    <div class="${p.savAIva < 0 ? 'bad' : ''}"><span>Ahorro anual estimado</span><b>${E(p.savAIva)}</b><small>Sin IVA: ${E(p.savA)}</small></div></div>`;

  const noteBlk = p.note ? `<div class="blk"><div class="box note"><h2>A tener en cuenta</h2><p>${esc(p.note)}</p></div></div>` : '';
  const contact = p.contact && p.contact.length ? `<br><b>Argieder</b> · ${esc(p.contact.join(' · '))}` : '';
  return `<div class="rep">
  <div class="blk"><div class="head"><div><h1>Ahorro con el ajuste de potencia</h1><div class="sub">${esc(sub)}</div></div><img class="logo" src="img/logo.png" alt=""></div>
    <div class="kpis">
      <div class="kpi"><div class="l">Pagas hoy por potencia</div><div class="v">${E(p.totalOldIva)}</div><div class="s">${p.days ? nf(p.days, Number.isInteger(p.days) ? 0 : 2) + ' días, ' : ''}IVA incluido</div></div>
      <div class="kpi"><div class="l">Pagarías con el ajuste</div><div class="v idx">${E(p.totalNewIva)}</div><div class="s">IVA incluido</div></div>
      ${kpi3}
    </div></div>
  <div class="blk"><div class="box"><h2>¿Qué potencia contratarías?</h2>
    <p class="d">Potencia contratada hoy frente a la potencia que se contrataría en cada periodo (kW).</p>
    <div class="legend"><span><i style="background:${COL.act}"></i>Actual</span><span><i style="background:${COL.fix}"></i>Con ajuste</span></div>
    <div class="bars">${rowsKw}</div></div></div>
  <div class="blk"><div class="box"><h2>¿Cuánto pagas de potencia?</h2>
    <p class="d">Coste de la potencia en el periodo facturado: situación actual frente a la potencia nueva.</p>
    <div class="stack">${stack}</div>${tbl}${sum}</div></div>
  ${noteBlk}
  <div class="blk"><div class="foot">Ahorro calculado con ${p.days ? nf(p.days, Number.isInteger(p.days) ? 0 : 2) + ' días de facturación' : 'el periodo facturado'}; el ahorro anual se estima a partir del mensual (365 días). Simulación orientativa: los precios de la potencia pueden variar.${contact}</div></div>
  </div>`;
}

function renderReport() {
  const parts = [];
  if (S.sel) parts.push(renderComparison());
  if (S.vsel) parts.push(renderComparisonV2());
  powerList().forEach(p => parts.push(renderPower(p)));
  if (!parts.length) return;
  $('report').innerHTML = parts.join('');
  $('previewWrap').hidden = false;
}

/* ===== Paginación A4: los cortes de página solo se hacen entre bloques ===== */
// Devuelve los tramos [top, bottom] (en px del informe) que van en cada página.
function pageRanges(rep, maxPx) {
  const base = rep.getBoundingClientRect().top;
  const units = [];
  const collect = el => {
    const r = el.getBoundingClientRect();
    const top = r.top - base, bottom = r.bottom - base;
    if (bottom - top > maxPx && el.children.length) { [...el.children].forEach(collect); return; } // no cabe en una hoja: se baja a sus partes
    units.push({
      top, bottom,
      keepNext: el.matches('h2, .d, .legend, .sh'),                 // títulos: siempre pegados a lo que les sigue
      foot: el.classList.contains('foot') || !!el.querySelector('.foot') // nota final: pegada a lo anterior
    });
  };
  [...rep.children].forEach(collect);
  // Agrupar: título + contenido, y nota final + bloque anterior (si caben juntos)
  const groups = [];
  let carry = null;
  for (const u of units) {
    let g = u;
    if (carry) { g = { top: carry.top, bottom: u.bottom, keepNext: u.keepNext, foot: u.foot }; carry = null; }
    if (g.foot && groups.length) {
      const prev = groups[groups.length - 1];
      if (g.bottom - prev.top <= maxPx) { prev.bottom = g.bottom; continue; }
    }
    if (g.keepNext) { carry = g; continue; }
    groups.push(g);
  }
  if (carry) groups.push(carry);
  // Rellenar hojas: cada hoja termina siempre entre dos bloques
  const pages = [];
  let cur = null;
  for (const g of groups) {
    if (!cur) cur = { top: g.top, bottom: g.bottom };
    else if (g.bottom - cur.top <= maxPx) cur.bottom = g.bottom;
    else { pages.push(cur); cur = { top: g.top, bottom: g.bottom }; }
  }
  if (cur) pages.push(cur);
  return pages;
}

/* ===== PDF (hojas A4, cortes limpios entre bloques) ===== */
async function makePdf() {
  if (!window.html2canvas || !window.jspdf) throw new Error('lib');
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const { jsPDF } = window.jspdf;
  const reps = [...document.querySelectorAll('#report > .rep')];
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 12, contentW = W - 2 * M, maxH = H - 2 * M;
  let first = true;
  for (const rep of reps) {
    const cv = await html2canvas(rep, { scale: 2, backgroundColor: '#f5f6f8', useCORS: true, logging: false });
    const rr = rep.getBoundingClientRect();
    const mmPerPx = contentW / rr.width, ratio = cv.height / rr.height;
    for (const r of pageRanges(rep, maxH / mmPerPx)) {
      const sy = Math.max(0, Math.round(r.top * ratio));
      const sh = Math.min(cv.height - sy, Math.round((r.bottom - r.top) * ratio));
      const piece = document.createElement('canvas');
      piece.width = cv.width; piece.height = sh;
      const ctx = piece.getContext('2d');
      ctx.fillStyle = '#f5f6f8'; ctx.fillRect(0, 0, piece.width, piece.height);
      ctx.drawImage(cv, 0, sy, cv.width, sh, 0, 0, cv.width, sh);
      let w = contentW, h = sh * contentW / cv.width;
      if (h > maxH) { const k = maxH / h; w *= k; h = maxH; }   // solo si un único bloque no cabe en una hoja
      if (!first) doc.addPage('a4', 'p');
      first = false;
      doc.setFillColor(245, 246, 248);
      doc.rect(0, 0, W, H, 'F');
      doc.addImage(piece.toDataURL('image/jpeg', 0.95), 'JPEG', (W - w) / 2, M, w, h);
    }
  }

  const slug = (S.opts.client || (S.sel && S.sel.client) || (S.vsel && S.vsel.client) || (powerList()[0] && powerList()[0].holder) || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'cliente';
  const filename = `${(!S.sel && !S.vsel && S.psheets.length) ? 'Informe_potencia' : 'Informe_ahorro'}_${slug}.pdf`;
  let dl = null;
  try { if (window.claude && typeof window.claude.use === 'function') dl = await window.claude.use('downloads'); } catch (e) { dl = null; }
  if (dl) { await dl.save({ filename, data: doc.output('blob') }); }
  else { doc.save(filename); }
}
function pdfError(e) {
  if (e && e.code === 'declined') return ['Descarga cancelada.', ''];
  if (e && e.message === 'lib') return ['No se han podido cargar las herramientas de PDF. Revisa la conexión y recarga la página.', 'err'];
  return ['No he podido generar el PDF. Inténtalo de nuevo.', 'err'];
}

/* ===== Interfaz ===== */
function status(msg, cls) { const s = $('status'); s.textContent = msg || ''; s.className = cls || ''; }
const fmtSize = b => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB');

function refreshState() {
  const any = S.sheets.length || S.psheets.length || S.vsheets.length;
  $('adv').hidden = true; $('previewWrap').hidden = true; $('go').disabled = !any;
}
function resetComp() {
  S.file = null; S.sheets = []; S.sel = null; S.opts = { client: '', period: '', showNames: false, types: {} };
  $('file').value = ''; $('fileInfo').hidden = true; $('picker').hidden = true;
  refreshState(); status('');
}
// hojas de potencia que entran en el informe: la elegida, o todas si se elige "Todas" (o solo hay una)
function powerList() { return S.psheets.length < 2 ? S.psheets : (S.psel && S.psel !== 'all' ? [S.psel] : S.psheets); }

function resetPow() {
  S.pfile = null; S.psheets = []; S.psel = null;
  $('fileP').value = ''; $('fileInfoP').hidden = true; $('pickerP').hidden = true;
  refreshState(); status('');
}

function resetV() {
  S.vfile = null; S.vsheets = []; S.vsel = null; S.vadv = []; S.vopts = { showNames: true, types: {}, adv: '' };
  $('fileV').value = ''; $('fileInfoV').hidden = true; $('pickerV').hidden = true;
  refreshState(); status('');
}

async function loadV2(f) {
  if (!f) return;
  if (!/\.(xlsx|xlsm|xls)$/i.test(f.name)) { status('Ese archivo no es un Excel (.xlsx). Prueba con otro.', 'err'); return; }
  resetV(); S.vfile = f;
  $('fnmV').textContent = f.name; $('fszV').textContent = fmtSize(f.size); $('fileInfoV').hidden = false;
  if (!window.XLSX) { status('No se ha podido cargar el lector de Excel. Revisa la conexión y recarga la página.', 'err'); return; }
  status('Leyendo el Excel…');
  try {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellStyles: true });
    const all = parseWorkbookV2(wb);
    S.vsheets = all.filter(s => !s.error); S.vadv = all.advisors || [];
    if (!S.vsheets.length) {
      if (!all.length && parsePowerWorkbook(wb).some(s => !s.error)) { status('Este Excel es de ajuste de potencia. Súbelo en el cuadro “Ajuste de potencia”.', 'err'); return; }
      status(all.some(s => s.error)
        ? 'El Excel no trae los importes calculados. Ábrelo en Excel, guárdalo (Ctrl+G) y vuelve a subirlo.'
        : 'No he encontrado ninguna simulación de luz o gas en este archivo.', 'err');
      return;
    }
    status(`${S.vsheets.length === 1 ? 'Simulación V2 encontrada' : S.vsheets.length + ' simulaciones V2 encontradas'}. Pulsa “Convertir a PDF”.`);
    $('go').disabled = false;
  } catch (e) { status('No he podido leer el archivo. ¿Está dañado o protegido con contraseña?', 'err'); }
}

async function loadFile(f) {
  if (!f) return;
  if (!/\.(xlsx|xlsm|xls)$/i.test(f.name)) { status('Ese archivo no es un Excel (.xlsx). Prueba con otro.', 'err'); return; }
  resetComp(); S.file = f;
  $('fnm').textContent = f.name; $('fsz').textContent = fmtSize(f.size); $('fileInfo').hidden = false;
  if (!window.XLSX) { status('No se ha podido cargar el lector de Excel. Revisa la conexión y recarga la página.', 'err'); return; }
  status('Leyendo el Excel…');
  try {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    const all = parseWorkbook(wb);
    S.sheets = all.filter(s => !s.error);
    if (!S.sheets.length) {
      if (!all.length && parsePowerWorkbook(wb).some(s => !s.error)) { status('Este Excel es de ajuste de potencia. Súbelo en el cuadro “Ajuste de potencia”.', 'err'); return; }
      status(all.some(s => s.error)
        ? 'El Excel no trae los importes calculados. Ábrelo en Excel, guárdalo (Ctrl+G) y vuelve a subirlo.'
        : 'No he encontrado ninguna simulación de luz o gas en este archivo.', 'err');
      return;
    }
    status(`${S.sheets.length === 1 ? 'Simulación encontrada' : S.sheets.length + ' simulaciones encontradas'}. Pulsa “Convertir a PDF”.`);
    $('go').disabled = false;
  } catch (e) { status('No he podido leer el archivo. ¿Está dañado o protegido con contraseña?', 'err'); }
}


async function loadPower(f) {
  if (!f) return;
  if (!/\.(xlsx|xlsm|xls)$/i.test(f.name)) { status('Ese archivo no es un Excel (.xlsx). Prueba con otro.', 'err'); return; }
  resetPow(); S.pfile = f;
  $('fnmP').textContent = f.name; $('fszP').textContent = fmtSize(f.size); $('fileInfoP').hidden = false;
  if (!window.XLSX) { status('No se ha podido cargar el lector de Excel. Revisa la conexión y recarga la página.', 'err'); return; }
  status('Leyendo el Excel…');
  try {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    const all = parsePowerWorkbook(wb);
    S.psheets = all.filter(s => !s.error);
    const empty = all.filter(s => s.error === 'vacia').map(s => s.name);
    const notes = all.filter(s => s.error === 'vacia' || s.error === 'sin_tabla' || s.error === 'sin_valores')
      .map(s => `${s.name} (${s.error === 'vacia' ? 'sin rellenar: ' + (s.cells || []).map(c => c.a + (c.v === '' ? ' vacía' : ' = ' + c.v)).join(', ') : 'no he podido leer su tabla'})`);
    if (!S.psheets.length) {
      if (notes.length && empty.length) status(`No se incluye: ${notes.join(', ')}. Rellena la potencia contratada y la potencia a contratar.`, 'err');
      else if (all.some(s => s.error)) status('El Excel no trae los importes calculados. Ábrelo en Excel, guárdalo (Ctrl+G) y vuelve a subirlo.', 'err');
      else if (parseWorkbook(wb).some(s => !s.error)) status('Este Excel es una comparativa de comercializadoras. Súbelo en el cuadro “Comparativa de comercializadoras”.', 'err');
      else status('No he encontrado datos de potencia. ¿Has rellenado la potencia contratada y la nueva?', 'err');
      return;
    }
    status(`Ajuste de potencia encontrado (${S.psheets.map(s => s.tariff).join(' y ')}).${notes.length ? ' No se incluye: ' + notes.join(', ') + '.' : ''} Pulsa “Convertir a PDF”.`);
    $('go').disabled = false;
  } catch (e) { status('No he podido leer el archivo. ¿Está dañado o protegido con contraseña?', 'err'); }
}

function showPicker(msg) {
  $('pickMsg').textContent = msg;
  $('chips').innerHTML = S.sheets.map((s, i) => `<button class="chip${S.sel === s ? ' on' : ''}" data-i="${i}">${esc(s.name)} <small>· ${esc(s.client || 'sin nombre de cliente')}</small></button>`).join('');
  $('picker').hidden = false;
}

function showPickerP(msg) {
  $('pickMsgP').textContent = msg;
  $('chipsP').innerHTML = S.psheets.map((s, i) => `<button class="chip${S.psel === s ? ' on' : ''}" data-i="${i}">${esc(s.name)} <small>· ${esc(s.holder || 'sin titular')}</small></button>`).join('')
    + `<button class="chip${S.psel === 'all' ? ' on' : ''}" data-i="all">Todas <small>· un informe por hoja</small></button>`;
  $('pickerP').hidden = false;
}

function showPickerV(msg) {
  $('pickMsgV').textContent = msg;
  $('chipsV').innerHTML = S.vsheets.map((s, i) => `<button class="chip${S.vsel === s ? ' on' : ''}" data-i="${i}">${esc(s.name)} <small>· ${esc(s.client || (s.cols.length - 1) + ' ofertas')}</small></button>`).join('');
  $('pickerV').hidden = false;
}

function prepareOptions() {
  const sh = S.sel, ps = powerList()[0], vs = S.vsel;
  S.opts.client = S.opts.client || (sh && sh.client) || (vs && vs.client) || (ps && ps.holder) || '';
  if (vs && !sh && !S.opts.period && vs.periodTxt) S.opts.period = vs.periodTxt;
  $('oClient').value = S.opts.client; $('oPeriod').value = S.opts.period || '';
  $('oPeriod').closest('label').hidden = !(sh || vs);
  // comparativa de comercializadoras (V1)
  if (!sh) { $('namesRow').hidden = true; $('typesTbl').innerHTML = ''; }
  else {
    const hasBrand = sh.cols.some(c => c.brand);
    $('namesRow').hidden = !hasBrand; $('oNames').checked = S.opts.showNames;
    const m = buildModel(sh, { types: S.opts.types, showNames: false });
    $('typesTbl').innerHTML = `<thead><tr><th>Oferta</th><th>Columna</th><th>Tipo</th></tr></thead><tbody>` + m.offers.map(o =>
      `<tr><td>${esc(o.label)}${o.brand ? ` <span class="tag">(${esc(o.brand)})</span>` : ''}</td><td>${o.letter}${o.typeText ? ` <span class="tag">· ${esc(o.typeText)}</span>` : ''}</td>
       <td><select data-col="${o.letter}"><option value="fix"${o.type === 'fix' ? ' selected' : ''}>Precio fijo</option><option value="idx"${o.type === 'idx' ? ' selected' : ''}>Indexado</option></select></td></tr>`).join('') + '</tbody>';
  }
  // comparativa V2
  if (!vs) { $('namesRowV').hidden = true; $('typesTblV').innerHTML = ''; $('advRow').hidden = true; }
  else {
    $('namesRowV').hidden = !vs.hasBrands; $('oNamesV').checked = S.vopts.showNames;
    const m = buildModelV2(vs, { types: S.vopts.types, showNames: false });
    $('typesTblV').innerHTML = `<thead><tr><th>Oferta (V2)</th><th>Columna</th><th>Tipo</th></tr></thead><tbody>` + m.offers.map(o =>
      `<tr><td>${esc(o.label)}${o.brand ? ` <span class="tag">(${esc(o.brand)})</span>` : ''}</td><td>${o.letter}${o.typeText ? ` <span class="tag">· ${esc(v2Pretty(o.typeText))}</span>` : ''}</td>
       <td><select data-col="${o.letter}"><option value="fix"${o.type === 'fix' ? ' selected' : ''}>Precio fijo</option><option value="idx"${o.type === 'idx' ? ' selected' : ''}>Indexado</option></select></td></tr>`).join('') + '</tbody>';
    $('advRow').hidden = !S.vadv.length;
    if (S.vadv.length) {
      const own = vs.advisor && vs.advisor.name;
      $('oAdv').innerHTML = `<option value="">${own ? 'Según el Excel (' + esc(own) + ')' : 'Sin asesor en el informe'}</option>` + S.vadv.map((a, i) => `<option value="${i}">${esc(a.name)}</option>`).join('');
      $('oAdv').value = S.vopts.adv;
    }
  }
  $('adv').hidden = false;
}

async function convert() {
  const btn = $('go'); btn.disabled = true;
  try {
    if (S.sheets.length && !S.sel) {
      const named = S.sheets.filter(s => s.client);
      if (S.sheets.length === 1) S.sel = S.sheets[0];
      else if (named.length === 1) S.sel = named[0];
      else { showPicker('Hay varias simulaciones en este Excel. ¿Cuál quieres convertir?'); status(''); btn.disabled = false; return; }
    }
    $('picker').hidden = S.sheets.length < 2;
    if (S.sheets.length > 1 && S.sel) showPicker('Simulación elegida (puedes cambiarla):');
    if (S.vsheets.length && !S.vsel) {
      const named = S.vsheets.filter(s => s.client);
      if (S.vsheets.length === 1) S.vsel = S.vsheets[0];
      else if (named.length === 1) S.vsel = named[0];
      else { showPickerV('Hay varias simulaciones en el Excel V2. ¿Cuál quieres convertir?'); status(''); btn.disabled = false; return; }
    }
    $('pickerV').hidden = S.vsheets.length < 2;
    if (S.vsheets.length > 1 && S.vsel) showPickerV('Simulación V2 elegida (puedes cambiarla):');
    if (S.psheets.length > 1 && !S.psel) { showPickerP('Hay varias hojas de potencia en este Excel. ¿Cuál quieres convertir?'); status(''); btn.disabled = false; return; }
    $('pickerP').hidden = S.psheets.length < 2;
    if (S.psheets.length > 1 && S.psel) showPickerP('Hoja de potencia elegida (puedes cambiarla):');
    status('Generando el informe…');
    prepareOptions(); renderReport();
    await new Promise(r => setTimeout(r, 60));
    await makePdf();
    status('PDF descargado ✓', 'ok');
  } catch (e) { const [m, c] = pdfError(e); status(m, c); }
  btn.disabled = false;
}

const drop = $('drop'), fin = $('file');
drop.addEventListener('click', () => fin.click());
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fin.click(); } });
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { if (!drop.contains(e.target)) e.preventDefault(); });
fin.addEventListener('change', () => loadFile(fin.files[0]));
$('rm').addEventListener('click', resetComp);
$('go').addEventListener('click', convert);
$('chips').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  S.sel = S.sheets[+b.dataset.i]; S.opts.client = ''; S.opts.types = {}; convert();
});
$('oClient').addEventListener('input', e => { S.opts.client = e.target.value; S.opts.clientEdited = true; renderReport(); });
$('oPeriod').addEventListener('input', e => { S.opts.period = e.target.value; renderReport(); });
$('oNames').addEventListener('change', e => { S.opts.showNames = e.target.checked; renderReport(); prepareOptionsKeep(); });
function prepareOptionsKeep() { const c = $('oClient').value, p = $('oPeriod').value; prepareOptions(); $('oClient').value = c; $('oPeriod').value = p; }
$('typesTbl').addEventListener('change', e => {
  const s = e.target.closest('select'); if (!s) return;
  S.opts.types[s.dataset.col] = s.value; renderReport(); prepareOptionsKeep();
});
async function downloadNow() { status('Generando el PDF…'); try { await makePdf(); status('PDF descargado ✓', 'ok'); } catch (e) { const [m, c] = pdfError(e); status(m, c); } }
$('regen').addEventListener('click', () => { renderReport(); downloadNow(); });
$('dl').addEventListener('click', downloadNow);

/* ===== Cuadro del Excel de ajuste de potencia ===== */
const dropP = $('dropP'), finP = $('fileP');
dropP.addEventListener('click', () => finP.click());
dropP.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finP.click(); } });
['dragenter', 'dragover'].forEach(ev => dropP.addEventListener(ev, e => { e.preventDefault(); dropP.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => dropP.addEventListener(ev, e => { e.preventDefault(); dropP.classList.remove('over'); }));
dropP.addEventListener('drop', e => loadPower(e.dataTransfer.files[0]));
finP.addEventListener('change', () => loadPower(finP.files[0]));
$('rmP').addEventListener('click', resetPow);

/* ===== Cuadro de la comparativa V2 (Excel de Verónica) ===== */
const dropV = $('dropV'), finV = $('fileV');
dropV.addEventListener('click', () => finV.click());
dropV.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finV.click(); } });
['dragenter', 'dragover'].forEach(ev => dropV.addEventListener(ev, e => { e.preventDefault(); dropV.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => dropV.addEventListener(ev, e => { e.preventDefault(); dropV.classList.remove('over'); }));
dropV.addEventListener('drop', e => loadV2(e.dataTransfer.files[0]));
finV.addEventListener('change', () => loadV2(finV.files[0]));
$('rmV').addEventListener('click', resetV);
$('chipsV').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  S.vsel = S.vsheets[+b.dataset.i]; S.opts.client = ''; S.vopts.types = {}; S.vopts.adv = ''; convert();
});
$('oNamesV').addEventListener('change', e => { S.vopts.showNames = e.target.checked; renderReport(); prepareOptionsKeep(); });
$('oAdv').addEventListener('change', e => { S.vopts.adv = e.target.value; renderReport(); });
$('typesTblV').addEventListener('change', e => {
  const s = e.target.closest('select'); if (!s) return;
  S.vopts.types[s.dataset.col] = s.value; renderReport(); prepareOptionsKeep();
});

$('chipsP').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  S.psel = b.dataset.i === 'all' ? 'all' : S.psheets[+b.dataset.i]; convert();
});
