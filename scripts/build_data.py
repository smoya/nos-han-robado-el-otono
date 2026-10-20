"""Recalcula los indicadores de otoño a partir del ZIP oficial de Meteocat.

Uso: python3 -I scripts/build_data.py data/series-climatiques-baic-diaries-des-de-1950.zip public/otono/data/climate.json
Solo usa la biblioteca estándar. Lee el ZIP directamente, sin extraerlo.
"""
import csv
import datetime as dt
import io
import json
import math
import sys
import os
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

Y0, Y1 = 1950, 2025
MONTHS = (9, 10, 11)
MIN_DAYS_MONTH = 24
P_EARLY, P_LATE = (1991, 2000), (2016, 2025)

# Estaciones del entorno metropolitano que se muestran en el mapa
STATIONS = {
    "baic0008d": ("fabra", "Observatori Fabra"),
    "baic0007d": ("prat", "Aeroport del Prat"),
    "baic0019d": ("granollers", "Granollers"),
    "baic0014d": ("caldes", "Caldes de Montbui"),
    "baic0026d": ("turo", "Turó de l'Home"),
}


def num(v, lo, hi):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if x in (-9999.0, -999.9) or not lo < x < hi:
        return None
    return x


def parse(text):
    lines = text.splitlines()
    meta = {}
    for ln in lines[:20]:
        if ":" in ln:
            k, _, v = ln.partition(":")
            meta[k.strip()] = v.strip()
    start = next(i for i, ln in enumerate(lines) if ln.startswith("ANY\t"))
    days = {}
    for r in csv.DictReader(io.StringIO("\n".join(lines[start:])), delimiter="\t"):
        try:
            y, m, d = int(r["ANY"]), int(r["MES"]), int(r["DIA"])
        except (TypeError, ValueError, KeyError):
            continue
        if not Y0 <= y <= Y1:
            continue
        tx, tn = num(r.get("TX"), -30, 55), num(r.get("TN"), -40, 45)
        if tx is not None and tn is not None and tn > tx:
            tx = tn = None
        days[dt.date(y, m, d)] = (tx, tn)
    return meta, days


def mean(xs):
    return sum(xs) / len(xs) if xs else None


def r2(x):
    return None if x is None else round(x, 2)


def doy(d):
    return d.timetuple().tm_yday


def first_cold(days, y):
    """Primer día desde el 1 de septiembre con TN<10 °C. None si faltan datos."""
    d, missing = dt.date(y, 9, 1), 0
    while d.year == y:
        tx, tn = days.get(d, (None, None))
        if tn is None:
            missing += 1
            if missing > 5:
                return None, "gap"
        elif tn < 10:
            return doy(d), "ok"
        d += dt.timedelta(1)
    return None, "none"


def first_cold_run(days, y, thr=12.0, run=3):
    """Primer día de un bloque de `run` noches seguidas con TN<thr (sep-dic)."""
    d, streak, missing = dt.date(y, 9, 1), 0, 0
    while d.year == y:
        tn = days.get(d, (None, None))[1]
        if tn is None:
            missing += 1
            streak = 0
            if missing > 5:
                return None, "gap"
        elif tn < thr:
            streak += 1
            if streak == run:
                return doy(d - dt.timedelta(run - 1)), "ok"
        else:
            streak = 0
        d += dt.timedelta(1)
    return None, "none"


def last_hot(days, y):
    """Último día del año (desde julio) con TX>=25 °C."""
    d, last, missing = dt.date(y, 7, 1), None, 0
    while d.year == y:
        tx = days.get(d, (None, None))[0]
        if tx is None:
            missing += 1
        elif tx >= 25:
            last = doy(d)
        d += dt.timedelta(1)
    return (last, "ok") if missing <= 10 and last else (None, "gap")


def year_stats(days, y):
    out = {}
    for m in MONTHS:
        rows = [v for k, v in days.items() if k.year == y and k.month == m]
        tx = [a for a, _ in rows if a is not None]
        tn = [b for _, b in rows if b is not None]
        if len(tx) < MIN_DAYS_MONTH or len(tn) < MIN_DAYS_MONTH:
            out[m] = None
            continue
        out[m] = {
            "tx": r2(mean(tx)),
            "tn": r2(mean(tn)),
            "tm": r2((mean(tx) + mean(tn)) / 2),
            "hot": sum(a >= 25 for a in tx),
            "warm": sum(b >= 15 for b in tn),
            "cold": sum(b < 10 for b in tn),
            "n": min(len(tx), len(tn)),
        }
    yr = [v for k, v in days.items() if k.year == y and None not in v]
    annual = r2(mean([(a + b) / 2 for a, b in yr])) if len(yr) >= 330 else None
    fc, fcs = first_cold(days, y)
    fr, frs = first_cold_run(days, y)
    lh, lhs = last_hot(days, y)
    return out, annual, (fc, fcs), (fr, frs), (lh, lhs)


def ols(pts):
    """Pendiente por década con IC95 % corregido por autocorrelación lag-1."""
    n = len(pts)
    if n < 20:
        return None
    xs, ys = zip(*pts)
    mx, my = mean(xs), mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in pts) / sxx
    a = my - b * mx
    res = [y - (a + b * x) for x, y in pts]
    if not any(res):
        return {"slope": round(b * 10, 3), "ci95": 0.0, "n": n, "neff": n, "r1": 0.0}
    r1 = sum(res[i] * res[i + 1] for i in range(n - 1)) / sum(r * r for r in res)
    r1 = max(0.0, r1)
    neff = n * (1 - r1) / (1 + r1)
    se = math.sqrt(sum(r * r for r in res) / (neff - 2) / sxx)
    t = 1.96 + 2.4 / max(neff - 2, 1)  # aproximación a t de Student al 97,5 %
    return {"slope": round(b * 10, 3), "ci95": round(t * se * 10, 3), "n": n, "neff": round(neff, 1), "r1": round(r1, 2)}


def period_mean(series, p):
    vals = [v for y, v in series if p[0] <= y <= p[1] and v is not None]
    return (round(mean(vals), 2), len(vals)) if vals else (None, 0)


def utm31_to_lonlat(e, n):
    """UTM huso 31N (ETRS89 ~ WGS84) a lon/lat, fórmulas estándar de Snyder."""
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    x, y = e - 500000.0, n
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
            + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
            + (151 * e1**3 / 96) * math.sin(6 * mu))
    c1 = ep2 * math.cos(phi1) ** 2
    t1 = math.tan(phi1) ** 2
    n1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    r1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (d**2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * ep2) * d**4 / 24
                                               + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * ep2 - 3 * c1**2) * d**6 / 720)
    lon = (d - (1 + 2 * t1 + c1) * d**3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * ep2 + 24 * t1**2) * d**5 / 120) / math.cos(phi1)
    return round(math.degrees(lon) + 3.0, 5), round(math.degrees(lat), 5)


def main(zip_path, out_path):
    out = {"source": {
        "name": "Servei Meteorològic de Catalunya (Meteocat), sèries climàtiques diàries des de 1950",
        "url": "https://www.meteo.cat/wpweb/climatologia/dades-i-productes-climatics/series-climatiques-des-de-1950/",
        "years": [Y0, Y1],
        "built": dt.date.today().isoformat(),
    }, "stations": {}}
    with zipfile.ZipFile(zip_path) as z:
        for code, (key, label) in STATIONS.items():
            meta, days = parse(z.read(f"{code}.txt").decode("utf-8"))
            e = float(meta["X UTM31"].split()[0])
            n = float(meta["Y UTM31"].split()[0])
            lon, lat = utm31_to_lonlat(e, n)
            years = {}
            for y in range(Y0, Y1 + 1):
                months, annual, fc, fr, lh = year_stats(days, y)
                years[y] = {"m": months, "annual": annual, "firstCold": fc[0], "firstColdStatus": fc[1],
                            "firstRun": fr[0], "firstRunStatus": fr[1], "lastHot": lh[0]}
            oct_ = lambda k: [(y, (v["m"][10] or {}).get(k)) for y, v in years.items()]
            summary = {}
            for k in ("tx", "tn", "tm", "hot", "warm", "cold"):
                s = oct_(k)
                (e0, n0), (e1, n1) = period_mean(s, P_EARLY), period_mean(s, P_LATE)
                summary[f"oct_{k}"] = {"early": e0, "late": e1, "nEarly": n0, "nLate": n1,
                                       "delta": r2(e1 - e0) if None not in (e0, e1) else None,
                                       "trend": ols([(y, v) for y, v in s if v is not None])}
            for k in ("firstCold", "firstRun", "lastHot"):
                s = [(y, v[k]) for y, v in years.items()]
                (e0, n0), (e1, n1) = period_mean(s, P_EARLY), period_mean(s, P_LATE)
                none = lambda p: sum(1 for y, v in years.items()
                                     if p[0] <= y <= p[1] and v.get(k + "Status") == "none")
                summary[k] = {"early": e0, "late": e1, "nEarly": n0, "nLate": n1,
                              "noEventEarly": none(P_EARLY), "noEventLate": none(P_LATE),
                              "delta": r2(e1 - e0) if None not in (e0, e1) else None,
                              "trend": ols([(y, v) for y, v in s if v is not None])}
            ann = [(y, v["annual"]) for y, v in years.items() if v["annual"] is not None]
            summary["annual_trend"] = ols(ann)
            import shift  # noqa: E402  (mismo directorio)
            summary["shift"] = shift.compute(days, P_EARLY, P_LATE, (1961, 1990))
            out["stations"][key] = {
                "code": code, "name": label, "comarca": meta.get("Comarca"),
                "utm": [e, n], "lon": lon, "lat": lat, "alt": float(meta["Z UTM31"].split()[0]),
                "summary": summary,
                "years": {y: {"m": {m: v for m, v in d["m"].items() if v}, "a": d["annual"],
                              "fc": d["firstCold"], "fr": d["firstRun"], "lh": d["lastHot"]}
                          for y, d in years.items()},
            }
    with open(out_path, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main(*sys.argv[1:3])
