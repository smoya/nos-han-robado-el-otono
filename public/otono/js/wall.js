// Muro de octubre: una fila por provincia, una columna por año. Color = días que ese año llegó tarde
// (o pronto) el otoño frente al otoño de antes (1961-1990). Un año suelto es ruidoso; el muro enseña que el rojo no es casualidad.
import { YEARS, anomalyColor, rgb, f0 } from './data.js';

const SPAN = 15;

export function createWall(canvas, tip, { reduced, onPick }) {
  const ctx = canvas.getContext('2d');
  let rows = [], w = 0, h = 0, labelW = 0, rowH = 0, gapAt = -1, reveal = 1, hover = null, selected = null;
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim();
  const top = (r) => r * rowH + (gapAt >= 0 && r >= gapAt ? rowH : 0);

  function layout() {
    w = canvas.clientWidth;
    labelW = w < 560 ? 92 : 160;
    rowH = w < 560 ? 11 : 13;
    h = (rows.length + (gapAt >= 0 ? 1 : 0)) * rowH + 22;
    canvas.style.height = `${h}px`;
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const cw = (w - labelW) / YEARS.length, shown = Math.ceil(reveal * YEARS.length);
    ctx.textBaseline = 'middle';
    rows.forEach((p, r) => {
      const y0 = top(r), on = p.id === selected;
      ctx.font = `${on ? 700 : 500} ${rowH < 12 ? 9 : 11}px ${col('--font-data')}`;
      ctx.fillStyle = on ? col('--leaf') : hover?.r === r ? col('--paper') : col('--muted');
      ctx.textAlign = 'right';
      const name = p.name + (p.st.shift.flat ? ' *' : '');
      let txt = name;
      while (txt.length > 4 && ctx.measureText(txt).width > labelW - 12) txt = txt.slice(0, -2) + '…';
      ctx.fillText(txt, labelW - 8, y0 + rowH / 2);
      const ys = p.st.shift.trend.yearly;
      for (let i = 0; i < shown; i++) {
        const v = ys[i];
        ctx.fillStyle = v == null ? 'rgba(159,179,185,.07)' : rgb(anomalyColor(v, SPAN));
        ctx.fillRect(labelW + i * cw, y0, Math.ceil(cw), rowH - 1);
      }
      if (on) {
        ctx.strokeStyle = col('--leaf'); ctx.lineWidth = 2;
        ctx.strokeRect(labelW - 1, y0 - 1, w - labelW + 1, rowH + 1);
      }
    });
    if (gapAt >= 0) {
      ctx.font = `500 10px ${col('--font-data')}`; ctx.fillStyle = col('--muted'); ctx.textAlign = 'left';
      ctx.fillText('* Canarias: otoño casi sin enfriamiento, cifra no comparable', labelW, top(gapAt) - rowH / 2);
    }
    if (hover) {
      ctx.strokeStyle = col('--paper'); ctx.lineWidth = 1.5;
      ctx.strokeRect(labelW + hover.i * cw, top(hover.r), Math.ceil(cw), rowH - 1);
    }
    ctx.font = `500 11px ${col('--font-data')}`; ctx.fillStyle = col('--muted'); ctx.textAlign = 'center';
    for (const y of [1950, 1975, 2000, 2025]) { ctx.textAlign = y === 2025 ? 'right' : 'center'; ctx.fillText(String(y), y === 2025 ? w : labelW + (y - 1950 + 0.5) * cw, h - 10); }
  }

  canvas.addEventListener('pointermove', (e) => {
    const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    const cw = (w - labelW) / YEARS.length;
    let r = Math.floor(y / rowH);
    if (gapAt >= 0 && r >= gapAt) r = r === gapAt ? -1 : r - 1;
    const i = Math.floor((x - labelW) / cw);
    if (r < 0 || r >= rows.length || i < 0 || i >= YEARS.length) { hover = null; tip.hidden = true; draw(); return; }
    hover = { r, i };
    const p = rows[r], v = p.st.shift.trend.yearly[i], ref = p.st.shift.trend.base.join('–');
    tip.innerHTML = `<b>${p.name} · ${YEARS[i]}</b><span>${v == null ? 'sin datos ese año' : Math.abs(v) < 0.5 ? `llegó como el otoño de antes (${ref})` : v > 0 ? `llegó ${f0(v)} días más tarde que el otoño de antes (${ref})` : `se adelantó ${f0(-v)} días al otoño de antes (${ref})`}</span><span class="tip-st">un año suelto: mira la fila entera</span>`;
    tip.hidden = false;
    tip.style.left = `${Math.min(x + 14, w - 240)}px`;
    tip.style.top = `${y + 14}px`;
    draw();
  });
  canvas.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; draw(); });
  canvas.addEventListener('click', () => { if (hover) onPick?.(rows[hover.r].id); });
  new ResizeObserver(layout).observe(canvas);

  let seen = false;
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || seen || reduced) return;
    seen = true;
    const t0 = performance.now();
    const step = (now) => { reveal = Math.min(1, (now - t0) / 2600); draw(); if (reveal < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, { threshold: 0.2 }).observe(canvas);

  return {
    // Filas ordenadas por días robados; las de otoño plano (Canarias) al final, separadas
    setRows(provs) {
      const comparable = provs.filter((p) => !p.st.shift.flat).sort((a, b) => b.st.shift.days - a.st.shift.days);
      const flat = provs.filter((p) => p.st.shift.flat);
      rows = [...comparable, ...flat];
      gapAt = flat.length ? comparable.length : -1;
      layout();
    },
    select(id) { selected = id; draw(); },
  };
}
