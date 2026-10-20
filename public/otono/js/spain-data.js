// Datos nacionales (scripts/build_spain.py). Convierte las series compactas al formato
// por año que usa data.js.
import { Y0, Y1, YEARS, BASE, METRICS, value, periodMean } from './data.js';

const MONTH_KEYS = ['tx', 'tn', 'tm', 'hot', 'warm', 'cold'];

function adapt(rec) {
  const years = {};
  YEARS.forEach((y, i) => {
    const m = {};
    for (const mo of [9, 10, 11]) {
      const o = {};
      for (const k of MONTH_KEYS) {
        const v = rec.series?.[`${k}${mo}`]?.[i];
        if (v != null) o[k] = v;
      }
      if (Object.keys(o).length) m[mo] = o;
    }
    years[y] = { m, a: rec.series?.a?.[i] ?? null, fc: rec.series?.fc?.[i] ?? null, lh: rec.series?.lh?.[i] ?? null };
  });
  return { ...rec, years };
}

export async function loadSpain() {
  const [spain, shapes] = await Promise.all([
    fetch('data/spain.json').then((r) => r.json()),
    fetch('data/provinces.json').then((r) => r.json()),
  ]);
  const stations = {};
  for (const [id, rec] of Object.entries(spain.stations)) stations[id] = rec.series ? adapt(rec) : rec;
  const provinces = Object.values(spain.provinces)
    .map((p) => ({ ...p, shapes: shapes[p.id] || [], st: p.ref ? stations[p.ref] : null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return { source: spain.source, provinces, stations };
}

// Una estación de nivel B sin 15 años completos en 1961-1990 no tiene una referencia fiable
export function hasBase(st) {
  return st && st.periods.base >= 15;
}

export function baseMean(st, metric, month) {
  return hasBase(st) ? periodMean(st, metric, month, ...BASE) : null;
}

// Diferencia de un indicador entre 2016-2025 y 1991-2000
export function decadeDelta(st, metric, month = 10) {
  if (!st?.years) return null;
  const a = periodMean(st, metric, month, 1991, 2000);
  const b = periodMean(st, metric, month, 2016, 2025);
  return a == null || b == null ? null : b - a;
}

export function anomaly(st, y, metric, month) {
  const v = value(st, y, metric, month);
  const b = baseMean(st, metric, month);
  return v == null || b == null ? null : v - b;
}

// Amplitud de la escala divergente por tipo de indicador
export function anomalySpan(metric) {
  const k = METRICS[metric].kind;
  return k === 'temp' ? 3 : k === 'date' ? 25 : 10;
}

export { Y0, Y1, YEARS };

// Regresión lineal local con pesos gaussianos (igual que scripts/shift.py): tendencia sin sesgo de borde.
// No se calcula donde hay menos de `minN` años con dato a `win` años o menos.
export function loessSeries(values, from = 1950, sig = 10, minN = 6, win = 6) {
  const pts = values.map((v, i) => [from + i, v]).filter(([, v]) => v != null);
  return values.map((_, i) => {
    const x = from + i;
    if (pts.filter(([k]) => Math.abs(k - x) <= win).length < minN) return null;
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [k, v] of pts) {
      const w = Math.exp(-(((x - k) / sig) ** 2) / 2);
      sw += w; sx += w * k; sy += w * v; sxx += w * k * k; sxy += w * k * v;
    }
    const mx = sx / sw, my = sy / sw, b = (sxy / sw - mx * my) / (sxx / sw - mx * mx);
    return my + b * (x - mx);
  });
}

// Grados de más en octubre frente a la misma referencia que los días robados (1961-1990, o 1991-2000
// en las series parciales): anomalía de cada año y su tendencia
export function tempSeries(st) {
  const [a, b] = st.shift.trend.base;
  const base = periodMean(st, 'tm', 10, a, b);
  const yearly = YEARS.map((y) => { const v = value(st, y, 'tm', 10); return v == null || base == null ? null : v - base; });
  return { yearly, smooth: loessSeries(yearly) };
}
