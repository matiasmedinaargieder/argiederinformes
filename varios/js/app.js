/* ===== Formato ===== */
const nf = (v, d) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtP = v => nf(Math.abs(v) * 100, 1);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const EPS = 0.005;
const E = v => nf(v, 2) + ' €';
const $ = id => document.getElementById(id);
const fmtSize = b => (b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB');

const MAX = 20, START = 5;                                  // suministros máximos / que se muestran al empezar
const LOGO_SRC = '../resumido/img/logo.png';
const S = { sup: [], opts: { client: '', period: '', showNames: true } };
const newSup = () => ({ name: '', comp: null, pow: null });  // comp / pow: { file, sheets, idx, err, loading }
for (let i = 0; i < START; i++) S.sup.push(newSup());

const ICON = {
  comp: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
  pow: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
  ok: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>'
};
const LABEL = { comp: 'Comparativa', pow: 'Ajuste de potencia' };
const sheetOf = s => (s && s.sheets && s.sheets.length) ? s.sheets[s.idx || 0] : null;

/* ===== Datos de cada suministro → filas del informe ===== */
function supRows() {
  const rows = [];
  S.sup.forEach((sup, i) => {
    const c = sheetOf(sup.comp), p = sheetOf(sup.pow);
    if (!c && !p) return;
    const r = { n: i + 1, name: (sup.name || '').trim() || (c && c.client) || (p && p.holder) || ('Suministro ' + (i + 1)), comp: null, pow: null };
    if (c) {
      const m = buildModel(c, { types: {} });
      if (!S.opts.showNames) m.offers.forEach(o => { o.label = 'Oferta ' + o.rank; });
      const best = m.offers[0];                                // la oferta que más ahorra
      r.comp = { kind: m.kind, tariff: c.tariff, label: best.label, sub: best.sub, before: m.actual.total, after: best.total,
                 sav: best.saving, annual: best.annual && best.annual > 0 ? best.annual : 0 };
    }
    if (p) r.pow = { tariff: p.tariff, before: p.totalOldIva, after: p.totalNewIva, sav: p.savMIva, annual: p.savAIva > EPS ? p.savAIva : 0 };
    r.before = r.comp ? r.comp.before : r.pow.before;
    r.sav = (r.comp ? r.comp.sav : 0) + (r.pow ? r.pow.sav : 0);   // el ahorro total suma ambos cálculos (son independientes)
    r.after = r.before - r.sav;
    r.pct = r.before ? r.sav / r.before : 0;
    r.annual = (r.comp ? r.comp.annual : 0) + (r.pow ? r.pow.annual : 0);
    r.info = r.comp ? `${r.comp.kind === 'gas' ? 'Gas' : 'Luz'} ${r.comp.tariff}` : `Luz ${r.pow.tariff}`;
    rows.push(r);
  });
  return rows;
}

/* ===== Informe (una sola hoja) ===== */
function renderReport() {
  const rows = supRows();
  if (!rows.length) return;
  const T = { before: 0, after: 0, savC: 0, savP: 0, annual: 0, nC: 0, nP: 0 };
  rows.forEach(r => {
    T.before += r.before; T.after += r.after; T.annual += r.annual;
    if (r.comp) { T.nC++; T.savC += r.comp.sav; }
    if (r.pow) { T.nP++; T.savP += r.pow.sav; }
  });
  const sv = T.savC + T.savP, bad = sv < -EPS, both = T.nC > 0 && T.nP > 0;
  const maxSav = Math.max(EPS, ...rows.map(r => r.sav));
  const client = (S.opts.client || '').trim(), period = (S.opts.period || '').trim();
  const subTxt = [`${rows.length} suministro${rows.length === 1 ? '' : 's'}`, client, period].filter(Boolean).join(' · ');

  const hero = `<div class="blk"><div class="hero${bad ? ' bad' : ''}">
      <div class="ht"><h1>Resumen de ahorro</h1><div class="sub">${esc(subTxt)}</div></div>
      <div class="hm"><div class="l">Ahorro total estimado</div>
        <div class="s">${E(T.before)} hoy → ${E(T.after)} con los cambios${both ? `<br>${E(T.savC)} comercializadoras · ${E(T.savP)} potencia` : ''}</div></div>
      <div class="big">${bad ? '−' : ''}${E(Math.abs(sv))}${T.annual > EPS ? `<small>≈ ${nf(T.annual, 0)} € al año</small>` : '<small>IVA incluido</small>'}</div>
    </div></div>`;

  const rowHTML = r => {
    const good = r.sav > EPS, worse = r.sav < -EPS;
    const w = good ? Math.max(4, Math.round(r.sav / maxSav * 100)) : 0;
    const comp = r.comp ? `<b>${esc(r.comp.label)}</b><small>${esc(r.comp.sub)}</small>` : `<span class="mut">—</span><small>Solo potencia</small>`;
    const pw = r.pow ? `<b class="yes">Sí</b><small>${r.pow.sav > EPS ? 'ahorra ' + E(r.pow.sav) : r.pow.sav < -EPS ? 'cuesta ' + E(-r.pow.sav) : 'sin cambio'}</small>` : `<span class="mut">No</span>`;
    return `<div class="vr"><span class="vn">${r.n}</span>
      <span class="vs"><b>${esc(r.name)}</b><small>${esc(r.info)}</small></span>
      <span class="vc">${comp}</span>
      <span class="vm">${E(r.before)}</span><span class="vm">${E(r.after)}</span>
      <span class="va ${good ? 'pos' : worse ? 'neg' : ''}"><b>${worse ? '−' : ''}${E(Math.abs(r.sav))}</b><small>${worse ? '+' : ''}${fmtP(r.pct)}%</small><i class="vb"><u style="width:${w}%"></u></i></span>
      <span class="vp">${pw}</span></div>`;
  };

  // Reparto por comercializadora (solo si se muestran los nombres)
  let pills = '';
  if (S.opts.showNames && T.nC) {
    const cnt = {};
    rows.filter(r => r.comp).forEach(r => { cnt[r.comp.label] = (cnt[r.comp.label] || 0) + 1; });
    pills = '<div class="pills">' + Object.entries(cnt).sort((a, b) => b[1] - a[1])
      .map(([l, n]) => `<span class="pill"><b>${esc(l)}</b> · ${n} suministro${n === 1 ? '' : 's'}</span>`).join('') + '</div>';
  }

  const table = `<div class="blk"><div class="box vbox">
      <h2>Ahorro por suministro</h2>
      <p class="d">Lo que se paga hoy, lo que se pagaría con la mejor oferta de cada suministro y si tiene ajuste de potencia.</p>
      <div class="vt">
        <div class="vh"><span>#</span><span>Suministro</span><span>Comercializadora</span><span class="r">Pagas hoy</span><span class="r">Pagarías</span><span>Ahorro</span><span>Potencia</span></div>
        ${rows.map(rowHTML).join('')}
        <div class="vtot"><span></span><span>Total · ${rows.length} suministro${rows.length === 1 ? '' : 's'}</span><span></span>
          <span class="vm">${E(T.before)}</span><span class="vm">${E(T.after)}</span>
          <span class="va ${bad ? 'neg' : 'pos'}"><b>${bad ? '−' : ''}${E(Math.abs(sv))}</b></span>
          <span class="vp">${T.nP} con ajuste</span></div>
      </div>
      ${pills}
    </div></div>`;

  $('report').innerHTML = `<div class="rep one">
    <div class="blk"><div class="logoRow"><img class="logo" src="${LOGO_SRC}" alt=""></div></div>
    ${hero}
    ${table}
  </div>`;
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
  const reps = [document.querySelector('#report > .rep')];
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 12, contentW = W - 2 * M, maxH = H - 2 * M;
  let first = true;
  for (const rep of reps) {
    const cv = await html2canvas(rep, { scale: 2, backgroundColor: '#f5f6f8', useCORS: true, logging: false });
    const rr = rep.getBoundingClientRect();
    const mmPerPx = contentW / rr.width, ratio = cv.height / rr.height;
    let ranges = pageRanges(rep, maxH / mmPerPx);
    // Si solo se pasa un poco de una hoja, se ajusta a una única hoja (reducción máx. ~10 %)
    if (ranges.length > 1 && rr.height * mmPerPx <= maxH * 1.1) ranges = [{ top: 0, bottom: rr.height }];
    for (const r of ranges) {
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

  const slug = (S.opts.client || 'suministros').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'suministros';
  const filename = `Resumen_suministros_${slug}.pdf`;
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

function slotHTML(i, k) {
  const s = S.sup[i][k], label = LABEL[k];
  if (s && s.sheets) {
    return `<div class="slot2 ok" data-i="${i}" data-k="${k}">${ICON.ok}
      <div class="sn"><b>${label}</b><span title="${esc(s.file.name)}">${esc(s.file.name)}</span></div>
      <button type="button" class="x" data-act="rm" title="Quitar" aria-label="Quitar ${label.toLowerCase()} del suministro ${i + 1}">×</button></div>`;
  }
  const busy = s && s.loading;
  return `<div class="slot2 drop${s && s.err ? ' bad' : ''}" data-i="${i}" data-k="${k}" tabindex="0" role="button" aria-label="Subir ${label.toLowerCase()} del suministro ${i + 1}">${ICON[k]}
    <div class="sn"><b>${label}</b><span>${busy ? 'Leyendo…' : 'Arrastra o haz clic'}</span></div>
    <input type="file" accept=".xlsx,.xlsm,.xls" hidden></div>`;
}
function simName(sh, k) {
  const who = k === 'comp' ? sh.client : sh.holder;
  return `${sh.name || sh.tariff}${who ? ' · ' + who : ''}`;
}
function cardHTML(i) {
  const sup = S.sup[i], c = sheetOf(sup.comp), p = sheetOf(sup.pow);
  const auto = (c && c.client) || (p && p.holder) || '';
  const sims = ['comp', 'pow'].map(k => {
    const s = sup[k];
    if (!s || !s.sheets || s.sheets.length < 2) return '';
    return `<label class="simRow">${k === 'comp' ? 'Simulación' : 'Hoja de potencia'}
      <select class="sel simSel" data-i="${i}" data-k="${k}">${s.sheets.map((sh, j) => `<option value="${j}"${j === s.idx ? ' selected' : ''}>${esc(simName(sh, k))}</option>`).join('')}</select></label>`;
  }).join('');
  const errs = ['comp', 'pow'].map(k => sup[k] && sup[k].err ? `<p class="supErr">${LABEL[k]}: ${esc(sup[k].err)}</p>` : '').join('');
  return `<div class="supHead"><span class="num">${i + 1}</span>
      <input type="text" class="supName" data-i="${i}" placeholder="${esc(auto || 'Suministro ' + (i + 1))}" value="${esc(sup.name)}" aria-label="Nombre del suministro ${i + 1}">
      <button type="button" class="x" data-act="clear" title="Vaciar suministro" aria-label="Vaciar suministro ${i + 1}">×</button></div>
    <div class="supSlots">${slotHTML(i, 'comp')}${slotHTML(i, 'pow')}</div>${sims}${errs}`;
}
function renderGrid() {
  $('grid').innerHTML = S.sup.map((_, i) => `<div class="sup" id="sup${i}">${cardHTML(i)}</div>`).join('');
  $('add').hidden = S.sup.length >= MAX;
  refresh();
}
function updateCard(i) { const el = $('sup' + i); if (el) el.innerHTML = cardHTML(i); refresh(); }
function refresh() {
  const n = supRows().length;
  $('go').disabled = !n;
  $('count').textContent = n ? `${n} suministro${n === 1 ? '' : 's'} con datos` : '';
}
function stale() { $('previewWrap').hidden = true; status(''); }

async function loadInto(i, k, f) {
  if (!f) return;
  const sup = S.sup[i];
  stale();
  if (!/\.(xlsx|xlsm|xls)$/i.test(f.name)) { sup[k] = { err: 'Ese archivo no es un Excel (.xlsx). Prueba con otro.' }; updateCard(i); return; }
  if (!window.XLSX) { sup[k] = { err: 'No se ha podido cargar el lector de Excel. Revisa la conexión y recarga la página.' }; updateCard(i); return; }
  sup[k] = { file: f, loading: true }; updateCard(i);
  try {
    const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
    let all, sheets, err = '';
    if (k === 'comp') {
      all = parseWorkbook(wb); sheets = all.filter(s => !s.error);
      if (!sheets.length) {
        if (!all.length && parsePowerWorkbook(wb).some(s => !s.error)) err = 'Este Excel es de ajuste de potencia. Súbelo en el cuadro “Ajuste de potencia”.';
        else err = all.some(s => s.error) ? 'El Excel no trae los importes calculados. Ábrelo en Excel, guárdalo (Ctrl+G) y vuelve a subirlo.' : 'No he encontrado ninguna simulación de luz o gas en este archivo.';
      }
    } else {
      all = parsePowerWorkbook(wb); sheets = all.filter(s => !s.error);
      if (!sheets.length) {
        if (all.some(s => s.error === 'vacia')) err = 'Rellena la potencia contratada y la potencia a contratar en el Excel.';
        else if (all.some(s => s.error)) err = 'El Excel no trae los importes calculados. Ábrelo en Excel, guárdalo (Ctrl+G) y vuelve a subirlo.';
        else if (parseWorkbook(wb).some(s => !s.error)) err = 'Este Excel es una comparativa de comercializadoras. Súbelo en el cuadro “Comparativa”.';
        else err = 'No he encontrado datos de potencia. ¿Has rellenado la potencia contratada y la nueva?';
      }
    }
    if (err) { sup[k] = { err }; updateCard(i); return; }
    // Si hay varias simulaciones: la que lleva nombre de cliente (si solo una la lleva) o la primera; se puede cambiar
    const who = k === 'comp' ? 'client' : 'holder';
    const named = sheets.map((s, j) => (s[who] ? j : -1)).filter(j => j >= 0);
    sup[k] = { file: f, sheets, idx: sheets.length > 1 && named.length === 1 ? named[0] : 0 };
  } catch (e) { sup[k] = { err: 'No he podido leer el archivo. ¿Está dañado o protegido con contraseña?' }; }
  updateCard(i);
}

const slotOf = e => e.target.closest('.slot2');
const grid = $('grid');
grid.addEventListener('click', e => {
  if (e.target.tagName === 'INPUT') return;
  const btn = e.target.closest('[data-act]');
  const card = e.target.closest('.sup');
  if (btn && card) {
    const i = +card.id.slice(3);
    stale();
    if (btn.dataset.act === 'rm') { S.sup[i][btn.closest('.slot2').dataset.k] = null; }
    else { S.sup[i] = newSup(); }
    updateCard(i); return;
  }
  const sl = slotOf(e);
  if (sl && sl.classList.contains('drop')) sl.querySelector('input').click();
});
grid.addEventListener('keydown', e => {
  const sl = slotOf(e);
  if (sl && sl.classList.contains('drop') && (e.key === 'Enter' || e.key === ' ') && e.target === sl) { e.preventDefault(); sl.querySelector('input').click(); }
});
['dragenter', 'dragover'].forEach(ev => grid.addEventListener(ev, e => { const sl = slotOf(e); if (sl && sl.classList.contains('drop')) { e.preventDefault(); sl.classList.add('over'); } }));
grid.addEventListener('dragleave', e => { const sl = slotOf(e); if (sl) sl.classList.remove('over'); });
grid.addEventListener('drop', e => {
  const sl = slotOf(e);
  if (!sl || !sl.classList.contains('drop')) return;
  e.preventDefault(); sl.classList.remove('over');
  loadInto(+sl.dataset.i, sl.dataset.k, e.dataTransfer.files[0]);
});
grid.addEventListener('change', e => {
  const t = e.target;
  if (t.type === 'file') { const sl = t.closest('.slot2'); loadInto(+sl.dataset.i, sl.dataset.k, t.files[0]); t.value = ''; }
  else if (t.classList.contains('simSel')) { S.sup[+t.dataset.i][t.dataset.k].idx = +t.value; stale(); updateCard(+t.dataset.i); }
});
grid.addEventListener('input', e => {
  if (e.target.classList.contains('supName')) { S.sup[+e.target.dataset.i].name = e.target.value; if (!$('previewWrap').hidden) renderReport(); }
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { if (!e.target.closest || !e.target.closest('.slot2.drop')) e.preventDefault(); });

$('add').addEventListener('click', () => {
  if (S.sup.length >= MAX) return;
  S.sup.push(newSup()); const i = S.sup.length - 1;
  const d = document.createElement('div'); d.className = 'sup'; d.id = 'sup' + i; d.innerHTML = cardHTML(i);
  $('grid').appendChild(d); $('add').hidden = S.sup.length >= MAX; d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

async function convert() {
  const btn = $('go'); btn.disabled = true;
  try {
    status('Generando el informe…');
    renderReport();
    await new Promise(r => setTimeout(r, 60));
    await makePdf();
    status('PDF descargado ✓', 'ok');
  } catch (e) { const [m, c] = pdfError(e); status(m, c); }
  refresh();
}
async function downloadNow() { status('Generando el PDF…'); try { await makePdf(); status('PDF descargado ✓', 'ok'); } catch (e) { const [m, c] = pdfError(e); status(m, c); } }
$('go').addEventListener('click', convert);
$('regen').addEventListener('click', () => { renderReport(); downloadNow(); });
$('dl').addEventListener('click', downloadNow);
$('oClient').addEventListener('input', e => { S.opts.client = e.target.value; if (!$('previewWrap').hidden) renderReport(); });
$('oPeriod').addEventListener('input', e => { S.opts.period = e.target.value; if (!$('previewWrap').hidden) renderReport(); });
$('oNames').addEventListener('change', e => { S.opts.showNames = e.target.checked; if (!$('previewWrap').hidden) renderReport(); });

renderGrid();
