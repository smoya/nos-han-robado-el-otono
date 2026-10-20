"""Simplifica los límites provinciales (GISCO NUTS3 2021, 1:3M) para la web.

Uso: python3 -I scripts/build_geo.py data/geo/nuts3_2021_03m.geojson public/otono/data/provinces.json
© EuroGeographics para los límites administrativos.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_spain import PROVINCE_OF  # noqa: E402

TOL = 0.008  # grados (~800 m)


def dp(pts, tol):
    """Douglas-Peucker iterativo."""
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        n2 = dx * dx + dy * dy or 1e-12
        best, bi = 0, -1
        for i in range(a + 1, b):
            x, y = pts[i]
            t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / n2))
            d = (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2
            if d > best:
                best, bi = d, i
        if best > tol * tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def main(src, dst):
    geo = json.load(open(src))
    out = {}
    for f in geo["features"]:
        pr = f["properties"]
        if pr["CNTR_CODE"] != "ES":
            continue
        pid = PROVINCE_OF.get(pr["NUTS_ID"], pr["NUTS_ID"])
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            ring = dp(poly[0], TOL)
            if len(ring) >= 4:
                out.setdefault(pid, []).append([[round(x, 3), round(y, 3)] for x, y in ring])
    json.dump(out, open(dst, "w"), separators=(",", ":"))
    print(len(out), "provincias,", sum(len(r) for v in out.values() for r in v), "vértices")


if __name__ == "__main__":
    main(*sys.argv[1:3])
