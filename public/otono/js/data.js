// Acceso a los datos precalculados (scripts/build_data.py) y utilidades de formato.

export const Y0 = 1950;
export const Y1 = 2025;
export const YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i);
export const BASE = [1961, 1990];
// Toda mención de «otoño de antes» enlaza a su definición (y muestra el bocadillo al pasar)
export const ANTES = '<a class="antes" href="#metodo-antes">otoño de antes</a>';

export const METRICS = {
  tm: { label: 'Temperatura media', short: 'Media', unit: '°C', monthly: true, kind: 'temp' },
  tn: { label: 'Mínima media', short: 'Mín. media', unit: '°C', monthly: true, kind: 'temp' },
  tx: { label: 'Máxima media', short: 'Máx. media', unit: '°C', monthly: true, kind: 'temp' },
  warm: { label: 'Noches con mínima ≥15 °C', short: 'Noches ≥15 °C', unit: 'noches', monthly: true, kind: 'count' },
  hot: { label: 'Días con máxima ≥25 °C', short: 'Días ≥25 °C', unit: 'días', monthly: true, kind: 'count' },
  fc: { label: 'Primera noche por debajo de 10 °C', short: 'Primera noche <10 °C', unit: 'fecha', monthly: false, kind: 'date' },
  lh: { label: 'Último día con máxima ≥25 °C', short: 'Último día ≥25 °C', unit: 'fecha', monthly: false, kind: 'date' },
};

const MONTHLY_EXTRA = new Set(['cold']);

export const MONTHS = { 9: 'septiembre', 10: 'octubre', 11: 'noviembre' };
const MON_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function value(st, year, metric, month = 10) {
  const y = st.years[year];
  if (!y) return null;
  if (METRICS[metric]?.monthly ?? MONTHLY_EXTRA.has(metric)) return y.m[month]?.[metric] ?? null;
  return y[metric] ?? null;
}

export function smoothed(st, year, metric, month = 10, k = 11) {
  const h = Math.floor(k / 2);
  const vals = [];
  for (let y = year - h; y <= year + h; y++) {
    const v = value(st, y, metric, month);
    if (v != null) vals.push(v);
  }
  return vals.length >= Math.ceil(k / 2) ? mean(vals) : value(st, year, metric, month);
}

export function periodMean(st, metric, month, a, b) {
  const vals = [];
  for (let y = a; y <= b; y++) {
    const v = value(st, y, metric, month);
    if (v != null) vals.push(v);
  }
  return vals.length ? mean(vals) : null;
}

export function range(climate, metric, month) {
  let lo = Infinity, hi = -Infinity;
  for (const st of Object.values(climate.stations)) {
    for (const y of YEARS) {
      const v = value(st, y, metric, month);
      if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
  }
  return [lo, hi];
}

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const nf1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
export const f1 = (x) => nf1.format(x);
export const f0 = (x) => nf0.format(x);
// Días de retraso dichos en palabras, para lectores de pantalla
export const lateTxt = (v) => { const n = Math.round(Math.abs(v)); return n === 0 ? 'a su hora' : `${n} ${n === 1 ? 'día' : 'días'} ${v > 0 ? 'tarde' : 'antes'}`; };
export const signed = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + (d ? f1(Math.abs(x)) : f0(Math.abs(x)));

export function doyToDate(doy) {
  const d = new Date(Date.UTC(2001, 0, 1) + (Math.round(doy) - 1) * 864e5);
  return `${d.getUTCDate()} ${MON_SHORT[d.getUTCMonth()]}`;
}

export function fmt(metric, v) {
  if (v == null) return 'sin dato';
  const m = METRICS[metric];
  if (m.kind === 'date') return doyToDate(v);
  if (m.kind === 'temp') return `${f1(v)} °C`;
  return `${f0(v)} ${m.unit}`;
}

// Escala secuencial nocturna → ocre → brasa, para valores normalizados 0..1
const STOPS = [
  [0.0, [64, 130, 170]],
  [0.3, [120, 190, 205]],
  [0.55, [232, 176, 76]],
  [0.78, [236, 110, 52]],
  [1.0, [214, 40, 58]],
];
export function heat(t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i];
      const k = (t - t0) / (t1 - t0);
      return c0.map((c, j) => Math.round(c + (c1[j] - c) * k));
    }
  }
  return STOPS[STOPS.length - 1][1];
}
export const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// Divergente para anomalías: azul hielo ← neutro → rojo brasa
export function anomalyColor(a, span = 2.5) {
  const t = Math.max(-1, Math.min(1, a / span));
  const neutral = [228, 214, 190];
  const cold = [38, 92, 150];
  const hot = [190, 30, 45];
  const target = t < 0 ? cold : hot;
  const k = Math.abs(t) ** 0.8;
  return neutral.map((c, j) => Math.round(c + (target[j] - c) * k));
}
