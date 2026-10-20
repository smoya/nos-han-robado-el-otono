"""Indicadores de otoño para toda España a partir de las series diarias de ECA&D.

Uso: python3 -I scripts/build_spain.py data/ecad data/geo/nuts3_2021_03m.geojson public/otono/data/spain.json
Requiere haber ejecutado antes scripts/fetch_ecad_es.py. Solo biblioteca estándar.

Para cada provincia elige una estación de referencia: la que tenga más otoños completos
(sep-nov con >=24 días válidos de TX y TN), evitando estaciones de montaña (>1200 m) si hay
otra opción. Nivel A: >=45 otoños, >=20 en 1961-1990 y >=8 en cada década comparada.
Nivel B (serie parcial, se marca en la web): >=30 otoños, >=7 en 1991-2000 y >=8 en 2016-2025.
"""
import datetime as dt
import json
import os
import re
import unicodedata
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import MONTHS, P_EARLY, P_LATE, Y0, Y1, ols, period_mean, r2, year_stats  # noqa: E402
import shift  # noqa: E402

BASE = (1961, 1990)
MIN_AUTUMNS = 45

# Las islas son NUTS3 distintos: se agrupan en su provincia
PROVINCE_OF = {
    "ES531": "ES53", "ES532": "ES53", "ES533": "ES53",
    "ES704": "ES70P", "ES705": "ES70P", "ES708": "ES70P",
    "ES703": "ES70T", "ES706": "ES70T", "ES707": "ES70T", "ES709": "ES70T",
}
PROVINCE_NAME = {"ES53": "Illes Balears", "ES70P": "Las Palmas", "ES70T": "Santa Cruz de Tenerife"}
SHORT = {"Araba/Álava": "Álava", "Alicante/Alacant": "Alicante", "Castellón/Castelló": "Castellón",
         "Valencia/València": "Valencia"}


def norm(t):
    return unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().upper()


def dms(s):
    sign = -1 if s.startswith("-") else 1
    a, b, c = map(int, s.lstrip("+-").split(":"))
    return sign * (a + b / 60 + c / 3600)


def read_meta(path):
    meta = {}
    for ln in open(path, encoding="latin-1"):
        m = re.match(r"\s*(\d+),(.{40}),ES\s*,([^,]+),([^,]+),\s*(-?\d+)", ln)
        if m:
            meta[int(m.group(1))] = {"name": m.group(2).strip(), "lat": round(dms(m.group(3).strip()), 4),
                                     "lon": round(dms(m.group(4).strip()), 4), "alt": int(m.group(5))}
    return meta


def read_sources(path):
    """SOUID -> (lat, lon, altitud) de cada serie original que ECA&D usa para construir las combinadas."""
    out = {}
    for ln in open(path, encoding="latin-1"):
        p = ln.split(",")
        if len(p) < 7 or not p[1].strip().isdigit():
            continue
        try:
            # En los ficheros de datos el SOUID aparece restándole 100000 (100997 -> 997)
            out[int(p[1]) - 100000] = (dms(p[4].strip()), dms(p[5].strip()), int(p[6]), p[2].strip())
        except ValueError:
            continue
    return out


def read_series(path, sources_out=None):
    out = {}
    for ln in open(path, encoding="latin-1"):
        p = ln.split(",")
        if len(p) != 5:
            continue
        s = p[2].strip()
        if len(s) != 8 or not s.isdigit() or p[4].strip() != "0":
            continue
        y = int(s[:4])
        if Y0 <= y <= Y1:
            d = dt.date(y, int(s[4:6]), int(s[6:]))
            out[d] = int(p[3]) / 10
            if sources_out is not None:
                sources_out[d] = int(p[1])
    return out


def own_share(meta, src_tx, src_tn, sources, period):
    """Fracción de días de otoño del periodo medidos por un termómetro a <3 km y <50 m de desnivel
    de la estación (y no copiados de una vecina), más la serie original dominante."""
    own = total = 0
    count = {}
    for d, sx in src_tx.items():
        if not (period[0] <= d.year <= period[1] and d.month in MONTHS) or d not in src_tn:
            continue
        total += 1
        ok = True
        for sou in (sx, src_tn[d]):
            lat, lon, h, _ = sources.get(sou, (None, None, None, None))
            if lat is None or abs(lat - meta["lat"]) * 111 > 3 or abs(lon - meta["lon"]) * 84 > 3 or abs(h - meta["alt"]) > 50:
                ok = False
        own += ok
        count[sx] = count.get(sx, 0) + 1
    dom = max(count, key=count.get) if count else None
    return (own / total if total else 0.0), dom


def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def polygons(geom):
    return [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]


def locate(lon, lat, feats):
    for f in feats:
        for poly in polygons(f["geometry"]):
            if point_in_ring(lon, lat, poly[0]) and not any(point_in_ring(lon, lat, h) for h in poly[1:]):
                return f
    # Estaciones costeras que caen justo fuera del contorno generalizado: la provincia más cercana
    best, bd = None, 1e9
    for f in feats:
        for poly in polygons(f["geometry"]):
            for x, y in poly[0][::3]:
                d = (x - lon) ** 2 + (y - lat) ** 2
                if d < bd:
                    best, bd = f, d
    return best if bd < 0.15**2 else None


def station_record(sid, meta, days):
    years = {}
    for y in range(Y0, Y1 + 1):
        months, annual, fc, fr, lh = year_stats(days, y)
        years[y] = {"m": months, "a": annual, "fc": fc[0], "fcs": fc[1], "fr": fr[0], "frs": fr[1], "lh": lh[0]}
    complete = [y for y, v in years.items() if all(v["m"][m] for m in MONTHS)]
    ser = lambda f: [f(years[y]) for y in range(Y0, Y1 + 1)]
    out = {"id": sid, **meta, "complete": len(complete), "series": {}}
    for m in MONTHS:
        for k in ("tx", "tn", "tm", "hot", "warm", "cold"):
            out["series"][f"{k}{m}"] = ser(lambda v: (v["m"][m] or {}).get(k))
    for k in ("fc", "fr", "lh", "a"):
        out["series"][k] = ser(lambda v: v[k])
    summary = {}
    pairs = lambda arr: list(zip(range(Y0, Y1 + 1), arr))
    for key in ("tx10", "tn10", "tm10", "hot10", "warm10", "cold10", "tm9", "tm11", "fc", "fr", "lh", "a"):
        s = pairs(out["series"][key])
        (e0, n0), (e1, n1), (b0, nb) = period_mean(s, P_EARLY), period_mean(s, P_LATE), period_mean(s, BASE)
        summary[key] = {"base": b0, "early": e0, "late": e1, "n": [nb, n0, n1],
                        "delta": r2(e1 - e0) if None not in (e0, e1) else None,
                        "trend": ols([(y, v) for y, v in s if v is not None])}
    for k in ("fc", "fr"):
        summary[k]["noEvent"] = [sum(1 for y in range(p[0], p[1] + 1) if years[y][k + "s"] == "none")
                                 for p in (BASE, P_EARLY, P_LATE)]
    out["summary"] = summary
    out["periods"] = {"base": sum(1 for y in complete if BASE[0] <= y <= BASE[1]),
                      "early": sum(1 for y in complete if P_EARLY[0] <= y <= P_EARLY[1]),
                      "late": sum(1 for y in complete if P_LATE[0] <= y <= P_LATE[1])}
    return out


def main(ecad, geo_path, out_path):
    meta = read_meta(f"{ecad}/stations_tx.txt")
    sources = read_sources(f"{ecad}/sources_tx.txt") | read_sources(f"{ecad}/sources_tn.txt")
    geo = json.load(open(geo_path))
    feats = [f for f in geo["features"] if f["properties"]["CNTR_CODE"] == "ES"]

    stations, seen = [], set()
    for sid in sorted(meta):
        fx, fn = f"{ecad}/TX_STAID{sid:06d}.txt", f"{ecad}/TN_STAID{sid:06d}.txt"
        if not (os.path.exists(fx) and os.path.exists(fn)):
            continue
        stx, stn = {}, {}
        tx, tn = read_series(fx, stx), read_series(fn, stn)
        days = {}
        for d in set(tx) | set(tn):
            a, b = tx.get(d), tn.get(d)
            if a is not None and b is not None and b > a:
                a = b = None
            days[d] = (a, b)
        rec = station_record(sid, meta[sid], days)
        (oe, de), (ol, dl) = (own_share(meta[sid], stx, stn, sources, per) for per in (P_EARLY, P_LATE))
        rec["own"] = {"early": round(oe, 2), "late": round(ol, 2), "dom": [de, dl]}
        rec["_days"] = days
        if min(oe, ol) < 0.8:
            # De dónde salen realmente los datos y a qué distancia
            src = sources.get(de if oe < 0.8 else dl)
            if src:
                km = ((src[0] - meta[sid]["lat"]) ** 2 * 111**2 + (src[1] - meta[sid]["lon"]) ** 2 * 84**2) ** 0.5
                rec["own"]["from"] = {"name": src[3], "km": round(km, 1), "alt": src[2]}
        p = rec["periods"]
        if rec["complete"] >= MIN_AUTUMNS and p["early"] >= 8 and p["late"] >= 8 and p["base"] >= 20:
            rec["tier"] = "A"
        elif rec["complete"] >= 30 and p["early"] >= 7 and p["late"] >= 8:
            rec["tier"] = "B"
        else:
            continue
        # Las series combinadas de ECA&D se repiten a veces con otro identificador: descartar duplicados
        sig = tuple(rec["series"]["tn10"][-30:]) + tuple(rec["series"]["tx10"][-30:])
        if sig in seen:
            continue
        seen.add(sig)
        f = locate(rec["lon"], rec["lat"], feats)
        if not f:
            print("sin provincia:", sid, rec["name"])
            continue
        nid = f["properties"]["NUTS_ID"]
        rec["prov"] = PROVINCE_OF.get(nid, nid)
        stations.append(rec)
        print(rec["tier"], f"{sid:6d} {rec['name'][:34]:34s} {rec['prov']:6s} {rec['complete']:3d} {rec['alt']:5d}")

    # Varias estaciones de ECA&D son la misma serie con otro identificador o un emplazamiento vecino:
    # nos quedamos con la más completa dentro de un radio de 2 km
    stations.sort(key=lambda s: (s["tier"], -s["complete"], s["id"]))
    kept = []
    for s in stations:
        near = [k for k in kept if abs(k["lat"] - s["lat"]) * 111 < 2 and abs(k["lon"] - s["lon"]) * 84 < 2]
        if not near:
            kept.append(s)
    stations = kept

    provinces = {}
    for f in feats:
        nid = f["properties"]["NUTS_ID"]
        pid = PROVINCE_OF.get(nid, nid)
        name = PROVINCE_NAME.get(pid) or SHORT.get(f["properties"]["NAME_LATN"], f["properties"]["NAME_LATN"])
        provinces.setdefault(pid, {"id": pid, "name": name, "nuts": []})["nuts"].append(nid)

    for pid, p in provinces.items():
        cands = [s for s in stations if s["prov"] == pid]
        # Se prefiere la estación de la capital si su serie es casi tan completa como la mejor
        cap = norm(p["name"]).split("/")[0].split(" ")[-1]
        own = lambda s: s["own"]["early"] >= 0.8 and s["own"]["late"] >= 0.8
        cands.sort(key=lambda s: (s["alt"] > 1200, not own(s), s["tier"], -(s["complete"] + 4 * (cap in norm(s["name"]))), s["id"]))
        p["ref"] = cands[0]["id"] if cands else None
        p["others"] = [s["id"] for s in cands[1:]]
        # Rango provincial: solo estaciones con datos propios (>=80 %) en las dos décadas comparadas
        # y sin repetir la misma serie original
        indep, used = [], set()
        for s in cands:
            o = s["own"]
            if o["early"] < 0.8 or o["late"] < 0.8 or tuple(o["dom"]) in used:
                continue
            used.add(tuple(o["dom"]))
            indep.append(s)
        spread = {"n": len(indep), "ids": [s["id"] for s in indep]}
        for k in ("tm10", "tn10", "tx10", "lh", "fc", "warm10"):
            ds = [s["summary"][k]["delta"] for s in indep if s["summary"][k]["delta"] is not None]
            spread[k] = [min(ds), round(sum(ds) / len(ds), 2), max(ds)] if ds else None
        p["spread"] = spread

    refs = {p["ref"] for p in provinces.values()}

    # Días robados: con intervalo para las estaciones de referencia, sin él para el resto
    for s_ in stations:
        s_["shift"] = shift.compute(s_.pop("_days"), P_EARLY, P_LATE, BASE, boot=200 if s_["id"] in refs else 0)
        if s_["id"] not in refs and s_["shift"]:
            s_["shift"].pop("curves")
            s_["shift"].pop("trend")
    for p in provinces.values():
        ds = [stn["shift"]["days"] for stn in stations if stn["id"] in p["spread"]["ids"] and stn.get("shift")]
        p["spread"]["shift"] = [min(ds), round(sum(ds) / len(ds), 1), max(ds)] if ds else None

    def slim(s):
        keep = ("tx10", "tn10", "tm10", "hot10", "warm10", "cold10", "tm9", "tm11", "tn9", "tn11", "tx9", "tx11",
                "warm9", "warm11", "hot9", "hot11", "fc", "lh", "a")
        o = {k: v for k, v in s.items() if k != "series"}
        o["series"] = {k: s["series"][k] for k in keep}
        return o

    out = {
        "source": {
            "data": "ECA&D blended daily series (Klein Tank et al. 2002, Int. J. Climatol. 22, 1441-1453), https://www.ecad.eu",
            "license": "Uso no comercial para investigación y educación, citando la fuente",
            "geo": "© EuroGeographics para los límites administrativos (GISCO NUTS 2021)",
            "years": [Y0, Y1], "built": dt.date.today().isoformat(),
            "base": list(BASE), "early": list(P_EARLY), "late": list(P_LATE),
        },
        "provinces": provinces,
        # Solo las de referencia: las secundarias ya están resumidas en "spread" de cada provincia
        "stations": {s["id"]: slim(s) for s in stations if s["id"] in refs},
    }
    with open(out_path, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    missing = [p["name"] for p in provinces.values() if not p["ref"]]
    print(len(stations), "estaciones;", len(provinces) - len(missing), "provincias con referencia; sin serie:", missing)


if __name__ == "__main__":
    main(*sys.argv[1:4])
