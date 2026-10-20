"""Extrae de ECA&D las series diarias españolas de TX y TN sin descargar los ZIP completos (800 MB).

Lee el ZIP remoto por rangos HTTP y guarda solo los ficheros de estaciones españolas.
Uso: python3 -I scripts/fetch_ecad_es.py data/ecad
Fuente: Klein Tank et al. 2002, ECA&D, https://www.ecad.eu
"""
import io
import os
import re
import sys
import threading
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor

BASE = "https://knmi-ecad-assets-prd.s3.amazonaws.com/download/"


class HttpFile(io.RawIOBase):
    """Fichero de solo lectura y con seek sobre una URL que admite Range."""

    def __init__(self, url):
        self.url, self.pos = url, 0
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req) as r:
            self.size = int(r.headers["Content-Length"])

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = {0: off, 1: self.pos + off, 2: self.size + off}[whence]
        return self.pos

    def read(self, n=-1):
        if n < 0:
            n = self.size - self.pos
        if n == 0 or self.pos >= self.size:
            return b""
        end = min(self.size, self.pos + n) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
        with urllib.request.urlopen(req) as r:
            data = r.read()
        self.pos += len(data)
        return data

    def readinto(self, b):
        data = self.read(len(b))
        b[: len(data)] = data
        return len(data)


def spanish_ids(station_txt):
    ids = {}
    for ln in station_txt.splitlines():
        m = re.match(r"\s*(\d+),(.{40}),ES\s*,", ln)
        if m:
            ids[int(m.group(1))] = ln
    return ids


def main(out):
    os.makedirs(out, exist_ok=True)
    for var in ("tx", "tn"):
        with urllib.request.urlopen(BASE + f"ECA_blend_station_{var}.txt") as r:
            st = r.read().decode("latin-1")
        open(f"{out}/stations_{var}.txt", "w").write(st)
        # Tabla de fuentes: permite saber qué termómetro midió cada día (series combinadas)
        with urllib.request.urlopen(BASE + f"ECA_blend_source_{var}.txt") as r:
            open(f"{out}/sources_{var}.txt", "wb").write(r.read())
        ids = spanish_ids(st)
        url = BASE + f"ECA_blend_{var}.zip"
        names = zipfile.ZipFile(io.BufferedReader(HttpFile(url), 1 << 20)).namelist()
        wanted = [n for n in names if (m := re.match(rf"{var.upper()}_STAID0*(\d+)\.txt", n)) and int(m.group(1)) in ids]
        print(var, len(wanted), "ficheros españoles")

        local = threading.local()

        def grab(name):
            dest = f"{out}/{name}"
            if os.path.exists(dest):
                return
            if not hasattr(local, "z"):  # un directorio central por hilo, no por fichero
                local.z = zipfile.ZipFile(io.BufferedReader(HttpFile(url), 1 << 20))
            with local.z.open(name) as src, open(dest, "wb") as dst:
                dst.write(src.read())

        with ThreadPoolExecutor(12) as ex:
            for i, _ in enumerate(ex.map(grab, wanted)):
                if i % 100 == 0:
                    print(var, i, flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
