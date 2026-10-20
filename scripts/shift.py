"""«Días robados»: cuánto se ha desplazado en el calendario la curva de enfriamiento del otoño.

Cifra principal: para cada año se calcula su desplazamiento frente a la curva de 1961-1990; la tendencia
se suaviza con una regresión lineal local (sigma 10 años) y se toma su valor en 2025. Margen: bootstrap
de los años (400 remuestreos).

Para cada periodo se calcula la temperatura media diaria ((TX+TN)/2) de cada día del año y se
ajusta una curva suave (media + 3 armónicos anuales). Después se busca el desplazamiento s en días
que mejor hace coincidir la curva reciente con la antigua entre el 15 de septiembre y el 15 de
noviembre: f_reciente(t) ≈ f_antigua(t - s). s > 0 significa que el otoño llega s días más tarde.
El intervalo se obtiene remuestreando los años de cada periodo (bootstrap).
"""
import datetime as dt
import math
import random

K = 3
WIN = (258, 319)  # 15 sep - 15 nov (día del año, año no bisiesto)
CURVE = (213, 334)  # 1 ago - 30 nov, para dibujar


def _doy(d):
    n = d.timetuple().tm_yday
    return n - 1 if d.year % 4 == 0 and d.month > 2 else n


def daily_by_year(days, years):
    """{año: {doy: tm}} solo con días con TX y TN válidos (se omite el 29 de febrero)."""
    out = {}
    for d, (tx, tn) in days.items():
        if d.year in years and tx is not None and tn is not None and not (d.month == 2 and d.day == 29):
            out.setdefault(d.year, {})[_doy(d)] = (tx + tn) / 2
    return out


def _basis(t):
    w = 2 * math.pi * (t - 1) / 365
    row = [1.0]
    for k in range(1, K + 1):
        row += [math.cos(k * w), math.sin(k * w)]
    return row


BASIS = {t: _basis(t) for t in range(1, 366)}


def _solve(a, b):
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                for j in range(c, n + 1):
                    m[r][j] -= f * m[c][j]
    return [m[i][n] / m[i][i] for i in range(n)]


def fit(by_year, years):
    """Coeficientes armónicos de la climatología diaria de los años dados (con repetición)."""
    acc, cnt = {}, {}
    for y in years:
        for t, v in by_year.get(y, {}).items():
            acc[t] = acc.get(t, 0) + v
            cnt[t] = cnt.get(t, 0) + 1
    n = 2 * K + 1
    ata = [[0.0] * n for _ in range(n)]
    atb = [0.0] * n
    for t, s in acc.items():
        if cnt[t] < max(1, len(years) // 3):
            continue
        y, row = s / cnt[t], BASIS[t]
        for i in range(n):
            atb[i] += row[i] * y
            for j in range(n):
                ata[i][j] += row[i] * row[j]
    return _solve(ata, atb)


def ev(c, t):
    w = 2 * math.pi * (t - 1) / 365
    return c[0] + sum(c[2 * k - 1] * math.cos(k * w) + c[2 * k] * math.sin(k * w) for k in range(1, K + 1))


def best_shift(c0, c1):
    ts = range(WIN[0], WIN[1] + 1)
    target = [ev(c1, t) for t in ts]
    sse = lambda s: sum((a - ev(c0, t - s)) ** 2 for a, t in zip(target, ts))
    s = min((x / 2 for x in range(-40, 121)), key=sse)
    return min((s + x / 20 for x in range(-10, 11)), key=sse)


def loess(points, x, sig=10):
    """Regresión lineal local con pesos gaussianos (sigma en años). Evita el sesgo de borde de una media móvil."""
    sw = sx = sy = sxx = sxy = 0.0
    for k, v in points:
        w = math.exp(-((x - k) / sig) ** 2 / 2)
        sw += w; sx += w * k; sy += w * v; sxx += w * k * k; sxy += w * k * v
    mx, my = sx / sw, sy / sw
    b = (sxy / sw - mx * my) / (sxx / sw - mx * mx)
    return my + b * (x - mx)


def trend(by, c0, first=1950, last=2025, boot=0, seed=1):
    """Desplazamiento de cada año frente a la curva de referencia c0 y su tendencia suavizada."""
    yearly = {y: best_shift(c0, fit(by, [y])) for y in range(first, last + 1) if len(by.get(y, {})) >= 300}
    pts = list(yearly.items())
    out = {"from": first, "yearly": [round(yearly[y], 1) if y in yearly else None for y in range(first, last + 1)],
           # Sin al menos 6 años con dato a menos de 6 años, la tendencia no se dibuja (no se extrapola)
           "smooth": [round(loess(pts, y), 2) if sum(abs(k - y) <= 6 for k in yearly) >= 6 else None
                      for y in range(first, last + 1)]}
    if boot:
        rnd = random.Random(seed)
        sims = sorted(loess(rnd.choices(pts, k=len(pts)), last) for _ in range(boot))
        out["lo"], out["hi"] = round(sims[int(0.05 * boot)], 1), round(sims[int(0.95 * boot) - 1], 1)
    return out


def rolling(by, c0, first_end, last_end, width=10):
    """Días robados de cada década móvil (los `width` años que acaban en cada año) frente a la curva c0."""
    out = []
    for end in range(first_end, last_end + 1):
        ys = [y for y in range(end - width + 1, end + 1) if len(by.get(y, {})) >= 300]
        out.append(round(best_shift(c0, fit(by, ys)), 1) if len(ys) >= 7 else None)
    return out


def compute(days, early, late, base, boot=200, seed=1):
    ye, yl, yb = (list(range(p[0], p[1] + 1)) for p in (early, late, base))
    by = daily_by_year(days, set(range(1950, 2026)))
    ye = [y for y in ye if len(by.get(y, {})) >= 300]
    yl = [y for y in yl if len(by.get(y, {})) >= 300]
    yb = [y for y in yb if len(by.get(y, {})) >= 300]
    if len(ye) < 7 or len(yl) < 7:
        return None
    c0, c1 = fit(by, ye), fit(by, yl)
    out = {"years": [len(ye), len(yl)],
           "rate": round((ev(c0, 274) - ev(c0, 304)) / 30, 3),  # enfriamiento medio de octubre, °C/día
           "decade": {"days": round(best_shift(c0, c1), 1)}}  # 2016-2025 frente a 1991-2000
    # Referencia de la tendencia: 1961-1990; si la estación no tiene esos años, 1991-2000
    ref_years, ref = (yb, list(base)) if len(yb) >= 20 else (ye, list(early))
    cr = fit(by, ref_years)
    tr = trend(by, cr, boot=boot * 2, seed=seed)
    tr["base"] = ref
    out["trend"] = tr
    # Cifra principal: la tendencia en 2025 frente a la referencia, con su margen
    out["days"] = round(tr["smooth"][-1], 1)
    # Donde el otoño apenas se enfría (Canarias), un poco de calor equivale a muchos días: se marca
    out["flat"] = out["rate"] < 0.07
    if boot:
        out["lo"], out["hi"] = tr.pop("lo"), tr.pop("hi")
    t0, t1 = CURVE
    out["curves"] = {"from": t0, "early": [round(ev(c0, t), 2) for t in range(t0, t1 + 1)],
                     "ref": [round(ev(cr, t), 2) for t in range(t0 - 40, t1 + 1)], "refFrom": t0 - 40}
    return out


if __name__ == "__main__":
    # Prueba rápida con Fabra (Meteocat)
    import sys
    import zipfile
    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    from build_data import parse
    z = zipfile.ZipFile(sys.argv[1])
    _, days = parse(z.read("baic0008d.txt").decode())
    r = compute(days, (1991, 2000), (2016, 2025), (1961, 1990))
    print({k: v for k, v in r.items() if k != "curves"})
    d0 = dt.date(2001, 1, 1)
    print("1 oct antes/ahora:", r["curves"]["early"][274 - 213], r["curves"]["late"][274 - 213])
