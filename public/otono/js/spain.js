import { Y0, Y1, f1, f0, signed, anomalyColor, rgb, heat, ANTES, lateTxt } from './data.js';
import { loadSpain, tempSeries } from './spain-data.js';
import { createSeason } from './season.js';
import { createWall } from './wall.js';
import { AUTUMN, OCT1, dateOf, slug, lifeOf, otonosTxt, drawCard } from './card.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const MONL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dateLong = (doy) => { const d = new Date(Date.UTC(2001, 0, 1) + (Math.round(doy) - 1) * 864e5); return `${d.getUTCDate()} de ${MONL[d.getUTCMonth()]}`; };

const noop = { setSteal() {}, update() {}, setLeaves() {}, select() {}, overview() {} };
function safe(fn, el) {
  try { return fn(); } catch (err) { console.warn('3D no disponible:', err.message); el?.classList.add('no-webgl'); return noop; }
}

const params = new URLSearchParams(location.search);
const state = { prov: params.get('provincia') || 'barcelona', born: +params.get('nacimiento') || null };

// Three.js se carga aparte: los datos no esperan a las hojas
let hero = noop;
import('./hero.js').then(({ createHero }) => { hero = safe(() => createHero($('#hero-canvas'), { reduced })); })
  .catch(() => $('#hero-canvas').classList.add('no-webgl'));
const heroEl = $('#hero');
addEventListener('scroll', () => hero.setSteal(Math.min(1, Math.max(0, scrollY / (heroEl.offsetHeight * 0.8)))), { passive: true });

let data;
try {
  data = await loadSpain();
} catch (e) {
  $('main').insertAdjacentHTML('afterbegin', '<p class="wrap load-err">No se han podido cargar los datos. Recarga la página para intentarlo de nuevo.</p>');
  throw e;
}
const P = data.provinces.filter((p) => p.st?.shift?.trend);
const byId = Object.fromEntries(data.provinces.map((p) => [p.id, p]));
// En la URL, la provincia va por nombre legible (?provincia=a-coruna)
const bySlug = Object.fromEntries(data.provinces.map((p) => [slug(p.name), p.id]));
state.prov = bySlug[slug(state.prov)] || 'ES511';
if (!byId[state.prov]?.st?.shift) state.prov = 'ES511';
const shortSt = (name) => name.toLowerCase().replace(/(^|[\s/(.-])\p{L}/gu, (m) => m.toUpperCase());
const refOf = (p) => p.st.shift.trend.base.join('–');
for (const p of P) p.temp = tempSeries(p.st);

// ---------- Portada ----------
const comparable = P.filter((p) => !p.st.shift.flat);
const medDays = median(comparable.map((p) => p.st.shift.days));
$('#hero-days').textContent = `${f0(medDays)} días`;
const late = P.filter((p) => p.st.shift.days > 0).length;
$('#hero-n').textContent = late === P.length ? 'todas las provincias' : `${late} de ${P.length} provincias`;

// ---------- Provincia y año de nacimiento: un solo estado para toda la página ----------
const provSelects = ['#pick-prov', '#bar-prov'].map((q) => $(q));
provSelects.forEach((sel) => (sel.innerHTML = ''));
for (const sel of provSelects) for (const p of [...data.provinces].sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
  const o = new Option(p.name + (p.st?.shift ? '' : ' (sin serie)'), p.id);
  o.disabled = !p.st?.shift;
  sel.add(o);
}
const bornInputs = ['#pick-born', '#bar-born', '#life-born', '#share-born'].map((q) => $(q));
provSelects.forEach((sel) => sel.addEventListener('change', () => setProv(sel.value)));
bornInputs.forEach((inp) => inp.addEventListener('input', () => {
  const v = +inp.value;
  setBorn(v >= 1935 && v <= 2015 ? v : null, inp);
}));
$('#pick').addEventListener('submit', (e) => {
  e.preventDefault();
  $('#tu-otono').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
});

let lastUrl = '';
function syncUrl() {
  const q = `?provincia=${slug(byId[state.prov].name)}${state.born ? `&nacimiento=${state.born}` : ''}`;
  if (q === lastUrl) return;
  lastUrl = q;
  try { history.replaceState(null, '', q + location.hash); } catch {}
}

function setProv(id) {
  if (!byId[id]?.st?.shift) return;
  state.prov = id;
  provSelects.forEach((s) => (s.value = id));
  const p = byId[id];
  $$('[data-p="name"]').forEach((e) => (e.textContent = p.name));
  season.setStation(p.name, p.st.shift);
  wall.select(id);
  renderYou();
  renderPanel();
  renderMap(true);
  markRow(id);
  scrollListTo(id);
  renderShare();
  renderCulprit();
  syncUrl();
}
function setBorn(y, from) {
  state.born = y;
  bornInputs.forEach((i) => { if (i !== from) i.value = y ?? ''; });
  renderYou();
  renderShare();
  syncUrl();
}

// ---------- Tu otoño ----------
const season = createSeason($('#tu-otono'), { reduced });
// La cifra protagonista: días de otoño robados en tu vida (ver lifeStolen, en Comparte)
let lifeShown = 0, lifeRaf = 0, lifeSeen = false;
function countTo(n) {
  cancelAnimationFrame(lifeRaf);
  const from = lifeShown, t0 = performance.now(), dur = reduced ? 0 : 1600;
  const step = (now) => {
    const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - (1 - k) ** 3;
    lifeShown = from + (n - from) * e;
    $('#life-n').textContent = f0(lifeShown);
    drawBlocks(lifeShown);
    if (k < 1) lifeRaf = requestAnimationFrame(step);
    else showClaim();
  };
  lifeRaf = requestAnimationFrame(step);
}
function drawBlocks(d) {
  const box = $('#life-blocks'), o = d / AUTUMN, n = Math.max(1, Math.ceil(lifeTarget / AUTUMN));
  if (box.children.length !== n) box.innerHTML = '<i><b></b></i>'.repeat(n);
  [...box.children].forEach((el, i) => (el.firstChild.style.width = `${Math.max(0, Math.min(1, o - i)) * 100}%`));
}
let lifeTarget = 0;
// El sello aparece cuando el contador se para: es el momento de reclamar
function showClaim() {
  const b = $('#life-claim'), on = lifeTarget >= 1;
  if (on && b.hidden) { b.hidden = false; b.classList.remove('in'); void b.offsetWidth; b.classList.add('in'); }
  if (!on) b.hidden = true;
}
$('#life-claim').addEventListener('click', async () => {
  $('#life-claim').blur(); // si no, el anillo de foco se queda pegado al volver
  // En el móvil, directo al menú de compartir con la carta; si no se puede, a la denuncia
  if (matchMedia('(pointer: coarse)').matches && navigator.share) {
    const r = await shareCard();
    if (r !== 'fail') return;
  }
  $('#comparte').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
});
function renderYou() {
  const p = byId[state.prov], sh = p.st.shift, life = lifeStolen();
  season.setBorn(state.born && !sh.flat ? state.born : null);
  $('#life-ask').hidden = !!state.born;
  $('#life-has').hidden = !state.born;
  if (!state.born) return;
  if (sh.flat) {
    lifeTarget = 0; $('#life-claim').hidden = true; $('#life-n').textContent = '–'; $('#life-o').textContent = ''; $('#life-blocks').innerHTML = '';
    $('#life-cap').textContent = `En ${p.name} el otoño apenas se enfría y la cifra en días no es comparable.`;
    return;
  }
  lifeTarget = life?.total ?? 0;
  $('#life-o').textContent = lifeTarget >= 1 ? `= ${otonosTxt(lifeTarget)}` : 'apenas nada, de momento';
  $('#life-cap').innerHTML = `Es la suma de cada otoño ${life && life.from > state.born ? `desde ${life.from}, cuando empiezan los datos` : 'que has vivido'} en ${p.name}: los días que llegó tarde frente al ${ANTES}. Este año, <b>${f0(sh.days)} días</b>. Abajo, el área roja del gráfico.`;
  if (lifeSeen) countTo(lifeTarget);
  else { lifeShown = lifeTarget; $('#life-n').textContent = f0(lifeTarget); drawBlocks(lifeTarget); $('#life-claim').hidden = true; }
}
new IntersectionObserver(([e]) => {
  if (e.isIntersecting && !lifeSeen) { lifeSeen = true; if (state.born && lifeTarget) { lifeShown = 0; countTo(lifeTarget); } }
}, { threshold: 0.5 }).observe($('#life'));

// ---------- España: el frente del otoño ----------
// Cada provincia se pinta con la temperatura media de cada día (curva de 1961-1990 de su estación).
// «Hoy» es esa misma curva desplazada los días robados (tendencia en 2025). Llega el otoño cuando
// la media baja de 18 °C: la de un 1 de octubre típico en España en 1961-1990.
const D0 = 244, D1 = 334, AUT_T = 18, TLO = 10, THI = 26;
const curveT = (p, doy) => {
  const c = p.st.shift.curves, k = doy - c.refFrom, i = Math.max(0, Math.min(c.ref.length - 2, Math.floor(k))), t = k - i;
  return c.ref[i] * (1 - t) + c.ref[i + 1] * t;
};
const shiftOf = (p, era) => (era === 'hoy' ? p.st.shift.days : 0);
const tempAt = (p, doy, era) => curveT(p, doy - shiftOf(p, era));
// Primer día (fraccionario) en que baja de 18 °C; D0 - 1 si ya estaba por debajo; null si no llega
function arrival(p, era) {
  const s = shiftOf(p, era);
  if (curveT(p, D0 - s) < AUT_T) return D0 - 1;
  for (let d = D0; d < D1; d++) {
    const a = curveT(p, d - s), b = curveT(p, d + 1 - s);
    if (b < AUT_T) return d + (a - AUT_T) / (a - b);
  }
  return null;
}
for (const p of P) p.arr = { antes: arrival(p, 'antes'), hoy: p.st.shift.flat ? null : arrival(p, 'hoy') };
const FRONT = P.filter((p) => !p.st.shift.flat);
// Se cuenta por días enteros, igual que la fecha que se ve
const has = (p, era, day) => p.arr[era] != null && Math.round(p.arr[era]) <= Math.round(day);
const nArrived = (era, day) => FRONT.filter((p) => has(p, era, day)).length;
const arrTxt = (d) => (d == null ? 'no llega antes del 30 nov' : d < D0 ? 'antes del 1 sep' : dateOf(d));

// Lista ordenada junto al mapa (hace de ranking de días robados)
const list = $('#map-list');
const listRows = new Map();
for (const p of P) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ml-row';
  b.innerHTML = `<span class="ml-pos"></span><span class="ml-name">${p.name}${p.st.shift.flat ? ' *' : ''}</span><span class="ml-val"></span>`;
  b.addEventListener('click', () => setProv(p.id));
  list.querySelector('.ml-inner').appendChild(b);
  listRows.set(p.id, b);
}
const ROW = 24;
// Rojo legible sobre el fondo oscuro (contraste de 5:1 o más): de papel a brasa
const textHeat = (v) => { const k = Math.min(1, Math.max(0, v / 20)) ** 0.8; return rgb([241, 230, 212].map((c, j) => Math.round(c + ([240, 90, 58][j] - c) * k))); };
// Un solo punto de parada con Tab; las flechas recorren la lista en el orden en que se ve
function markRow(id) { listRows.forEach((r, k) => { r.classList.toggle('on', k === id); r.toggleAttribute('aria-current', k === id); r.tabIndex = k === id ? 0 : -1; }); }
list.addEventListener('keydown', (e) => {
  const rows = [...listRows.values()].sort((a, b) => a.dataset.i - b.dataset.i), i = rows.indexOf(document.activeElement);
  if (i < 0) return;
  const j = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: rows.length - 1 }[e.key];
  if (j == null) return;
  e.preventDefault();
  const r = rows[Math.max(0, Math.min(rows.length - 1, j))];
  rows.forEach((x) => (x.tabIndex = x === r ? 0 : -1));
  r.focus({ preventScroll: true });
  const y = +r.dataset.i * ROW;
  if (y < list.scrollTop || y + ROW > list.scrollTop + list.clientHeight) list.scrollTop = y - list.clientHeight / 2;
});
const ranked = [...FRONT].sort((a, b) => b.st.shift.days - a.st.shift.days);
[...ranked, ...P.filter((p) => p.st.shift.flat)].forEach((p, i) => {
  const r = listRows.get(p.id), v = p.st.shift.days;
  r.dataset.i = i;
  r.style.transform = `translateY(${i * ROW}px)`;
  r.querySelector('.ml-pos').textContent = i < ranked.length ? i + 1 : '';
  r.querySelector('.ml-val').textContent = `${signed(v, 0)} días`;
  r.querySelector('.ml-val').style.color = textHeat(v);
});
list.querySelector('.ml-inner').style.height = `${P.length * ROW}px`;
function scrollListTo(id) {
  const r = listRows.get(id);
  if (!r) return;
  const y = +r.dataset.i * ROW;
  list.scrollTo({ top: Math.max(0, y - list.clientHeight / 2 + ROW / 2), behavior: reduced ? 'auto' : 'smooth' });
}

// Una sola pasada que compara: cada provincia está en verano (antes y hoy), en otoño (antes y hoy)
// o con el otoño robado (antes ya era otoño, hoy sigue siendo verano). La ola roja es el robo.
const lastArr = (era) => Math.max(...FRONT.map((p) => p.arr[era] ?? D1));
const ALL = { antes: lastArr('antes'), hoy: lastArr('hoy') };
const ALL_DAY = Math.round(ALL.antes), DEND = Math.round(ALL.hoy);
const robbedAt = (day) => FRONT.filter((p) => has(p, 'antes', day) && !has(p, 'hoy', day));
const COL = { verano: 'rgb(150,86,44)', otono: 'rgb(124,200,230)', nada: 'rgba(159,179,185,.38)', robado: 'rgb(240,90,58)' };
const front = { day: D0 };
let raf = 0, playing = false;
const playBtn = $('#play');

// Dos mapas planos sincronizados, antes y hoy, el mismo día. Canarias, en un recuadro abajo a la izquierda.
const PROJ = { lon: [-10.5, 4.5], lat: [35.1, 43.9], k: Math.cos((39.5 * Math.PI) / 180) };
const IC = { lon: [-18.3, -13.3], lat: [27.5, 29.5], k: Math.cos((28.5 * Math.PI) / 180) };
const cv = { antes: $('#map-antes'), hoy: $('#map-hoy') };
const shaped = data.provinces.filter((p) => p.shapes.length);
let geo = null, hoverId = null;
function buildGeo(w) {
  const sx = w / ((PROJ.lon[1] - PROJ.lon[0]) * PROJ.k), h = Math.round((PROJ.lat[1] - PROJ.lat[0]) * sx);
  const iw = w * 0.24, isx = iw / ((IC.lon[1] - IC.lon[0]) * IC.k), ih = (IC.lat[1] - IC.lat[0]) * isx, ix = 1, iy = h - ih - 1;
  const pt = (lo, la, ic) => (ic ? [ix + (lo - IC.lon[0]) * IC.k * isx, iy + (IC.lat[1] - la) * isx] : [(lo - PROJ.lon[0]) * PROJ.k * sx, (PROJ.lat[1] - la) * sx]);
  const paths = new Map(shaped.map((p) => {
    const path = new Path2D(), ic = p.id.startsWith('ES70');
    for (const ring of p.shapes) ring.forEach(([lo, la], i) => path[i ? 'lineTo' : 'moveTo'](...pt(lo, la, ic)));
    path.closePath();
    return [p.id, path];
  }));
  return { w, h, paths, ic: [ix, iy, iw, ih] };
}
const kind = (p, era, day) => (!p.st?.shift || p.st.shift.flat ? 'nada' : has(p, era, day) ? 'otono' : 'verano');
function drawMaps() {
  const w = cv.antes.clientWidth, dpr = Math.min(devicePixelRatio, 2);
  if (!w) return;
  if (!geo || geo.w !== w) {
    geo = buildGeo(w);
    for (const c of Object.values(cv)) { c.width = w * dpr; c.height = geo.h * dpr; c.style.height = `${geo.h}px`; }
  }
  for (const era of ['antes', 'hoy']) {
    const ctx = cv[era].getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, geo.h);
    ctx.strokeStyle = 'rgba(241,230,212,.18)'; ctx.lineWidth = 1;
    ctx.strokeRect(...geo.ic);
    ctx.lineJoin = 'round';
    for (const p of shaped) {
      const path = geo.paths.get(p.id);
      ctx.fillStyle = COL[kind(p, era, front.day)];
      ctx.fill(path);
      ctx.strokeStyle = 'rgba(13,27,36,.95)'; ctx.lineWidth = 0.8; ctx.stroke(path);
    }
    // En el de hoy, borde rojo donde antes ya era otoño ese día
    if (era === 'hoy') {
      ctx.strokeStyle = COL.robado; ctx.lineWidth = 2.2;
      for (const p of robbedAt(front.day)) ctx.stroke(geo.paths.get(p.id));
    }
    for (const [id, color, lw] of [[hoverId, 'rgba(241,230,212,.7)', 1.6], [state.prov, '#f1e6d4', 2.4]]) {
      const path = id && geo.paths.get(id);
      if (path) { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(path); }
    }
  }
}
new ResizeObserver(() => drawMaps()).observe(cv.antes);
// Hover y clic en cualquiera de los dos mapas
const tip = $('#map-tip');
function pick(e, era) {
  const c = cv[era], r = c.getBoundingClientRect(), dpr = c.width / r.width, ctx = c.getContext('2d');
  const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
  const p = geo && shaped.find((q) => ctx.isPointInPath(geo.paths.get(q.id), x, y));
  if (!p) { hideTip(); return null; }
  if (hoverId !== p.id) { hoverId = p.id; drawMaps(); }
  const k = kind(p, era, front.day), t = p.st?.shift && tempAt(p, front.day, era);
  const what = k === 'nada' ? (p.st?.shift ? 'no baja de 18 °C en otoño' : 'sin estación con datos')
    : k === 'otono' ? 'ya es otoño' : era === 'hoy' && has(p, 'antes', front.day) ? 'aún verano; <em>antes ya era otoño</em>' : 'aún verano';
  tip.innerHTML = `<b>${p.name}</b><span>${t != null && p.st?.shift ? `${f1(t)} °C · ` : ''}${what}</span><span class="tip-st">${era === 'hoy' ? 'hoy' : 'antes, 1961–1990'}</span>`;
  tip.hidden = false;
  const wr = tip.offsetParent.getBoundingClientRect(), tx = e.clientX - wr.left, ty = e.clientY - wr.top;
  tip.style.left = `${Math.max(0, Math.min(tx + 14, wr.width - tip.offsetWidth))}px`;
  tip.style.top = `${ty + 16}px`;
  return p;
}
function hideTip() { tip.hidden = true; if (hoverId) { hoverId = null; drawMaps(); } }
for (const era of ['antes', 'hoy']) {
  const c = cv[era];
  c.addEventListener('pointermove', (e) => { const p = pick(e, era); c.style.cursor = p ? 'pointer' : 'default'; });
  c.addEventListener('pointerleave', hideTip);
  c.addEventListener('click', (e) => { const p = pick(e, era); if (p) setProv(p.id); });
}

let paintKey = '';
function renderMap(force = false) {
  const day = Math.round(front.day);
  if (force || day !== paintKey) drawMaps();
  paintKey = day;
  $('#day-big').textContent = dateOf(day);
  $('#day-range').value = day;
  $('#front-note').innerHTML = frontNote(day);
  if (!playing) setPlayLabel();
  $$('#keys button').forEach((b) => { b.classList.toggle('on', +b.dataset.d === day); b.setAttribute('aria-pressed', +b.dataset.d === day); });
  const N = FRONT.length, nA = nArrived('antes', front.day), nH = nArrived('hoy', front.day), nR = robbedAt(front.day).length;
  const row = (lbl, n, cls) => `<div class="fc-row on ${cls}"><span>${lbl}</span><span class="fc-bar"><i style="width:${(n / N) * 100}%"></i></span><span class="fc-n">${n}</span></div>`;
  $('#front-count').innerHTML = row('Antes', nA, 'fc-antes') + row('Hoy', nH, 'fc-hoy') + row('Robadas', nR, 'fc-rob')
    + `<p class="fc-cap">provincias donde ya es otoño, de ${N}. Robadas: antes ya era otoño, hoy aún no</p>`;
}

function renderPanel() {
  const p = byId[state.prov], st = p.st, sh = st.shift, s = sh.trend;
  $('#st-name').textContent = p.name;
  $('#st-meta').innerHTML = `${shortSt(st.name)} · ${f0(st.alt)} m${st.tier === 'B' ? ' · <span class="badge">serie parcial</span>' : ''}`;
  $('#st-arrive').innerHTML = sh.flat
    ? 'La media no baja de 18 °C en todo el otoño.'
    : `Bajaba de 18 °C el <b>${arrTxt(p.arr.antes)}</b>. Hoy, el <b class="t-warm">${arrTxt(p.arr.hoy)}</b>.`;
  $('#st-value').textContent = `${signed(sh.days, 0)} días`;
  const pos = ranked.indexOf(p);
  $('#st-rank').textContent = sh.flat ? 'Otoño casi sin enfriamiento: la cifra en días no es comparable' : `Puesto ${pos + 1} de ${ranked.length} en días robados`;
  const from = st.own?.from ? `Datos medidos en ${shortSt(st.own.from.name)}, a ${f1(st.own.from.km)} km. ` : '';
  const sp = p.spread;
  $('#st-spread').innerHTML = from + (sp?.n > 1 && sp.shift
    ? `${sp.n} estaciones con datos propios en la provincia: de ${f0(sp.shift[0])} a ${f0(sp.shift[2])} días.`
    : sp?.n > 1 ? `${sp.n} estaciones con datos propios en la provincia.` : 'Única estación con datos propios de la provincia.');
  drawSpark($('#st-spark'), s, refOf(p));
  const s0 = s.smooth.find((v) => v != null), y0 = Y0 + s.smooth.findIndex((v) => v != null);
  $('#st-spark').setAttribute('aria-label', `Gráfico: días robados cada año en ${p.name}. La tendencia pasa de ${lateTxt(s0)} en ${y0} a ${lateTxt(s.smooth.at(-1))} en ${Y1}.`);
}

function drawSpark(svg, s, ref) {
  const w = 300, h = 90, pad = 6;
  const vals = [...s.yearly, ...s.smooth].filter((v) => v != null);
  if (!vals.length) { svg.innerHTML = ''; return; }
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const X = (y) => pad + ((y - Y0) / (Y1 - Y0)) * (w - pad * 2), Y = (v) => h - pad - ((v - lo) / (hi - lo || 1)) * (h - pad * 2);
  let line = '', pen = false;
  s.smooth.forEach((v, i) => { if (v == null) { pen = false; return; } line += `${pen ? 'L' : 'M'}${X(Y0 + i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
  const cur = s.smooth.at(-1);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = `<g aria-hidden="true"><line x1="${pad}" x2="${w - pad}" y1="${Y(0)}" y2="${Y(0)}" class="sp-ref"/>
    ${s.yearly.map((v, i) => (v == null ? '' : `<circle cx="${X(Y0 + i)}" cy="${Y(v)}" r="1.6" class="sp-yr"/>`)).join('')}
    <path d="${line}" class="sp-smooth"/>
    ${cur != null ? `<circle cx="${X(Y1)}" cy="${Y(cur)}" r="3.5" class="sp-dot"/>` : ''}</g>`;
  $('#spark-ref').textContent = ref;
}

function renderScale() {
  $('#scale').innerHTML = `<span class="sc-keys"><span><i style="background:${COL.verano}"></i>aún verano</span><span><i style="background:${COL.otono}"></i>ya es otoño</span><span><i class="sc-rob"></i>antes ya era otoño</span><span><i style="background:${COL.nada}"></i>Canarias, no comparable</span></span>`;
}
// Marcas de la línea de tiempo, colocadas en su día
$('#day-range').max = DEND;
$('#jumps').innerHTML = [[D0, '1 sep'], [OCT1, '1 oct'], [305, '1 nov'], [DEND, dateOf(DEND)]]
  .map(([d, t]) => `<span style="left:${((d - D0) / (DEND - D0)) * 100}%">${t}</span>`).join('');
$('#keys').innerHTML = [[OCT1, `${dateOf(OCT1)}: ${nArrived('antes', OCT1)} frente a ${nArrived('hoy', OCT1)}`], [ALL_DAY, `${dateOf(ALL_DAY)}: toda España, antes`], [DEND, `${dateOf(DEND)}: toda España, hoy`]]
  .map(([d, t]) => `<button type="button" data-d="${d}">${t}</button>`).join('');

// Controles: día, época, reproducir
$('#day-range').addEventListener('input', (e) => { stop(); front.day = +e.target.value; renderMap(); });
// Fechas clave, también como botones en la línea de tiempo
const KEYS = [OCT1, ALL_DAY, DEND];
$$('#keys button').forEach((b) => b.addEventListener('click', () => { stop(); front.day = +b.dataset.d; renderMap(); }));
function setPlayLabel() {
  playBtn.setAttribute('aria-pressed', String(playing));
  $('#front-note').setAttribute('aria-live', playing ? 'off' : 'polite');
  playBtn.querySelector('span').textContent = playing ? 'Pausa' : front.day >= DEND ? 'Ver otra vez' : 'Ver llegar el otoño';
}
function stop() {
  playing = false;
  cancelAnimationFrame(raf);
  setPlayLabel();
}
// Avanza 9 días por segundo y se detiene un momento en cada fecha clave, sin pedir nada
function play() {
  cancelAnimationFrame(raf);
  if (front.day >= DEND) front.day = D0;
  playing = true;
  setPlayLabel();
  let last = performance.now(), holdUntil = 0;
  const step = (now) => {
    if (!playing) return;
    const dt = (now - last) / 1000;
    last = now;
    if (now < holdUntil) { raf = requestAnimationFrame(step); return; }
    const next = Math.min(DEND, front.day + dt * 9);
    const k = KEYS.find((d) => front.day < d && next >= d);
    front.day = k ?? next;
    renderMap();
    if (front.day >= DEND) { stop(); return; }
    if (k && !reduced) holdUntil = now + 2600;
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
const names = (ps) => {
  const n = ps.map((p) => p.name).sort((a, b) => a.localeCompare(b, 'es'));
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} y ${n.at(-1)}` : n[0] ?? '';
};
// La frase que acompaña a los mapas: cambia con el día, sin botones
function frontNote(day) {
  const d = Math.round(day), nA = nArrived('antes', d), nH = nArrived('hoy', d), miss = robbedAt(d);
  if (d >= DEND) return `Hoy el otoño tarda <b>${DEND - ALL_DAY} días</b> más en llegar a toda España: el ${dateOf(DEND)}, no el ${dateOf(ALL_DAY)}.`;
  if (d >= ALL_DAY) return `Antes, el ${dateOf(ALL_DAY)} ya era otoño en toda España. Hoy aún faltan <b>${miss.length}</b>.<small>${names(miss)}</small>`;
  if (!nA) return 'Aún es verano en toda España, antes y hoy.';
  return `El ${dateOf(d)}, antes ya era otoño en <b>${nA}</b> ${nA === 1 ? 'provincia' : 'provincias'}. Hoy, en <b>${nH}</b>.`;
}
playBtn.addEventListener('click', () => (playing ? stop() : play()));
// La primera vez que se ve el mapa, arranca solo
let mapSeen = false;
new IntersectionObserver(([e]) => {
  if (e.isIntersecting && !mapSeen && !reduced) { mapSeen = true; setTimeout(() => { if (!playing && front.day === D0) play(); }, 600); }
}, { threshold: 0.6 }).observe($('.duo'));

// ---------- Muro ----------
const wall = createWall($('#wall'), $('#wall-tip'), { reduced, onPick: (id) => setProv(id) });
wall.setRows(P);
// Cuántos otoños llegaron tarde desde 2015, en todas las provincias comparables
{
  let late = 0, n = 0;
  for (const p of FRONT) { const t = p.st.shift.trend; for (let y = 2015; y <= 2025; y++) { const v = t.yearly[y - t.from]; if (v == null) continue; n++; if (v > 0) late++; } }
  if (n) $('#wall-late').textContent = f0((100 * late) / n);
}

// ---------- El culpable: la cuesta del otoño ----------
// La curva de antes y la misma desplazada los días robados: misma pendiente, más arriba
function renderCulprit() {
  const p = byId[state.prov], sh = p.st.shift, svg = $('#cul-chart');
  // Tamaño real en píxeles, para que el texto no encoja en el móvil
  const w = Math.max(300, Math.round(svg.clientWidth || 600)), h = Math.round(Math.min(320, Math.max(220, w * 0.5))), pl = 34, pr = 10, pt = 14, pb = 26;
  const antes = (d) => curveT(p, d), hoy = (d) => curveT(p, d - sh.days);
  const days = [];
  for (let d = D0; d <= D1; d++) days.push(d);
  const vals = days.flatMap((d) => [antes(d), hoy(d)]);
  const lo = Math.floor(Math.min(AUT_T, ...vals) - 1), hi = Math.ceil(Math.max(AUT_T, ...vals) + 1);
  const X = (d) => pl + ((d - D0) / (D1 - D0)) * (w - pl - pr), Y = (v) => pt + ((hi - v) / (hi - lo)) * (h - pt - pb);
  const path = (f) => days.map((d, i) => `${i ? 'L' : 'M'}${X(d).toFixed(1)},${Y(f(d)).toFixed(1)}`).join('');
  // Cuánto más arriba está la cuesta: diferencia media en la ventana del ajuste (15 sep - 15 nov)
  let lift = 0;
  for (let d = 258; d <= 319; d++) lift += hoy(d) - antes(d);
  lift /= 62;
  const yTicks = [];
  for (let v = Math.ceil(lo / 4) * 4; v <= hi; v += 4) yTicks.push(v);
  const a = p.arr.antes, b = p.arr.hoy, ok = !sh.flat && a != null && b != null && a >= D0;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = `<g aria-hidden="true">
    ${yTicks.map((v) => `<line x1="${pl}" x2="${w - pr}" y1="${Y(v)}" y2="${Y(v)}" class="cul-grid"/><text x="${pl - 6}" y="${Y(v) + 4}" class="cul-ax" text-anchor="end">${v}°</text>`).join('')}
    ${[[D0, '1 sep'], [OCT1, '1 oct'], [305, '1 nov'], [D1, '30 nov']].map(([d, l], i) => `<text x="${X(d)}" y="${h - 6}" class="cul-ax" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${l}</text>`).join('')}
    <line x1="${pl}" x2="${w - pr}" y1="${Y(AUT_T)}" y2="${Y(AUT_T)}" class="cul-thr"/>
    <text x="${w - pr}" y="${Y(AUT_T) - 6}" class="cul-ax" text-anchor="end">18 °C: llega el otoño</text>
    ${ok ? `<rect x="${X(a)}" y="${Y(AUT_T) - 5}" width="${Math.max(0, X(b) - X(a))}" height="10" class="cul-gap"/>` : ''}
    <path d="${path(antes)}" class="cul-antes"/>
    <path d="${path(hoy)}" class="cul-hoy"/>
    ${ok ? `<circle cx="${X(a)}" cy="${Y(AUT_T)}" r="4.5" class="cul-dot-a"/><circle cx="${X(b)}" cy="${Y(AUT_T)}" r="4.5" class="cul-dot-h"/>
    <text x="${X(a) - 10}" y="${Y(AUT_T) + 24}" class="cul-lbl" text-anchor="end">+${f0(sh.days)} días</text>` : ''}</g>`;
  svg.setAttribute('aria-label', ok
    ? `Gráfico: temperatura media de cada día de otoño en ${p.name}. En el otoño de antes bajaba de 18 °C el ${dateLong(a)}; hoy, la curva está ${f1(Math.abs(lift))} °C más ${lift >= 0 ? 'arriba' : 'abajo'} y baja de 18 °C el ${dateLong(b)}.`
    : `Gráfico: temperatura media de cada día de otoño en ${p.name}, antes y hoy. Hoy la curva está ${f1(Math.abs(lift))} °C más ${lift >= 0 ? 'arriba' : 'abajo'}.`);
  $('#cul-deg').textContent = `${signed(lift, 1)} °C`;
  $('#cul-days').textContent = `${f0(sh.days)} días`;
  $('#cul-claim').hidden = sh.flat;
  $('#cul-flat').hidden = !sh.flat;
}
let culW = 0;
addEventListener('resize', () => { const w = $('#cul-chart').clientWidth; if (w !== culW) { culW = w; renderCulprit(); } }, { passive: true });

// ---------- Comparte: la denuncia ----------
// Días robados en tu vida: la suma, otoño a otoño desde que naciste, de cuántos días tarde llegó
// (tendencia suavizada frente a la referencia). Un otoño de septiembre a noviembre son 91 días.
const lifeStolen = () => lifeOf(byId[state.prov].st.shift, state.born);
const card = $('#share-canvas');
// Denuncia personal (desde que naciste) o de toda la provincia. Sin elegir, manda el año de nacimiento
let shareMode = null;
const modeOf = () => shareMode ?? (state.born ? 'me' : 'prov');
const isMine = () => modeOf() === 'me' && lifeStolen()?.total >= 1;
// El enlace lleva lo que hace falta para que su vista previa (netlify/edge-functions/og-meta.js) sea esta misma denuncia
const pageUrl = () => `${location.origin}${location.pathname}?provincia=${slug(byId[state.prov].name)}${isMine() ? `&nacimiento=${state.born}` : ''}`;
function shareText() {
  const p = byId[state.prov], sh = p.st.shift, life = lifeStolen();
  if (modeOf() === 'me' && life && life.total >= 1) {
    return `Desde que nací, el otoño me ha llegado tarde en ${p.name} tantas veces que me han robado ${f0(life.total)} días de otoño: ${otonosTxt(life.total)}. ¡Que me los devuelvan! ¿Cuántos te han robado a ti? #NosHanRobadoElOtoño`;
  }
  return `En ${p.name}, el otoño llega ${f0(sh.days)} días más tarde que en ${refOf(p)}. Nos han robado el otoño. ¡Que nos lo devuelvan! #NosHanRobadoElOtoño`;
}

function renderShare() {
  const p = byId[state.prov], sh = p.st.shift, life = lifeStolen(), mode = modeOf(), mine = mode === 'me' && life && life.total >= 1;
  const css = getComputedStyle(document.documentElement);
  drawCard(card, { p, life, mine, D: css.getPropertyValue('--font-display'), M: css.getPropertyValue('--font-data') });

  $('#share-text').textContent = shareText();
  $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === mode));
  $('#share-born-wrap').hidden = mode !== 'me';
  $('#share-h').textContent = mode === 'me' ? '¡Que me los devuelvan!' : '¡Que nos los devuelvan!';
  $('#share-lead').innerHTML = mine
    ? `Desde ${life.from === state.born ? `que naciste, en ${state.born}` : life.from}, cada otoño en ${p.name} ha llegado un poco más tarde. Sumados, te han robado <b>${f0(life.total)} días de otoño</b>: ${otonosTxt(life.total)}.`
    : sh.flat ? `En ${p.name} el otoño apenas se enfría y la cifra en días no es comparable. Puedes denunciar igual.`
    : mode === 'prov' ? `La cifra de toda la provincia: en ${p.name}, el otoño llega <b>${f0(sh.days)} días</b> más tarde cada año que en ${refOf(p)}.`
    : state.born ? `Con tu año de nacimiento, en ${p.name} no salen días robados que sumar.`
    : `Indica en qué año naciste para sumar todos los días de otoño que te han robado en ${p.name}.`;
  $('#share-fine').innerHTML = mine ? `Cuenta: cada año desde ${life.from}, los días que el otoño llegó tarde según la tendencia (no el año suelto), frente al ${ANTES} (media de ${refOf(p).replace('–', ' a ')}). Los otoños que se adelantaron descuentan. ${life.n} otoños sumados.` : '';
  $('#share-img').src = card.toDataURL('image/png');
  $('#share-img').alt = mine ? `Imagen de la denuncia: desde que nací me han robado ${f0(life.total)} días de otoño en ${p.name}.` : `Imagen de la denuncia: en ${p.name} nos roban ${f0(sh.days)} días de otoño cada año.`;
}
$$('.seg button').forEach((b) => b.addEventListener('click', () => {
  shareMode = b.dataset.mode;
  renderShare();
  if (shareMode === 'me' && !state.born) $('#share-born').focus();
}));
$('#share-copy').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  try { await navigator.clipboard.writeText(`${shareText()} ${pageUrl()}`); b.textContent = 'Copiado'; }
  catch { const r = document.createRange(); r.selectNodeContents($('#share-text')); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = 'Selecciónalo y cópialo'; }
  setTimeout(() => (b.textContent = 'Copiar texto y enlace'), 2000);
});
// 'ok', 'cancel' (la persona cerró el menú) o 'fail' (no hay menú de compartir)
async function shareCard() {
  try {
    const blob = await new Promise((r) => card.toBlob(r, 'image/png'));
    const file = new File([blob], 'mi-otono.png', { type: 'image/png' });
    const payload = { text: shareText(), url: pageUrl() };
    if (navigator.canShare?.({ files: [file] })) payload.files = [file];
    await navigator.share(payload);
    return 'ok';
  } catch (e) { return e?.name === 'AbortError' ? 'cancel' : 'fail'; }
}
// En el ordenador, el menú de compartir del sistema hace cosas raras (Chrome en macOS copia la imagen dos veces)
$('#share-native').hidden = !(navigator.share && matchMedia('(pointer: coarse)').matches);
$('#share-native').addEventListener('click', async () => {
  if ((await shareCard()) === 'fail') $('#share-hint').hidden = false;
});
$('#share-dl').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = card.toDataURL('image/png');
  a.download = `otono-${byId[state.prov].name.toLowerCase().replace(/\s+/g, '-')}.png`;
  a.click();
});

// ---------- Metodología ----------
function renderTable() {
  $('#prov-table tbody').innerHTML = [...data.provinces].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((p) => {
    if (!p.st?.shift) return `<tr><th scope="row">${p.name}</th><td colspan="5" class="na">Sin estación con serie suficiente en ECA&amp;D</td></tr>`;
    const sh = p.st.shift, t = P.find((q) => q.id === p.id)?.temp.smooth.at(-1);
    return `<tr><th scope="row">${p.name}<small>${shortSt(p.st.name)} · ${f0(p.st.alt)} m${p.st.tier === 'B' ? ' · serie parcial' : ''}</small></th>
      <td>${refOf(p)}</td>
      <td>${f1(sh.days)}${sh.flat ? ' *' : ''}<small> ${f0(sh.lo)} a ${f0(sh.hi)}</small></td>
      <td>${p.spread?.n > 1 && p.spread.shift ? `${f0(p.spread.shift[0])} a ${f0(p.spread.shift[2])}<small> ${p.spread.n} estaciones</small>` : 's. d.'}</td>
      <td>${t == null ? 's. d.' : signed(t)}</td><td>${p.st.complete}</td></tr>`;
  }).join('');
  $('#built').textContent = data.source.built;
}

// ---------- Arranque ----------
if (state.born) bornInputs.forEach((i) => (i.value = state.born));
renderScale();
renderTable();
setProv(state.prov);
document.fonts?.ready.then(renderShare);
// La barra superior aparece al salir de la portada
// Escondida, la barra no debe recibir el foco del teclado
new IntersectionObserver(([e]) => { $('#topbar').classList.toggle('show', !e.isIntersecting); $('#topbar').inert = e.isIntersecting; }, { threshold: 0.05 }).observe(heroEl);
// Bocadillo del «otoño de antes»: al pasar el cursor o enfocar; en táctil, el primer toque lo abre
const pop = $('#antes-pop'), coarse = matchMedia('(pointer: coarse)');
pop.innerHTML = `<b>El otoño de antes</b><span>Cómo llegaba el otoño, de media, entre 1961 y 1990, antes de casi todo el calentamiento. Es la referencia de la Organización Meteorológica Mundial; todo en esta web se mide contra él.</span><a href="#metodo-antes">Leer más</a>`;
let popFor = null, popOut = 0, tapped = null;
function showPop(a) {
  clearTimeout(popOut);
  popFor = a; pop.hidden = false; a.setAttribute('aria-describedby', 'antes-pop');
  const r = a.getBoundingClientRect(), w = pop.offsetWidth, hgt = pop.offsetHeight;
  const x = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12));
  const below = r.top < hgt + 20;
  pop.style.left = `${x}px`;
  pop.style.top = `${below ? r.bottom + 8 : r.top - hgt - 8}px`;
}
function hidePop(now) {
  clearTimeout(popOut);
  const go = () => { pop.hidden = true; popFor = tapped = null; };
  now ? go() : (popOut = setTimeout(go, 160));
}
document.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') { const a = e.target.closest('a.antes'); if (a) showPop(a); else if (e.target.closest('#antes-pop')) clearTimeout(popOut); } });
document.addEventListener('pointerout', (e) => { if (e.pointerType === 'mouse' && (e.target.closest('a.antes') || e.target.closest('#antes-pop'))) hidePop(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) hidePop(true); });
document.addEventListener('focusin', (e) => { const a = e.target.closest?.('a.antes'); if (a) showPop(a); });
document.addEventListener('focusout', (e) => { if (e.target.closest?.('a.antes') && !tapped) hidePop(); });
document.addEventListener('click', (e) => {
  const a = e.target.closest('a.antes');
  if (a && coarse.matches && tapped !== a) { e.preventDefault(); showPop(a); tapped = a; return; }
  if (a || e.target.closest('#antes-pop a')) { hidePop(true); return; }
  if (!e.target.closest('#antes-pop')) hidePop(true);
});
addEventListener('scroll', () => popFor && !pop.hidden && showPop(popFor), { passive: true });
// La definición vive en la metodología, que está plegada: se abre al saltar a ella
const method = $('#metodo details');
const openMethod = () => { if (location.hash === '#metodo-antes') method.open = true; };
document.addEventListener('click', (e) => { if (e.target.closest('a[href="#metodo-antes"]')) method.open = true; }, true);
addEventListener('hashchange', openMethod);
openMethod();
document.documentElement.classList.add('ready');
