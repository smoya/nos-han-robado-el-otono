// Tarjeta de la denuncia. Sin DOM: la dibuja el navegador (Comparte) y también el servidor
// (netlify/functions/og.mjs) para la vista previa de cada enlace compartido.
import { f0 } from './data.js';

export const AUTUMN = 91;
export const OCT1 = 274;
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const dateOf = (doy) => { const d = new Date(Date.UTC(2001, 0, 1) + (Math.round(doy) - 1) * 864e5); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
export const refOf = (st) => st.shift.trend.base.join('–');
export const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Mismos valores que los tokens de css/style.css
const C = { night: '#0d1b24', paper: '#f1e6d4', muted: '#9fb3b9', leaf: '#e59a2f', ember: '#f05a3a', line: 'rgba(241, 230, 212, 0.14)' };

// Días robados desde que naciste: suma de la tendencia de cada año (los otoños adelantados descuentan)
export function lifeOf(sh, born) {
  if (!born || sh.flat) return null;
  const tr = sh.trend;
  let total = 0, from = null;
  for (let y = born; y <= 2025; y++) {
    const v = tr.smooth[y - tr.from];
    if (v == null) continue;
    from ??= y;
    total += v;
  }
  return from == null ? null : { total: Math.max(0, total), from, n: 2026 - from };
}

export const otonosTxt = (d) => {
  const o = d / AUTUMN;
  if (o < 0.9) return `${Math.round((d / AUTUMN) * 100)} % de un otoño entero`;
  const r = Math.round(o);
  const pre = Math.abs(o - r) < 0.15 ? '' : o < r ? 'casi ' : 'más de ';
  return `${pre}${pre === 'más de ' ? Math.floor(o) : r} ${(pre === 'más de ' ? Math.floor(o) : r) === 1 ? 'otoño entero' : 'otoños enteros'}`;
};

// Sello de goma: caja doble, girada, con desgaste
function stamp(c, x, y, rot, lines, color, size, D) {
  c.save();
  c.translate(x, y); c.rotate(rot);
  c.font = `900 ${size}px ${D}`;
  const w = Math.max(...lines.map((l) => c.measureText(l).width)) + size * 0.9, lh = size * 0.98, h = lines.length * lh + size * 0.6;
  c.strokeStyle = color; c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = size / 7; c.strokeRect(-w / 2, -h / 2, w, h);
  c.lineWidth = size / 23; c.strokeRect(-w / 2 + size * 0.23, -h / 2 + size * 0.23, w - size * 0.46, h - size * 0.46);
  lines.forEach((l, i) => c.fillText(l, 0, -h / 2 + size * 0.3 + lh * (i + 0.5) + size / 17));
  // Desgaste de la tinta
  c.globalCompositeOperation = 'destination-out';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { c.globalAlpha = 0.25 + rnd() * 0.6; c.beginPath(); c.arc((rnd() - 0.5) * w, (rnd() - 0.5) * h, rnd() * size / 22, 0, 7); c.fill(); }
  c.restore();
}

// El desgaste del sello deja agujeros transparentes: se rellenan con el fondo para que la imagen sea opaca
function backfill(c, W, H) {
  c.save(); c.globalCompositeOperation = 'destination-over'; c.fillStyle = C.night; c.fillRect(0, 0, W, H); c.restore();
}

// Texto del sello, del titular y de la cifra según sea denuncia personal o de la provincia
function claim(p, life, mine) {
  return {
    num: f0(mine ? life.total : p.st.shift.days),
    head: mine ? 'ME HAN ROBADO' : `EN ${p.name.toUpperCase()} NOS ROBAN`,
    unit: mine ? 'DÍAS DE OTOÑO' : 'DÍAS DE OTOÑO CADA AÑO',
    seal: mine ? ['¡QUE ME', 'LOS', 'DEVUELVAN!'] : ['¡QUE NOS', 'LOS', 'DEVUELVAN!'],
  };
}

// Tarjeta vertical (1080×1350) para descargar o mandar como imagen
export function drawCard(card, { p, life, mine, D, M }) {
  const sh = p.st.shift, k = claim(p, life, mine);
  const W = 1080, H = 1350, c = card.getContext('2d');
  card.width = W; card.height = H;
  const X = 80, CW = W - 2 * X;
  c.fillStyle = C.night; c.fillRect(0, 0, W, H);
  // Cabecera de atestado
  c.fillStyle = C.leaf; c.font = `600 30px ${M}`; c.textBaseline = 'alphabetic';
  c.fillText('DENUNCIA POR ROBO DE OTOÑO', X, 112);
  c.textAlign = 'right'; c.fillStyle = C.muted;
  c.fillText(`Nº ${p.id.slice(2)}-${k.num}`, W - X, 112);
  c.textAlign = 'left';
  c.fillStyle = C.line; c.fillRect(X, 136, CW, 2);

  c.fillStyle = C.paper; c.font = `800 92px ${D}`;
  c.fillText(k.head, X, 250, CW);
  // La cifra, tan grande como quepa
  let fs = 400;
  c.font = `900 ${fs}px ${D}`;
  while (c.measureText(k.num).width > CW && fs > 120) { fs -= 10; c.font = `900 ${fs}px ${D}`; }
  c.fillStyle = C.ember; c.fillText(k.num, X - 8, 580);
  c.fillStyle = C.paper; c.font = `800 92px ${D}`;
  c.fillText(k.unit, X, 680, CW);

  let y = 740;
  if (mine) {
    c.fillStyle = C.leaf; c.font = `600 40px ${M}`;
    c.fillText(`= ${otonosTxt(life.total)}`, X, y);
    // Un bloque por otoño (91 días); el último, a medias
    const o = life.total / AUTUMN, nb = Math.max(1, Math.ceil(o)), per = Math.min(nb, 10), gap = 14;
    const bw = (CW - gap * (per - 1)) / per, bh = nb > 10 ? 44 : 70, by = y + 36;
    for (let i = 0; i < nb; i++) {
      const bx = X + (i % per) * (bw + gap), yy = by + Math.floor(i / per) * (bh + gap), fill = Math.min(1, o - i);
      c.fillStyle = 'rgba(240,90,58,.14)'; c.fillRect(bx, yy, bw, bh);
      c.fillStyle = C.ember; c.fillRect(bx, yy, bw * fill, bh);
    }
    y = by + Math.ceil(nb / per) * (bh + gap) + 20;
    c.fillStyle = C.muted; c.font = `400 24px ${M}`;
    c.fillText('cada bloque, un otoño entero (1 sep a 30 nov)', X, y);
  } else {
    c.fillStyle = C.leaf; c.font = `600 40px ${M}`;
    c.fillText(`llega el ${dateOf(OCT1 + sh.days)}, no el 1 oct`, X, y);
    // Un otoño de 91 días; los robados, en rojo
    const by = y + 40, bh = 70, dw = CW / AUTUMN, n = Math.max(0, Math.round(sh.days));
    for (let d = 0; d < AUTUMN; d++) {
      c.fillStyle = d < n ? C.ember : 'rgba(240,90,58,.14)';
      c.fillRect(X + d * dw, by, Math.max(1, dw - 2), bh);
    }
    c.fillStyle = C.muted; c.font = `400 24px ${M}`;
    c.fillText(`${n} de los ${AUTUMN} días del otoño (1 sep a 30 nov), cada año`, X, by + bh + 36);
    y = by + bh + 36;
  }
  // Campos del atestado (columna izquierda) y el sello (derecha)
  const fields = [
    ['LUGAR DE LOS HECHOS', p.name],
    ['DENUNCIANTE', mine ? 'yo, desde que nací' : 'toda la provincia'],
    ['MODUS OPERANDI', `en 2025, ${f0(sh.days)} días tarde`],
  ];
  y = Math.max(y + 70, 960);
  const fy = y, FW = 560;
  for (const [key, val] of fields) {
    c.fillStyle = C.muted; c.font = `500 22px ${M}`; c.fillText(key, X, y);
    c.fillStyle = C.paper; c.font = `500 32px ${M}`; c.fillText(val, X, y + 40, FW);
    c.fillStyle = 'rgba(159,179,185,.25)'; c.fillRect(X, y + 56, FW, 1);
    y += 92;
  }
  stamp(c, X + FW + (CW - FW) / 2 + 6, fy + 110, -0.2, k.seal, C.ember, 70, D);
  c.fillStyle = C.muted; c.font = `400 22px ${M}`; c.textAlign = 'left';
  c.fillText(`Frente al otoño de antes (${refOf(p.st)}) · Datos: ECA&D (incluye AEMET)`, X, H - 50, CW);
  backfill(c, W, H);
}

// Vista previa apaisada (1200×630) para Slack, WhatsApp, X…
export function drawPreview(card, { p, life, mine, D, M }) {
  const k = claim(p, life, mine);
  const W = 1200, H = 630, c = card.getContext('2d');
  card.width = W; card.height = H;
  const X = 64, CW = W - 2 * X;
  c.fillStyle = C.night; c.fillRect(0, 0, W, H);
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.fillStyle = C.leaf; c.font = `600 24px ${M}`;
  c.fillText('DENUNCIA POR ROBO DE OTOÑO', X, 78);
  c.textAlign = 'right'; c.fillStyle = C.muted;
  c.fillText(`Nº ${p.id.slice(2)}-${k.num}`, W - X, 78);
  c.textAlign = 'left';
  c.fillStyle = C.line; c.fillRect(X, 98, CW, 2);

  // Columna izquierda: titular, cifra y unidad; a la derecha, el sello
  const LW = 700;
  c.fillStyle = C.paper; c.font = `800 72px ${D}`;
  c.fillText(k.head, X, 182, LW);
  let fs = 260;
  c.font = `900 ${fs}px ${D}`;
  while (c.measureText(k.num).width > LW && fs > 100) { fs -= 10; c.font = `900 ${fs}px ${D}`; }
  c.fillStyle = C.ember; c.fillText(k.num, X - 6, 418);
  c.fillStyle = C.paper; c.font = `800 64px ${D}`;
  c.fillText(k.unit, X, 492, LW);
  c.fillStyle = C.leaf; c.font = `600 28px ${M}`;
  c.fillText(mine ? `= ${otonosTxt(life.total)}, en ${p.name} desde ${life.from}` : `llega el ${dateOf(OCT1 + p.st.shift.days)}, no el 1 oct`, X, 546, CW);

  stamp(c, X + LW + (CW - LW) / 2 + 10, 300, -0.2, k.seal, C.ember, 64, D);
  c.fillStyle = C.muted; c.font = `400 20px ${M}`; c.textAlign = 'right';
  c.fillText('noshanrobado.es/otono', W - X, 596);
  backfill(c, W, H);
}
