// «El otoño se desliza»: una franja del 1 de septiembre al 30 de noviembre coloreada con la temperatura
// media de cada día. Con los años, la franja se desplaza hacia la derecha frente a un alfiler fijo en el
// 1 de octubre: el hueco entre el alfiler y el marcador son los días robados.
// El desplazamiento de cada año sale de la tendencia suavizada (scripts/shift.py), frente al otoño de antes (1961-1990).
import { heat, rgb, f0, ANTES, lateTxt } from './data.js';

const D0 = 244, D1 = 334, OCT1 = 274; // 1 sep, 30 nov, 1 oct (día del año, no bisiesto)
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const short = (doy) => {
  const d = new Date(Date.UTC(2001, 0, 1) + (Math.round(doy) - 1) * 864e5);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const nf = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function createSeason(sec, { reduced }) {
  const $ = (q) => sec.querySelector(q);
  const band = $('#se-band'), ctx = band.getContext('2d');
  const chart = $('#se-chart'), slider = $('#se-year-range'), play = $('#se-play');
  const pinMove = $('#se-pin-move'), gap = $('#se-gap');
  let sh = null, tr = null, first = 1950, year = 2025, lo = 0, hi = 1, raf = 0, playing = false, refLabel = '1961–1990', born = null, hov = null, geo = null;

  const ref = (doy) => {
    const a = sh.curves.ref, k = doy - sh.curves.refFrom;
    const i = Math.max(0, Math.min(a.length - 2, Math.floor(k))), t = k - i;
    return a[i] * (1 - t) + a[i + 1] * t;
  };
  // Tendencia en un año fraccionario
  const s = (y) => {
    const a = tr.smooth, k = y - tr.from, i = Math.max(0, Math.min(a.length - 2, Math.floor(k))), t = k - i;
    const v0 = a[i] ?? a[i + 1], v1 = a[i + 1] ?? a[i];
    return v0 == null ? null : v0 * (1 - t) + v1 * t;
  };
  const xOf = (doy) => (doy - D0) / (D1 - D0 + 1);

  function drawBand(sv) {
    const w = band.clientWidth, h = band.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    if (band.width !== Math.round(w * dpr)) { band.width = Math.round(w * dpr); band.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let x = 0; x < w; x++) {
      const doy = D0 + (x / w) * (D1 - D0 + 1);
      ctx.fillStyle = rgb(heat((ref(doy - sv) - lo) / (hi - lo || 1)));
      ctx.fillRect(x, 0, 1.5, h);
    }
    // Separadores de día, muy suaves: le dan textura de calendario
    ctx.fillStyle = 'rgba(13,27,36,.18)';
    for (let d = D0; d <= D1 + 1; d++) ctx.fillRect(Math.round(xOf(d) * w), 0, 1, h);
    // Números de día, como en un calendario: cada 5 días (cada 10 si no caben)
    const every = w < 560 ? 10 : 5;
    ctx.font = `600 ${w < 560 ? 9 : 11}px ${getComputedStyle(sec).getPropertyValue('--font-data')}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (let d = D0; d <= D1; d++) {
      const dom = new Date(Date.UTC(2001, 0, d)).getUTCDate();
      const x = xOf(d + 0.5) * w;
      if (dom === 1) { ctx.fillStyle = 'rgba(13,27,36,.55)'; ctx.fillRect(Math.round(xOf(d) * w) - 1, 0, 2, h); }
      if (dom % every || dom >= 30) continue;
      ctx.fillStyle = 'rgba(13,27,36,.45)'; ctx.fillRect(Math.round(x), h - 7, 1, 7);
      ctx.fillStyle = 'rgba(13,27,36,.72)'; ctx.fillText(String(dom), x, h - 9);
    }
  }

  function drawChart(sv) {
    const W = 760, H = 170, L = 34, R = 10, T = 14, B = 26;
    const vals = [...tr.yearly, ...tr.smooth].filter((v) => v != null);
    const vmin = Math.min(-5, ...vals), vmax = Math.max(10, ...vals);
    const X = (y) => L + ((y - 1950) / 75) * (W - L - R), Y = (v) => T + (1 - (v - vmin) / (vmax - vmin)) * (H - T - B);
    geo = { X, Y, W };
    let line = '', pen = false;
    tr.smooth.forEach((v, i) => {
      if (v == null || tr.from + i > year + 1e-9) { pen = false; return; }
      line += `${pen ? 'L' : 'M'}${X(tr.from + i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true;
    });
    if (sv != null && pen) line += `L${X(year).toFixed(1)},${Y(sv).toFixed(1)}`;
    const dots = tr.yearly.map((v, i) => (v == null ? '' : `<circle cx="${X(tr.from + i)}" cy="${Y(v)}" r="2.6" class="se-dot${tr.from + i <= year ? ' on' : ''}"/>`)).join('');
    const ticks = [];
    for (let v = Math.ceil(vmin / 10) * 10; v <= vmax; v += 10) ticks.push(v);
    // Área bajo la tendencia desde que naciste hasta el año en curso: la suma son tus días robados
    let life = '';
    const b0 = born == null ? null : Math.max(born, first);
    if (b0 != null && b0 <= 2025) {
      let pts = [], sum = 0;
      for (let y = b0; y <= Math.floor(year); y++) {
        const v = tr.smooth[y - tr.from];
        if (v == null) continue;
        pts.push([X(y), Y(v)]); sum += v;
      }
      if (sv != null && year > b0) pts.push([X(year), Y(sv)]);
      if (pts.length > 1) {
        const d = `M${pts[0][0]},${Y(0)}` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join('') + `L${pts.at(-1)[0]},${Y(0)}Z`;
        life = `<clipPath id="se-up"><rect x="0" y="0" width="${W}" height="${Y(0)}"/></clipPath><clipPath id="se-dn"><rect x="0" y="${Y(0)}" width="${W}" height="${H}"/></clipPath>
          <path d="${d}" class="se-area" clip-path="url(#se-up)"/><path d="${d}" class="se-area neg" clip-path="url(#se-dn)"/>
          <text x="${Math.min(X(year), W - R) - 6}" y="${Y(0) + 16}" text-anchor="end" class="se-area-txt">tuyos: ${f0(Math.max(0, sum))} días</text>`;
      }
      life += `<line x1="${X(b0)}" x2="${X(b0)}" y1="${T - 6}" y2="${H - B}" class="se-kid"/><text x="${X(b0) + 5}" y="${T + 4}" class="se-kid-txt">${b0 === born ? 'naciste' : 'desde ' + b0}</text>`;
    }
    chart.setAttribute('viewBox', `0 0 ${W} ${H}`);
    chart.innerHTML = `<g aria-hidden="true">
      ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="se-grid${v === 0 ? ' zero' : ''}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="se-tick">${v > 0 ? '+' : ''}${v}</text>`).join('')}
      
      ${[1950, 1970, 1990, 2010, 2025].map((y) => `<text x="${X(y)}" y="${H - 6}" text-anchor="middle" class="se-tick">${y}</text>`).join('')}
      ${life}
      ${dots}
      <path d="${line}" class="se-trend"/>
      <line x1="${X(year)}" x2="${X(year)}" y1="${T - 6}" y2="${H - B}" class="se-cursor"/>
      ${sv != null ? `<circle cx="${X(year)}" cy="${Y(sv)}" r="6" class="se-now"/>` : ''}
      ${hov != null && tr.yearly[hov - tr.from] != null ? `<circle cx="${X(hov)}" cy="${Y(tr.yearly[hov - tr.from])}" r="5" class="se-hov"/>` : ''}</g>`;
  }

  function render() {
    if (!sh) return;
    const sv = s(year), yi = Math.round(year), latest = yi === 2025;
    $('#se-year').innerHTML = latest ? `${yi}<small>último otoño completo</small>` : yi;
    const cnt = $('#se-days'), lbl = $('#se-lbl'), cap = $('#se-cap');
    if (sv == null) {
      cnt.textContent = '–'; lbl.textContent = 'sin datos suficientes';
      cap.textContent = 'La estación tiene huecos en estos años.';
      gap.hidden = true; pinMove.hidden = true;
      drawBand(0); drawChart(null);
      return;
    }
    const r = Math.round(sv);
    cnt.textContent = f0(Math.abs(r));
    cnt.classList.toggle('more', r < 0);
    lbl.textContent = r > 0 ? `${r === 1 ? 'día' : 'días'} de otoño robados` : r < 0 ? `${r === -1 ? 'día' : 'días'} de otoño de más` : 'días robados';
    const t1 = nf.format(ref(OCT1));
    cap.innerHTML = Math.abs(sv) < 1.5
      ? `En ${yi}, el otoño llegó como el ${ANTES}.`
      : sv > 0
        ? `Los <b>${t1} °C</b> con los que empezaba octubre en el ${ANTES} ${latest ? 'llegan ahora' : `llegaban en ${yi}`} el <b>${short(OCT1 + sv)}</b>.`
        : `En ${yi}, el otoño se adelantaba <b>${f0(-r)} ${r === -1 ? 'día' : 'días'}</b> al ${ANTES}: los ${t1} °C del 1 de octubre llegaban el <b>${short(OCT1 + sv)}</b>.`;
    // Alfiler fijo en el 1 de octubre; marcador que se mueve con el otoño; hueco rayado entre los dos
    const xa = xOf(OCT1) * 100, xb = xOf(OCT1 + sv) * 100;
    pinMove.hidden = false;
    pinMove.style.left = `${xb}%`;
    $('#se-pin-move-date').textContent = short(OCT1 + sv);
    gap.hidden = Math.abs(sv) < 0.5;
    gap.style.left = `${Math.min(xa, xb)}%`;
    gap.style.width = `${Math.abs(xb - xa)}%`;
    gap.classList.toggle('more', sv < 0);
    drawBand(sv);
    drawChart(sv);
    slider.value = yi;
    slider.setAttribute('aria-valuetext', `${yi}: ${nf.format(sv)} días`);
  }

  function stop() {
    playing = false; cancelAnimationFrame(raf);
    play.querySelector('span').textContent = `Reproducir ${first} → 2025`;
    play.setAttribute('aria-pressed', 'false');
  }
  function start() {
    if (year >= 2025) year = first;
    playing = true;
    play.querySelector('span').textContent = 'Pausa';
    play.setAttribute('aria-pressed', 'true');
    let last = performance.now();
    const step = (now) => {
      if (!playing) return;
      // Más despacio al final, donde cambia más
      const speed = year < 1985 ? 11 : 7;
      year = Math.min(2025, year + ((now - last) / 1000) * speed);
      last = now;
      render();
      if (year >= 2025) { stop(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  play.addEventListener('click', () => (playing ? stop() : start()));
  slider.addEventListener('input', () => { stop(); year = +slider.value; render(); });
  // Arrastrar sobre el gráfico para moverse en el tiempo
  const scrub = (e) => {
    const r = chart.getBoundingClientRect(), L = (34 / 760) * r.width, R = (10 / 760) * r.width;
    year = Math.max(first, Math.min(2025, 1950 + ((e.clientX - r.left - L) / (r.width - L - R)) * 75));
    render();
  };
  chart.addEventListener('pointerdown', (e) => { stop(); chart.setPointerCapture(e.pointerId); scrub(e); hover(e); });
  chart.addEventListener('pointermove', (e) => { if (chart.hasPointerCapture(e.pointerId)) scrub(e); hover(e); });
  // Al pasar por encima: el año y la cifra de ese otoño concreto, y la tendencia
  const tip = $('#se-tip');
  const hover = (e) => {
    const r = chart.getBoundingClientRect(), L = (34 / 760) * r.width, R = (10 / 760) * r.width;
    const y = Math.round(1950 + ((e.clientX - r.left - L) / (r.width - L - R)) * 75);
    const v = tr?.yearly[y - tr.from], t = tr?.smooth[y - tr.from];
    if (y < 1950 || y > 2025 || (v == null && t == null)) { unhover(); return; }
    if (hov !== y) { hov = y; render(); }
    const k = r.width / geo.W, d = (n) => `${f0(Math.abs(n))} ${Math.round(Math.abs(n)) === 1 ? 'día' : 'días'}`;
    tip.innerHTML = `<b>${y}</b><span>${v == null ? 'sin datos ese año' : Math.abs(v) < 0.5 ? 'llegó como el otoño de antes' : `llegó <em${v < 0 ? ' class="early"' : ''}>${d(v)} ${v > 0 ? 'más tarde' : 'antes'}</em>`}</span>${t != null ? `<span class="tip-st">tendencia: ${t > 0 ? '+' : t < 0 ? '−' : ''}${nf.format(Math.abs(t))} días</span>` : ''}`;
    tip.hidden = false;
    const wr = tip.offsetParent.getBoundingClientRect(), ox = r.left - wr.left, oy = r.top - wr.top;
    const px = ox + geo.X(y) * k, py = oy + (v != null ? geo.Y(v) : geo.Y(t)) * k;
    tip.style.left = `${Math.max(0, Math.min(px - tip.offsetWidth / 2, wr.width - tip.offsetWidth))}px`;
    tip.style.top = `${py - tip.offsetHeight - 12 < oy - 30 ? py + 14 : py - tip.offsetHeight - 12}px`;
  };
  const unhover = () => { tip.hidden = true; if (hov != null) { hov = null; render(); } };
  chart.addEventListener('pointerleave', unhover);
  chart.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') unhover(); });
  new ResizeObserver(() => render()).observe(band);

  let seen = false;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !seen && sh && !reduced) { seen = true; year = first; render(); setTimeout(start, 500); }
  }, { threshold: 0.5 }).observe(band);

  return {
    // Año de nacimiento (o null): se rellena el área de tus días robados
    setBorn(y) { born = y; $('#se-leg-area').hidden = y == null; if (sh) render(); },
    trendAt: (y) => (sh ? s(y) : null),
    setStation(name, shift) {
      stop();
      sh = shift; tr = shift.trend;
      first = tr.from + tr.smooth.findIndex((v) => v != null);
      refLabel = `${tr.base[0]}–${tr.base[1]}`;
      slider.min = first;
      const sm = tr.smooth.filter((v) => v != null), smax = Math.max(0, ...sm), smin = Math.min(0, ...sm);
      lo = ref(D1 - smin); hi = ref(D0 - smax);
      sec.querySelectorAll('[data-se="name"]').forEach((e) => (e.textContent = name));
      chart.setAttribute('aria-label', `Gráfico: días que llegó tarde cada otoño en ${name}, de ${first} a 2025. La tendencia pasa de ${lateTxt(sm[0])} en ${first} a ${lateTxt(shift.days)} en 2025.`);
      sec.querySelectorAll('[data-se="ref"]').forEach((e) => (e.textContent = refLabel));
      $('#se-margin').textContent = shift.lo != null ? `Tendencia en 2025: ${nf.format(shift.days)} días (margen del 90 %: de ${f0(shift.lo)} a ${f0(shift.hi)}).` : '';
      $('#se-flat').hidden = !shift.flat;
      if (!seen || reduced) year = 2025;
      render();
    },
  };
}
