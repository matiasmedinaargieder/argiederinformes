/* ===== Lectura del Excel (formato original y formato actualizado) ===== */
const N = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[_\-]{3,}/g, '').replace(/\s+/g, ' ').trim();
const cellOf = (ws, r, c) => ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
const numAt = (ws, r, c) => { const x = cellOf(ws, r, c); return x && x.t === 'n' && isFinite(x.v) ? x.v : null; };
const strAt = (ws, r, c) => { const x = cellOf(ws, r, c); return x && typeof x.v === 'string' ? x.v.trim() : ''; };

function findRow(ws, re, maxR) {
  for (let r = 1; r <= maxR; r++)
    for (const c of [1, 2]) { const s = strAt(ws, r, c); if (s && re.test(N(s))) return r; }
  return 0;
}

const ROW_RE = {
  elec: { tpot: /^total pot/, tte: /^total (te|energia)/, tdto: /^(total dto|importe del descuento)/,
          ie: /^(i\. ?electrico|impuesto electrico)/, iva: /^iva$/, cm: /^(total )?costes? (de )?mercad/,
          total: /^total factura/, sav: /^ahorro (en esta )?factura/, ann: /^ahorro anual/ },
  gas:  { ttf: /^total (tf|termino fijo)/, ttv: /^total (tv|termino variable)/, hid: /hidrocarb/,
          iva: /^iva$/, total: /^total factura/, sav: /^ahorro (en esta )?factura/, ann: /^ahorro anual/ }
};

function parseSheet(name, ws) {
  if (!ws || !ws['!ref']) return null;
  const rg = XLSX.utils.decode_range(ws['!ref']);
  const maxR = rg.e.r + 1, maxC = rg.e.c + 1;
  const R = {};
  for (const k in ROW_RE.gas) R[k] = findRow(ws, ROW_RE.gas[k], maxR);
  const gas = R.ttf && R.ttv && R.total;
  let kind, rows;
  if (gas) { kind = 'gas'; rows = R; }
  else {
    rows = {};
    for (const k in ROW_RE.elec) rows[k] = findRow(ws, ROW_RE.elec[k], maxR);
    if (!(rows.tpot && rows.tte && rows.total)) return null;
    kind = 'elec';
  }
  if (numAt(ws, rows.total, 3) === null) return { name, kind, error: 'sin_valores' };
  const g = (r, c) => (r ? (numAt(ws, r, c) || 0) : 0);
  // ---- cabeceras: tipo (fijo/indexado) y nombre de comercializadora
  let typeRow = 0, best = 0;
  for (let r = 1; r <= 14; r++) {
    let n = 0;
    for (let c = 3; c <= maxC; c++) if (/fijo|index|omie/i.test(strAt(ws, r, c))) n++;
    if (n > best) { best = n; typeRow = r; }
  }
  let hdrRow = 0;
  for (let r = 1; r <= 14; r++) if (N(strAt(ws, r, 2)) === 'actual' || N(strAt(ws, r, 3)).startsWith('actual')) { hdrRow = r; break; }
  const cols = [];
  const hiddenCols = ws['!cols'] || [];
  for (let c = 3; c <= maxC; c++) {
    if (c > 3 && hiddenCols[c - 1] && hiddenCols[c - 1].hidden) continue;   // columnas ocultas = ofertas descartadas
    const t = numAt(ws, rows.total, c);
    if (t === null || t <= 0) continue;
    const pot = g(kind === 'gas' ? rows.ttf : rows.tpot, c);
    const ene = kind === 'gas' ? g(rows.ttv, c) : g(rows.tte, c) + g(rows.tdto, c);
    const serv = kind === 'gas' ? 0 : g(rows.cm, c);
    const ie = kind === 'gas' ? g(rows.hid, c) : g(rows.ie, c);
    const iva = g(rows.iva, c);
    let otros = t - (pot + ene + serv + ie + iva); if (Math.abs(otros) < 0.005) otros = 0;
    const typeText = typeRow ? strAt(ws, typeRow, c) : '';
    let nm = strAt(ws, 9, c).replace(/^actual\s*/i, '').trim();
    if (/^oferta [a-z]$/i.test(nm)) nm = '';
    cols.push({ c, letter: XLSX.utils.encode_col(c - 1), total: t, pot, ene, serv, ie, iva, otros, typeText, brand: nm,
                annual: rows.ann ? numAt(ws, rows.ann, c) : null });
  }
  if (!cols.length || cols[0].c !== 3 || cols.length < 2) return null;
  // ---- datos del cliente / asesor / consumo
  const clientRaw = strAt(ws, 6, 1);
  const client = /^cliente:/i.test(clientRaw) ? '' : clientRaw;
  const adv = {};
  for (let r = 2; r <= 4; r++) {
    const l = N(strAt(ws, r, 3));
    if (l.startsWith('asesor')) { adv.name = strAt(ws, r, 4); adv.email = strAt(ws, r, 5); }
    else if (l.startsWith('movil')) adv.mobile = strAt(ws, r, 4) || (numAt(ws, r, 4) || '');
    else if (l.startsWith('oficina')) adv.office = strAt(ws, r, 4) || (numAt(ws, r, 4) || '');
  }
  let kwh = null;
  for (let r = 1; r <= maxR; r++) {
    const l = N(strAt(ws, r, 1));
    if (/^(kwh factura|consumo de la factura)/.test(l)) {
      // valor en la propia celda, la de al lado en B o la de debajo
      kwh = numAt(ws, r + 1, 1) ?? null; break;
    }
  }
  let tariff = '';
  if (kind === 'elec') {
    const m = /(\d)\s*\.?\s*(\d)\s*TD/i.exec(strAt(ws, 7, 1)) || /(\d)\s*\.?\s*(\d)\s*TD/i.exec(name);
    tariff = m ? `${m[1]}.${m[2]}TD` : name;
  } else {
    const m = /RL\s*\.?\s*0?(\d)/i.exec(name + ' ' + strAt(ws, 7, 1));
    tariff = m ? `RL${m[1]}` : name;
  }
  return { name, kind, tariff, client, address: strAt(ws, 6, 4), advisor: adv, kwh, cols };
}

function parseWorkbook(wb) {
  const out = [];
  for (const nm of wb.SheetNames) {
    let p = null;
    try { p = parseSheet(nm, wb.Sheets[nm]); } catch (e) { p = null; }
    if (p) out.push(p);
  }
  return out;
}

/* ===== Cálculo del informe ===== */
function typeOf(text) { return /index|omie/i.test(text || '') ? 'idx' : 'fix'; }
function typeLabel(o) {
  if (o.type === 'idx') return 'Indexado';
  const t = (o.typeText || '').trim();
  if (!t || /^fijo$/i.test(t)) return 'Precio fijo';
  if (/fijo/i.test(t)) return 'Precio fijo';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function buildModel(sheet, opts) {
  opts = opts || {};
  const actual = sheet.cols[0];
  let offers = sheet.cols.slice(1).map(o => ({
    ...o,
    type: (opts.types && opts.types[o.letter]) || typeOf(o.typeText),
    saving: actual.total - o.total,
    pct: actual.total ? (actual.total - o.total) / actual.total : 0
  }));
  offers.sort((a, b) => b.saving - a.saving);
offers.forEach((o, i) => { o.rank = i + 1; o.label = o.brand ? o.brand : `Oferta ${i + 1}`; o.sub = typeLabel(o); });
  const bestOf = t => offers.filter(o => o.type === t)[0] || null;
  return { sheet, actual, offers, bestFix: bestOf('fix'), bestIdx: bestOf('idx'), kind: sheet.kind };
}

/* ===== Lectura del Excel de ajuste de potencia ===== */
function parsePowerSheet(name, ws) {
  if (!ws || !ws['!ref']) return null;
  const rg = XLSX.utils.decode_range(ws['!ref']);
  const maxR = rg.e.r + 1, maxC = rg.e.c + 1;
  // ---- cabecera de la tabla (por texto, no por posición fija)
  let hr = 0, cOldKw = 0;
for (let r = 1; r <= Math.min(maxR, 40) && !hr; r++)
  for (let c = 1; c <= maxC; c++)
    if (/^pot\.? ?contratada/.test(N(strAt(ws, r, c)))) { hr = r; cOldKw = c; break; }
  if (!hr) return null;
  let cNewKw = 0, cDays = 0;
  for (let c = 1; c <= maxC; c++) {
    const t = N(strAt(ws, hr, c));
    if (/^pot\.? ?a contratar/.test(t)) cNewKw = c;
    if (t === 'dias') cDays = c;
  }
  const priceAfter = from => { for (let c = from + 1; c <= maxC; c++) if (N(strAt(ws, hr, c)) === 'precio') return c; return 0; };
  const cOldP = priceAfter(cOldKw), cNewP = priceAfter(cNewKw);
  if (!cNewKw || !cOldP || !cNewP) return { name, kind: 'power', error: 'sin_tabla' };
  const cOldC = cOldP + 1, cNewC = cNewP + 1;   // columnas de coste (a la derecha de cada precio)
  // ---- periodos (P1, P2, …): filas con precio numérico (se aceptan números escritos como texto: "4,6", "4.6 kW")
  const numLoose = (rr, c) => {
    const n = numAt(ws, rr, c); if (n !== null) return n;
    const m = /^(-?\d+(?:[.,]\d+)?)\s*(?:kw|€)?$/i.exec(strAt(ws, rr, c).replace(/\s+/g, ' ').trim());
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  };
  const periods = []; let r = hr + 1;
  for (; r <= maxR; r++) {
    const price = numLoose(r, cOldP);
    if (price === null) break;
    periods.push({ label: 'P' + (periods.length + 1), kwOld: numLoose(r, cOldKw) || 0, kwNew: numLoose(r, cNewKw) || 0,
                   price, costOld: numAt(ws, r, cOldC), costNew: numAt(ws, r, cNewC) });
  }
  if (!periods.length) return { name, kind: 'power', error: 'sin_tabla' };
  if (!periods.some(p => p.kwOld > 0 || p.kwNew > 0)) {   // plantilla sin rellenar: se indica qué celdas se han leído
    const raw = c => { const x = cellOf(ws, hr + 1, c); return { a: XLSX.utils.encode_cell({ r: hr, c: c - 1 }), v: x && x.v != null ? String(x.v) : '' }; };
    return { name, kind: 'power', error: 'vacia', cells: [raw(cOldKw), raw(cNewKw)] };
  }
  const findLbl = re => { for (let rr = r; rr <= maxR; rr++) for (let c = 1; c <= maxC; c++) { const s = strAt(ws, rr, c); if (s && re.test(N(s))) return rr; } return 0; };
  const rTot = findLbl(/^total potencia/), rMas = findLbl(/^mas iva/), rM = findLbl(/^ahorro en potencia mensual/), rA = findLbl(/^ahorro en potencia anual/);
  if (!rTot) return { name, kind: 'power', error: 'sin_tabla' };
  const rate = numAt(ws, rTot + 1, cOldP) ?? 0.21;
  const days = cDays ? numLoose(hr + 1, cDays) : null;
  const d = days || 30;
  // si el Excel no tiene calculados los importes (o se quedaron a 0), se calculan igual que lo hace la hoja
  const stale = (v, calc) => v === null || (Math.abs(v) < 0.005 && Math.abs(calc) > 0.005);
  const pick = (cell, calc) => (stale(cell, calc) ? calc : cell);
  periods.forEach(p => {
    p.costOld = pick(p.costOld, d * p.kwOld * p.price);
    p.costNew = pick(p.costNew, d * p.kwNew * p.price);
  });
  const sumO = periods.reduce((a, p) => a + p.costOld, 0), sumN = periods.reduce((a, p) => a + p.costNew, 0);
  const totalOld = pick(numAt(ws, rTot, cOldC), sumO), tNew = pick(numAt(ws, rTot, cNewC), sumN);
  const ivaOld = pick(numAt(ws, rTot + 1, cOldC), totalOld * rate), ivaNew = pick(numAt(ws, rTot + 1, cNewC), tNew * rate);
  const totIvaOld = pick(rMas ? numAt(ws, rMas, cOldC) : null, totalOld + ivaOld);
  const totIvaNew = pick(rMas ? numAt(ws, rMas, cNewC) : null, tNew + ivaNew);
  const out = { name, kind: 'power', days, rate, periods, totalOld, totalNew: tNew, ivaOld, ivaNew,
    totalOldIva: totIvaOld, totalNewIva: totIvaNew };
  out.savM = pick(rM ? numAt(ws, rM, cNewP) : null, totalOld - tNew);
  out.savMIva = pick(rM ? numAt(ws, rM, cNewC) : null, totIvaOld - totIvaNew);
  out.savA = pick(rA ? numAt(ws, rA, cNewP) : null, out.savM / 30 * 365);
  out.savAIva = pick(rA ? numAt(ws, rA, cNewC) : null, out.savMIva / 30 * 365);
  // ---- titular, CUPS, contacto y nota
  let holder = '', cups = '', tRow = 0;
  const after = (r2, c, re) => {
    let v = strAt(ws, r2, c).replace(re, '').trim();
    if (!v) for (let k = c + 1; k <= Math.min(c + 3, maxC); k++) { const t = strAt(ws, r2, k); if (t && !/^(titular|cups)\s*:/i.test(t)) { v = t; break; } }
    return v;
  };
  for (let rr = 1; rr < hr; rr++) for (let c = 1; c <= maxC; c++) {
    const s = strAt(ws, rr, c);
    if (/^titular\s*:/i.test(s)) { holder = after(rr, c, /^titular\s*:/i); tRow = tRow || rr; }
    else if (/^cups\s*:/i.test(s)) cups = after(rr, c, /^cups\s*:/i);
  }
  const contact = [];
  for (let rr = 1; rr < (tRow || hr); rr++) for (let c = 1; c <= maxC; c++) { const s = strAt(ws, rr, c); if (s) contact.push(s.replace(/\s{2,}/g, ' · ')); }
  let note = '';
  for (let rr = r; rr <= maxR && !note; rr++) for (let c = 1; c <= maxC; c++) { const s = strAt(ws, rr, c); if (s.startsWith('*')) { note = s.replace(/^\*\s*/, ''); break; } }
  const m = /(\d)\s*\.?\s*(\d)\s*TD/i.exec(name);
  return Object.assign(out, { tariff: m ? `${m[1]}.${m[2]}TD` : name, holder, cups, contact, note });
}

function parsePowerWorkbook(wb) {
  const out = [];
  for (const nm of wb.SheetNames) {
    let p = null;
    try { p = parsePowerSheet(nm, wb.Sheets[nm]); } catch (e) { p = null; }
    if (p) out.push(p);
  }
  return out;
}


/* =====================================================================
   V2 · Comparativa de comercializadoras (Excel de Verónica)
   - Fila 7: CCAA / SSAA (servicios de ajuste incluidos / aparte)
   - Fila 8: duración del contrato (y "FIN DE CONTRATO" del actual en A8)
   - Fila 9: nombre de la comercializadora
   - Se ignoran las columnas ocultas (ofertas que se han descartado)
   - Lee las líneas extra: reactiva, exceso de potencia, costes de mercado,
     alquiler de equipo, bono social, servicios de ajuste, descuento,
     precios por periodo, consumo anual / medio, CUPS, periodo de consumo…
   ===================================================================== */

// Textos que se muestran para CCAA / SSAA (cámbialos aquí si quieres otra redacción)
const V2_SS_TXT = { CCAA: 'Incluidos', SSAA: 'Aparte' };
const V2_SS_NOTE = 'Servicios de ajuste: «Incluidos» (CCAA) significa que el precio de la oferta ya los recoge; «Aparte» (SSAA), que se facturan además del precio de la oferta.';

const V2_ROW_RE = {
  elec: { tpot: /^total pot/, tte: /^total (te|energia)/, tdto: /^total dto/, react: /^reactiva/, exc: /^exceso pot/,
          cm: /^costes? (de )?mercad/, serv: /^servicios? de ajuste/, ie: /^(i\. ?electrico|impuesto electrico)/,
          alq: /^alquiler (de )?equipo/, bono: /^bono social/, asist: /^asistencia/, iva: /^iva$/,
          total: /^total factura/, ann: /^ahorro anual/, dtoP: /^dto ?%/, dtoF: /^descuento$/ },
  gas:  { ttf: /^total (tf|termino fijo)/, ttv: /^total (tv|termino variable)/, hid: /hidrocarb/, alq: /^alquiler (de )?equipo/,
          serv: /^servigas/, iva: /^iva$/, total: /^total factura/, ann: /^ahorro anual/,
          tf: /^termino fijo/, gp: /^consumo gas/, dtoTF: /^dto tf/, dtoTV: /^dto tv/ }
};

// Clasifica el texto de una celda de cabecera
function v2Kind(s) {
  const t = N(s);
  if (!t) return '';
  if (/^(ccaa|ssaa)$/.test(t)) return 'ss';
  if (/\d\s*(€|eur)?\s*\/\s*servicio/.test(t)) return 'ssx';
  if (/^\d+\s*(mes|meses|ano|anos)$/.test(t) || /^(19|20)\d\d\s*[-–]\s*(19|20)\d\d$/.test(t)) return 'dur';
  if (/fijo|index|omie|^f\.? ?i\.?(\s|$)/.test(t)) return 'prod';
  return 'txt';
}

function v2Pretty(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|[\s(+\-\/])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());
  return t.replace(/\b(\d+)(hs|h|q|kw|mwh)\b/gi, (m, n, u) => n + u.toUpperCase())
          .replace(/\bhs\b/gi, 'HS').replace(/(\d)(meses?)\b/gi, '$1 $2').replace(/\bF\.i\./g, 'F.I.');
}

// Texto debajo del nombre de la oferta: "Precio fijo · 24HS", "Indexado", "F.I. 4Q (12 meses)"…
function v2Sub(o) {
  if (/^f\.? ?i\./i.test(String(o.typeText || '').trim())) return v2Pretty(o.typeText);
  const base = o.type === 'idx' ? 'Indexado' : 'Precio fijo';
  const extra = String(o.typeText || '').replace(/\b(fijo|indexado)\b/ig, '').replace(/\s+/g, ' ').trim();
  return extra ? base + ' · ' + v2Pretty(extra) : base;
}

// Servicios de ajuste de una oferta: { short, txt, cost } o null si no hay dato
function v2SsInfo(o) {
  const s = String(o.ss || '').trim().toUpperCase();
  const cost = o.serv > 0.005 ? o.serv : 0;
  if (s === 'CCAA') return { short: 'CCAA', txt: V2_SS_TXT.CCAA, cost };
  if (s === 'SSAA') return { short: 'SSAA', txt: V2_SS_TXT.SSAA, cost };
  if (s) return { short: v2Pretty(o.ss), txt: v2Pretty(o.ss), cost };
  if (cost) return { short: '', txt: V2_SS_TXT.SSAA, cost };
  return null;
}
const v2Dur = o => String(o.dur || '').trim().toLowerCase();

function buildModelV2(sheet, opts) {
  opts = opts || {};
  const actual = sheet.cols[0];
  const offers = sheet.cols.slice(1).map(o => ({
    ...o,
    type: (opts.types && opts.types[o.letter]) || typeOf(o.typeText),
    saving: actual.total - o.total,
    pct: actual.total ? (actual.total - o.total) / actual.total : 0
  }));
  offers.sort((a, b) => b.saving - a.saving);
  offers.forEach((o, i) => {
    o.rank = i + 1;
    o.label = (opts.showNames !== false && o.brand) ? o.brand : `Oferta ${i + 1}`;
    o.sub = v2Sub(o);
  });
  actual.type = typeOf(actual.typeText);
  actual.sub = v2Sub(actual);
  const bestOf = t => offers.filter(x => x.type === t)[0] || null;
  return { sheet, actual, offers, bestFix: bestOf('fix'), bestIdx: bestOf('idx'), kind: sheet.kind };
}

function parseSheetV2(name, ws) {
  if (!ws || !ws['!ref']) return null;
  const rg = XLSX.utils.decode_range(ws['!ref']);
  const maxR = rg.e.r + 1, maxC = rg.e.c + 1;
  const hid = ws['!cols'] || [];
  const colHidden = c => !!(hid[c - 1] && hid[c - 1].hidden);
  const merges = ws['!merges'] || [];
  const wide = (r, c) => merges.some(m => m.e.c > m.s.c && r - 1 >= m.s.r && r - 1 <= m.e.r && c - 1 >= m.s.c && c - 1 <= m.e.c);

  // ---- luz o gas
  const rg_ = {};
  for (const k in V2_ROW_RE.gas) rg_[k] = findRow(ws, V2_ROW_RE.gas[k], maxR);
  const gas = !!(rg_.ttf && rg_.ttv && rg_.total);
  let rows;
  if (gas) rows = rg_;
  else {
    rows = {};
    for (const k in V2_ROW_RE.elec) rows[k] = findRow(ws, V2_ROW_RE.elec[k], maxR);
    if (!(rows.tpot && rows.tte && rows.total)) return null;
  }
  const kind = gas ? 'gas' : 'elec';
  if (numAt(ws, rows.total, 3) === null) return { name, kind, error: 'sin_valores' };
  const g = (r, c) => (r ? (numAt(ws, r, c) || 0) : 0);
  const pctOf = x => { x = Math.abs(x || 0); return x <= 1 ? x * 100 : x; };

  // ---- cabeceras por columna (filas 7-10 aprox.): CCAA/SSAA, duración, tipo y nombre
  let typeRow = 0, best = 0;
  for (let r = 1; r <= 14; r++) {
    let n = 0;
    for (let c = 3; c <= maxC; c++) if (!wide(r, c) && /fijo|index|omie/i.test(strAt(ws, r, c))) n++;
    if (n > best) { best = n; typeRow = r; }
  }
  const lo = typeRow ? Math.max(1, typeRow - 3) : 5, hi = typeRow ? typeRow + 1 : 11;
  const hdr = {};
  for (let c = 3; c <= maxC; c++) for (let r = lo; r <= hi; r++) {
    const s = strAt(ws, r, c);
    if (!s || wide(r, c)) continue;
    (hdr[c] = hdr[c] || []).push({ r, s, k: v2Kind(s) });
  }
  // fila de nombres de comercializadora (la 9 en el Excel de Verónica)
  let brandRow = 0, bn = 0;
  for (let r = lo; r <= hi; r++) {
    if (r === typeRow) continue;
    let n = 0;
    for (const c in hdr) if (hdr[c].some(x => x.r === r && x.k === 'txt' && /[a-záéíóúñ]{2}/i.test(x.s) && !/^(actual|periodo)/.test(N(x.s)))) n++;
    if (n > bn || (n === bn && n && r === 9)) { bn = n; brandRow = r; }
  }
  if (bn < 3) brandRow = 0;

  // ---- precios por periodo (potencia en €/kW·mes y energía en €/kWh) y kW / kWh de cada periodo
  const pPrice = {}, pKw = {}, ePrice = {}, eKwh = {};
  if (!gas) for (let r = 1; r <= maxR; r++) {
    const a = N(strAt(ws, r, 1)), b = N(strAt(ws, r, 2));
    let m;
    if ((m = /^pot\.? ?periodo (\d)/.exec(b))) pPrice[+m[1]] = r;
    if ((m = /^pot\.? ?periodo (\d)/.exec(a))) pKw[+m[1]] = r;
    if ((m = /^energia periodo (\d)/.exec(b))) ePrice[+m[1]] = r;
    if ((m = /^energia periodo (\d)/.exec(a))) eKwh[+m[1]] = r;
  }
  const periods = [];
  for (let n = 1; n <= 6; n++) {
    const kwv = pKw[n] ? numAt(ws, pKw[n], 2) : null, khv = eKwh[n] ? numAt(ws, eKwh[n], 2) : null;
    if (kwv !== null || khv !== null) periods.push({ n, label: 'P' + n, kw: kwv, kwh: khv });
  }

  // ---- columnas (la C es la situación actual; el resto, ofertas)
  const cols = [];
  for (let c = 3; c <= maxC; c++) {
    const t = numAt(ws, rows.total, c);
    if (t === null || t <= 0) continue;
    if (c > 3 && colHidden(c)) continue;                       // oferta oculta en el Excel → no se muestra
    const h = hdr[c] || [];
    const pick = k => { const x = h.find(y => y.k === k); return x ? x.s : ''; };
    const tc = h.find(y => y.r === typeRow);
    const prod = tc && (tc.k === 'prod' || tc.k === 'txt') ? tc.s : pick('prod');
    let brand = brandRow ? ((h.find(y => y.r === brandRow && y.k === 'txt') || {}).s || '') : '';
    brand = brand.replace(/^actual\s*/i, '').trim();
    if (/^oferta [a-z0-9]$/i.test(brand)) brand = '';
    const ss = pick('ss') || pick('ssx'), dur = pick('dur');

    let pot, ene, serv, ie, alq, react = 0, exc = 0, cm = 0, bono = 0, dtoPct = 0, dtoAmt = 0;
    if (gas) {
      pot = g(rows.ttf, c); ene = g(rows.ttv, c); ie = g(rows.hid, c); alq = g(rows.alq, c); serv = g(rows.serv, c);
      dtoPct = Math.max(rows.dtoTV ? pctOf(numAt(ws, rows.dtoTV, c)) : 0, rows.dtoTF ? pctOf(numAt(ws, rows.dtoTF, c)) : 0);
      const a = rows.dtoTV ? numAt(ws, rows.dtoTV + 1, c) : null; dtoAmt = a !== null && a < -0.005 ? -a : 0;
    } else {
      const tdto = g(rows.tdto, c);
      pot = g(rows.tpot, c); ene = g(rows.tte, c) + tdto;          // el descuento va dentro de la energía
      serv = g(rows.serv, c); react = g(rows.react, c); exc = g(rows.exc, c); cm = g(rows.cm, c);
      ie = g(rows.ie, c); alq = g(rows.alq, c) + g(rows.asist, c); bono = g(rows.bono, c);
      dtoPct = (rows.dtoF ? Math.abs(g(rows.dtoF, c)) * 100 : 0) || (rows.dtoP ? pctOf(numAt(ws, rows.dtoP, c)) : 0);
      dtoAmt = tdto < -0.005 ? -tdto : 0;
    }
    const iva = g(rows.iva, c);
    let otros = t - (pot + ene + serv + react + exc + cm + ie + alq + bono + iva);
    if (Math.abs(otros) < 0.005) otros = 0;
    const potP = {}, eneP = {};
    periods.forEach(p => {
      potP[p.n] = pPrice[p.n] ? numAt(ws, pPrice[p.n], c) : null;
      eneP[p.n] = ePrice[p.n] ? numAt(ws, ePrice[p.n], c) : null;
    });
    cols.push({ c, letter: XLSX.utils.encode_col(c - 1), total: t, pot, ene, serv, react, exc, cm, ie, alq, bono, iva, otros,
                typeText: prod, brand, ss, dur, dtoPct, dtoAmt, potP, eneP,
                fixedP: gas && rows.tf ? numAt(ws, rows.tf, c) : null, gasP: gas && rows.gp ? numAt(ws, rows.gp, c) : null,
                annual: rows.ann ? numAt(ws, rows.ann, c) : null });
  }
  if (!cols.length || cols[0].c !== 3 || cols.length < 2) return null;

  // ---- datos del cliente, asesor, contrato y consumo
  // (en las hojas de gas con otra disposición la fila 6 ya no es la del cliente)
  const kwRow = findRow(ws, /^kwh anuales/, maxR), infoOk = !kwRow || kwRow > 6;
  const client = infoOk ? strAt(ws, 6, 1).replace(/^cliente\s*:?\s*/i, '').trim() : '';
  const address = infoOk ? strAt(ws, 6, 4) : '';
  const adv = {};
  for (let r = 2; r <= 4; r++) {
    const l = N(strAt(ws, r, 3));
    if (l.startsWith('asesor')) { adv.name = strAt(ws, r, 4); adv.email = strAt(ws, r, 5); }
    else if (l.startsWith('movil')) adv.mobile = strAt(ws, r, 4) || (numAt(ws, r, 4) || '');
    else if (l.startsWith('oficina')) adv.office = strAt(ws, r, 4) || (numAt(ws, r, 4) || '');
  }
  const textAfter = re => {
    for (let r = 1; r <= 12; r++) for (let c = 1; c <= 3; c++) {
      const m = re.exec(strAt(ws, r, c) || '');
      if (!m) continue;
      let v = (m[1] || '').trim();
      if (!v) for (let k = c + 1; k <= Math.min(c + 2, maxC); k++) { const t = strAt(ws, r, k); if (t && v2Kind(t) === 'txt') { v = t; break; } }
      if (v) return v;
    }
    return '';
  };
  let periodTxt = '';
  for (let r = 1; r <= 12 && !periodTxt; r++) for (let c = 1; c <= maxC; c++) {
    const m = /^periodo de consumo\s*:?\s*(.*)$/i.exec(strAt(ws, r, c) || '');
    if (m && m[1].trim()) { periodTxt = m[1].trim(); break; }
  }
  const kv = re => { for (let r = 1; r <= maxR; r++) if (re.test(N(strAt(ws, r, 1)))) return numAt(ws, r + 1, 1); return null; };
  let label = '';
  for (let r = 1; r <= 14 && !label; r++) for (const c of [1, 2]) if (/^tarifa/i.test(strAt(ws, r, c) || '')) { label = strAt(ws, r, c); break; }
  let tariff = '';
  if (!gas) {
    const m = /(\d)\s*\.?\s*(\d)\s*TD/i.exec(label) || /(\d)\s*\.?\s*(\d)\s*TD/i.exec(name);
    tariff = m ? `${m[1]}.${m[2]}TD` : name;
  } else {
    const m = /RL\s*\.?\s*0?(\d)/i.exec(name + ' ' + label);
    tariff = m ? `RL${m[1]}` : name;
  }
  const dm = gas ? null : /(\d+)/.exec(strAt(ws, rows.tpot, 2) || '');
  return { name, kind, tariff, client, address, advisor: adv, periods: periods.filter(p => (p.kw || 0) > 0 || (p.kwh || 0) > 0),
           cups: textAfter(/^cups\s*:?\s*(.*)$/i), contractEnd: textAfter(/^fin de contrato\s*:?\s*(.*)$/i), periodTxt,
           kwh: kv(/^(kwh factura|consumo de la factura)/), kwhYear: kv(/^kwh anuales/), kwhAvg: kv(/^kwh media/),
           days: dm ? +dm[1] : null, hasBrands: !!brandRow, cols };
}

// Lista de asesores (hoja "COMERCIALES": ASESOR / MOVIL / OFICINA)
function parseAdvisorsV2(wb) {
  const nm = wb.SheetNames.find(n => /comercial|asesor/i.test(n));
  const ws = nm && wb.Sheets[nm];
  if (!ws || !ws['!ref']) return [];
  const rg = XLSX.utils.decode_range(ws['!ref']);
  const maxR = rg.e.r + 1, maxC = rg.e.c + 1, out = [];
  const val = (r, c) => strAt(ws, r, c) || (numAt(ws, r, c) !== null ? String(numAt(ws, r, c)) : '');
  for (let r = 1; r <= maxR; r++) for (let c = 1; c <= maxC; c++) {
    if (!/^asesor\s*:?$/.test(N(strAt(ws, r, c)))) continue;
    const name = strAt(ws, r, c + 1);
    if (!name) continue;
    const em = strAt(ws, r, c + 2);
    const a = { name, email: em.includes('@') ? em : '', mobile: '', office: '' };
    for (let k = 1; k <= 3; k++) {
      const l = N(strAt(ws, r + k, c));
      if (l.startsWith('movil')) a.mobile = val(r + k, c + 1);
      else if (l.startsWith('oficina')) a.office = val(r + k, c + 1);
    }
    out.push(a);
  }
  return out;
}

function parseWorkbookV2(wb) {
  const out = [];
  const meta = (wb.Workbook && wb.Workbook.Sheets) || [];
  wb.SheetNames.forEach((nm, i) => {
    if (meta[i] && meta[i].Hidden) return;                    // hojas ocultas del Excel
    let p = null;
    try { p = parseSheetV2(nm, wb.Sheets[nm]); } catch (e) { p = null; }
    if (p) out.push(p);
  });
  try { out.advisors = parseAdvisorsV2(wb); } catch (e) { out.advisors = []; }
  return out;
}
