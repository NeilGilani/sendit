#!/usr/bin/env python3
"""Build SENDIT's real Lake Tahoe mountains.

For each mountain below: Copernicus GLO-30 elevation (AWS open data) + OpenStreetMap pistes,
lifts and forest (Overpass). Picks the best top-to-bottom runs by chaining connected pistes,
then writes compact game data the web build turns into terrain (web/src/realcourse.js):

  assets/resorts/index.json            list of mountains for the menu
  assets/resorts/<id>.json             meta, runs, lifts
  assets/resorts/<id>_dem.bin          float32 heights, 20 m grid over 10.24 km (row 0 = north)
  assets/resorts/<id>_far.bin          float32 heights, 150 m grid over 36 km (row 0 = north)
  assets/resorts/<id>_mask.bin         uint8 pairs per DEM cell: forest, piste

Coordinates: local metres, x = east, z = south, origin at the mountain's configured centre.
Requires: Python 3.9+, numpy, Pillow.  Run:  python3 tools/build_resorts.py [id ...]
Data: Copernicus DEM (c) DLR/Airbus, ESA; OSM data (c) OpenStreetMap contributors, ODbL.
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", "cache")
OUT = os.path.join(ROOT, "assets", "resorts")
UA = "SENDIT-terrain-builder/1.0 (offline game data tool)"
OVERPASS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
R_EARTH = 6371008.8
DEM_SIZE, DEM_RES = 10240.0, 513        # 20 m
FAR_SIZE, FAR_RES = 36000.0, 241        # 150 m
OSM_RADIUS = 4200.0                     # metres around the centre
MAX_RUN_EXTENT = 3700.0                 # the playable tile is at most ~4 km
LAKE_TAHOE = 1897.0                     # lake surface (m)

# Real mountains around Lake Tahoe, named by place / peak.
MOUNTAINS = [
    dict(id="olympic_valley", name="Olympic Valley", region="North Lake Tahoe", lat=39.1926, lon=-120.2520, area="Olympic Valley"),
    dict(id="alpine_meadows", name="Alpine Meadows", region="North Lake Tahoe", lat=39.1519, lon=-120.2376, area="Alpine Meadows"),
    dict(id="mt_pluto", name="Mt. Pluto", region="Truckee · North Lake Tahoe", lat=39.2640, lon=-120.1300, area="Northstar"),
    dict(id="monument_peak", name="Monument Peak", region="South Lake Tahoe", lat=38.9330, lon=-119.9250, area="Heavenly"),
    dict(id="kirkwood", name="Kirkwood Valley", region="South of Lake Tahoe", lat=38.6850, lon=-120.0700, area="Kirkwood"),
    dict(id="huckleberry", name="Huckleberry Ridge", region="Echo Summit · South Lake Tahoe", lat=38.7990, lon=-120.0810, area="Sierra"),
    dict(id="mt_rose", name="Mt. Rose", region="Reno · North Lake Tahoe", lat=39.3240, lon=-119.8880, area="Rose"),
    dict(id="mt_lincoln", name="Mt. Lincoln", region="Donner Summit", lat=39.3000, lon=-120.3420, area="Sugar Bowl"),
    dict(id="homewood", name="Homewood", region="West Shore · Lake Tahoe", lat=39.0820, lon=-120.1700, area="Homewood"),
    dict(id="diamond_peak", name="Diamond Peak", region="Incline Village · Lake Tahoe", lat=39.2530, lon=-119.9230, area="Diamond"),
]


def log(*a):
    print("[resorts]", *a, flush=True)


def fetch(url, data=None, timeout=180):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


class Proj:
    def __init__(self, lat0, lon0):
        self.lat0, self.lon0, self.cos0 = lat0, lon0, math.cos(math.radians(lat0))

    def xz(self, lat, lon):
        return math.radians(lon - self.lon0) * R_EARTH * self.cos0, -math.radians(lat - self.lat0) * R_EARTH

    def ll(self, x, z):
        return self.lat0 + np.degrees(-z / R_EARTH), self.lon0 + np.degrees(x / (R_EARTH * self.cos0))


# --------------------------------------------------------------------------- DEM
def load_tile(lat, lon):
    os.makedirs(CACHE, exist_ok=True)
    tag = f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}_00_{'E' if lon >= 0 else 'W'}{abs(lon):03d}_00"
    path = os.path.join(CACHE, tag + ".tif")
    if not os.path.exists(path):
        name = f"Copernicus_DSM_COG_10_{tag}_DEM"
        url = f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
        log("downloading", url)
        for attempt in range(4):
            try:
                data = fetch(url, timeout=900)
                break
            except Exception as ex:
                log("  retry", ex)
                time.sleep(2 ** (attempt + 1))
        else:
            raise SystemExit("DEM download failed")
        with open(path, "wb") as f:
            f.write(data)
    return np.array(Image.open(path), dtype=np.float32)


class DEM:
    def __init__(self, lat_min, lat_max, lon_min, lon_max):
        self.lat_lo, self.lat_hi = math.floor(lat_min), math.floor(lat_max)
        self.lon_lo, self.lon_hi = math.floor(lon_min), math.floor(lon_max)
        rows = []
        for la in range(self.lat_hi, self.lat_lo - 1, -1):
            tiles = [load_tile(la, lo) for lo in range(self.lon_lo, self.lon_hi + 1)]
            h = min(t.shape[0] for t in tiles)
            rows.append(np.concatenate([t[:h] for t in tiles], axis=1))
        w = min(r.shape[1] for r in rows)
        self.data = np.concatenate([r[:, :w] for r in rows], axis=0)
        self.npy = self.data.shape[0] / (self.lat_hi - self.lat_lo + 1)
        self.npx = self.data.shape[1] / (self.lon_hi - self.lon_lo + 1)

    def sample(self, lat, lon):
        fy = (self.lat_hi + 1 - lat) * self.npy - 0.5
        fx = (lon - self.lon_lo) * self.npx - 0.5
        return bicubic(self.data, fx, fy)


def bicubic(img, fx, fy):
    h, w = img.shape
    x0, y0 = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    tx, ty = fx - x0, fy - y0

    def cw(t):
        t2, t3 = t * t, t * t * t
        return (-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1.0, -1.5 * t3 + 2.0 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2)

    wx, wy = cw(tx), cw(ty)
    out = np.zeros(np.shape(fx))
    for j in range(4):
        yy = np.clip(y0 + j - 1, 0, h - 1)
        row = np.zeros(np.shape(fx))
        for i in range(4):
            row += wx[i] * img[yy, np.clip(x0 + i - 1, 0, w - 1)]
        out += wy[j] * row
    return out


def blur(a, r):
    """Separable box blur (applied twice ≈ gaussian)."""
    k = 2 * r + 1
    for _ in range(2):
        p = np.pad(a, ((r, r), (0, 0)), mode="edge")
        c = np.cumsum(p, axis=0)
        a = (c[k - 1:] - np.vstack([np.zeros((1, a.shape[1])), c[:-k]])) / k
        p = np.pad(a, ((0, 0), (r, r)), mode="edge")
        c = np.cumsum(p, axis=1)
        a = (c[:, k - 1:] - np.hstack([np.zeros((a.shape[0], 1)), c[:, :-k]])) / k
    return a


def grid(proj, size, res):
    coords = -size / 2 + np.arange(res) * (size / (res - 1))
    x, z = np.meshgrid(coords, coords)
    return proj.ll(x, z)


# --------------------------------------------------------------------------- OSM
def load_osm(m, proj):
    path = os.path.join(CACHE, f"osm_{m['id']}.json")
    if os.path.exists(path):
        return json.load(open(path))
    la, lo = proj.ll(np.array([-OSM_RADIUS, OSM_RADIUS]), np.array([OSM_RADIUS, -OSM_RADIUS]))
    bb = f"({min(la):.5f},{min(lo):.5f},{max(la):.5f},{max(lo):.5f})"
    q = f"""[out:json][timeout:180];
(
  way["piste:type"="downhill"]{bb};
  way["aerialway"]{bb};
  node["aerialway"="pylon"]{bb};
  way["natural"="wood"]{bb};
  way["landuse"="forest"]{bb};
);
out body geom;"""
    last = None
    for ep in OVERPASS:
        for attempt in range(3):
            try:
                log("overpass", m["id"], ep)
                data = json.loads(fetch(ep, data=urllib.parse.urlencode({"data": q}).encode(), timeout=200))
                json.dump(data, open(path, "w"))
                return data
            except Exception as ex:
                last = ex
                log("  failed:", ex)
                time.sleep(3 + attempt * 4)
    raise SystemExit(f"Overpass unavailable: {last}")


def load_area(m, proj):
    """Segments of the resort's OSM winter_sports boundary (matched by name), or None."""
    if not m.get("area"):
        return None
    path = os.path.join(CACHE, f"osm_area_{m['id']}.json")
    if os.path.exists(path):
        data = json.load(open(path))
    else:
        la, lo = proj.ll(np.array([-OSM_RADIUS, OSM_RADIUS]), np.array([OSM_RADIUS, -OSM_RADIUS]))
        bb = f"({min(la):.5f},{min(lo):.5f},{max(la):.5f},{max(lo):.5f})"
        q = f'[out:json][timeout:120];(way["landuse"="winter_sports"]{bb};relation["landuse"="winter_sports"]{bb};);out geom;'
        data = None
        for ep in OVERPASS:
            for attempt in range(3):
                try:
                    data = json.loads(fetch(ep, data=urllib.parse.urlencode({"data": q}).encode(), timeout=160))
                    break
                except Exception as ex:
                    log("  area query failed:", ex)
                    time.sleep(3 + attempt * 4)
            if data:
                break
        if not data:
            return None
        json.dump(data, open(path, "w"))
    segs = []
    for el in data.get("elements", []):
        if m["area"].lower() not in el.get("tags", {}).get("name", "").lower():
            continue
        rings = [el.get("geometry", [])] if el["type"] == "way" else [mb.get("geometry", []) for mb in el.get("members", [])]
        for g in rings:
            pts = [proj.xz(p["lat"], p["lon"]) for p in g if p]
            segs += [(a[0], a[1], b[0], b[1]) for a, b in zip(pts, pts[1:])]
    if not segs:
        return None
    log(f"  boundary '{m['area']}': {len(segs)} segments")
    return np.array(segs)


def inside(segs, x, z):
    """Even-odd ray cast against an unordered segment soup (works for split multipolygon ways)."""
    x1, z1, x2, z2 = segs.T
    cross = ((z1 > z) != (z2 > z)) & (x < x1 + (z - z1) * (x2 - x1) / np.where(z2 - z1 == 0, 1e-9, z2 - z1))
    return int(cross.sum()) % 2 == 1


# --------------------------------------------------------------------------- runs
def chain_runs(pistes, height):
    """Chain connected pistes into long top-to-bottom runs; best (most vertical) first."""
    P = []
    for p in pistes:
        pts = np.array(p["pts"])
        if len(pts) < 2:
            continue
        h = height(pts)
        if h[0] < h[-1]:
            pts, h = pts[::-1], h[::-1]
        seg = np.hypot(*(pts[1:] - pts[:-1]).T)
        if seg.sum() < 80:
            continue
        P.append(dict(pts=pts, h=h, name=p["name"], diff=p["diff"]))
    memo = {}

    def best_from(i, k, depth, visited):
        key = (i, k // 3, depth)
        if key in memo:
            return memo[key]
        A = P[i]
        end, hend = A["pts"][-1], A["h"][-1]
        best = (A["h"][k] - hend, [(i, k)])
        if depth < 8:
            for j, B in enumerate(P):
                if j in visited:
                    continue
                d = np.hypot(*(B["pts"] - end).T)
                kk = int(np.argmin(d))
                if d[kk] > 70 or kk >= len(B["pts"]) - 1 or B["h"][kk] > hend + 15:
                    continue
                sub_drop, sub = best_from(j, kk, depth + 1, visited | {j})
                tot = (A["h"][k] - hend) + sub_drop
                if tot > best[0]:
                    best = (tot, [(i, k)] + sub)
        memo[key] = best
        return best

    cands = []
    for i in range(len(P)):
        drop, chain = best_from(i, 0, 0, frozenset({i}))
        pts = []
        for (pi, k) in chain:
            seg = P[pi]["pts"][k:]
            pts.extend(seg.tolist())
        pts = np.array(pts)
        # Trim so the run fits the playable tile.
        lo = pts[0].copy()
        hi = pts[0].copy()
        cut = len(pts)
        for n, q in enumerate(pts):
            lo, hi = np.minimum(lo, q), np.maximum(hi, q)
            if max(hi - lo) > MAX_RUN_EXTENT:
                cut = n
                break
        pts = pts[:cut]
        if len(pts) < 2:
            continue
        hh = height(pts)
        cands.append(dict(drop=float(hh[0] - hh.min()), pts=pts, names=[P[pi]["name"] for pi, _ in chain],
                          diff=[P[pi]["diff"] for pi, _ in chain]))
    cands.sort(key=lambda c: -c["drop"])
    runs = []
    for c in cands:
        if any(np.mean([np.min(np.hypot(*(r["pts"] - q).T)) < 40 for q in c["pts"][::4]]) > 0.5 for r in runs):
            continue
        runs.append(c)
        if len(runs) == 3:
            break
    return runs


def resample(pts, step=8.0, smooth=5):
    seg = np.hypot(*(pts[1:] - pts[:-1]).T)
    cum = np.concatenate([[0], np.cumsum(seg)])
    s = np.arange(0, cum[-1], step)
    x = np.interp(s, cum, pts[:, 0])
    z = np.interp(s, cum, pts[:, 1])
    if smooth > 1 and len(x) > smooth:
        k = np.ones(smooth) / smooth
        xp = np.pad(x, smooth // 2, mode="edge")
        zp = np.pad(z, smooth // 2, mode="edge")
        x, z = np.convolve(xp, k, "valid"), np.convolve(zp, k, "valid")
    return np.stack([x, z], axis=1)


# --------------------------------------------------------------------------- build
def build(m):
    log("====", m["id"], m["name"])
    proj = Proj(m["lat"], m["lon"])
    la, lo = grid(proj, FAR_SIZE, 3)
    dem = DEM(la.min(), la.max(), lo.min(), lo.max())
    # Near grid: 20 m, lightly smoothed (Copernicus is a surface model: trees add bumps).
    la, lo = grid(proj, DEM_SIZE, DEM_RES)
    near = blur(dem.sample(la, lo), 1).astype(np.float32)
    la, lo = grid(proj, FAR_SIZE, FAR_RES)
    far = blur(dem.sample(la, lo), 1).astype(np.float32)
    sp = DEM_SIZE / (DEM_RES - 1)

    def height(pts):
        fx = (pts[:, 0] + DEM_SIZE / 2) / sp
        fz = (pts[:, 1] + DEM_SIZE / 2) / sp
        return bicubic(near, fx, fz)

    osm = load_osm(m, proj)
    pistes, lifts, pylons, woods = [], [], [], []
    for el in osm.get("elements", []):
        t = el.get("tags", {})
        if el["type"] == "node" and t.get("aerialway") == "pylon":
            pylons.append(proj.xz(el["lat"], el["lon"]))
            continue
        geom = [proj.xz(p["lat"], p["lon"]) for p in el.get("geometry", []) if p]
        if len(geom) < 2:
            continue
        if t.get("piste:type") == "downhill":
            closed = geom[0] == geom[-1]
            pistes.append(dict(pts=geom, name=t.get("piste:name", t.get("name", "")), diff=t.get("piste:difficulty", ""),
                               area=closed or t.get("area") == "yes"))
        elif t.get("aerialway") in ("chair_lift", "gondola", "cable_car", "mixed_lift"):
            lifts.append(dict(pts=geom, name=t.get("name", "Lift"), type=t["aerialway"]))
        elif t.get("natural") == "wood" or t.get("landuse") == "forest":
            woods.append(geom)
    log(f"pistes {len(pistes)}  lifts {len(lifts)}  pylons {len(pylons)}  woods {len(woods)}")

    # Masks on the 20 m grid: forest coverage and piste corridors (runs are cut through the forest).
    to_px = lambda pts: [((x + DEM_SIZE / 2) / sp, (z + DEM_SIZE / 2) / sp) for x, z in pts]
    forest = Image.new("L", (DEM_RES, DEM_RES), 0)
    df = ImageDraw.Draw(forest)
    for w in woods:
        if len(w) >= 3:
            df.polygon(to_px(w), fill=255)
    piste = Image.new("L", (DEM_RES, DEM_RES), 0)
    dp = ImageDraw.Draw(piste)
    for p in pistes:
        if p["area"] and len(p["pts"]) >= 3:
            dp.polygon(to_px(p["pts"]), fill=255)
        else:
            dp.line(to_px(p["pts"]), fill=255, width=max(1, int(round(30 / sp))))
    mask = np.stack([np.array(forest), np.array(piste)], axis=-1).astype(np.uint8)

    area = load_area(m, proj)
    run_pistes = [p for p in pistes if not p["area"]]
    if area is not None:
        mine = [p for p in run_pistes if inside(area, *np.mean(p["pts"], axis=0))]
        log(f"  {len(mine)} of {len(run_pistes)} pistes inside the resort boundary")
        run_pistes = mine or run_pistes
    runs = chain_runs(run_pistes, height)
    if not runs:
        raise SystemExit(f"{m['id']}: no runs found")
    out_runs = []
    for r in runs:
        pts = resample(r["pts"])
        hh = height(pts)
        names = [n for n in dict.fromkeys(r["names"]) if n]
        out_runs.append(dict(
            name=" → ".join(names[:3]) or "Top to bottom", drop=round(float(hh[0] - hh.min())),
            length=round(float(np.hypot(*(pts[1:] - pts[:-1]).T).sum())),
            difficulty=next((d for d in r["diff"] if d), "intermediate"),
            path=[[round(float(x), 1), round(float(z), 1)] for x, z in pts]))
        log(f"  run {out_runs[-1]['name']}: drop {out_runs[-1]['drop']} m, {out_runs[-1]['length']} m")

    out_lifts = []
    for L in lifts:
        pts = np.array(L["pts"])
        hh = height(pts)
        if hh[0] > hh[-1]:
            pts, hh = pts[::-1], hh[::-1]
        towers = []
        for q in pylons:
            d = np.min(np.hypot(*(pts - np.array(q)).T)) if len(pts) else 1e9
            if d < 25:
                towers.append([round(q[0], 1), 0.0, round(q[1], 1)])
        out_lifts.append(dict(name=L["name"], type=L["type"], length=round(float(np.hypot(*(pts[1:] - pts[:-1]).T).sum()), 1),
                              line=[[round(float(x), 1), round(float(h), 1), round(float(z), 1)] for (x, z), h in zip(pts, hh)],
                              towers=towers))

    os.makedirs(OUT, exist_ok=True)
    near.tofile(os.path.join(OUT, f"{m['id']}_dem.bin"))
    far.tofile(os.path.join(OUT, f"{m['id']}_far.bin"))
    mask.tofile(os.path.join(OUT, f"{m['id']}_mask.bin"))
    meta = dict(id=m["id"], name=m["name"], region=m["region"], lat=m["lat"], lon=m["lon"],
                dem=dict(size_m=DEM_SIZE, res=DEM_RES), far=dict(size_m=FAR_SIZE, res=FAR_RES),
                water=LAKE_TAHOE, summit=round(float(near.max())), base=round(float(near.min())),
                runs=out_runs, lifts=out_lifts,
                sources=["Copernicus GLO-30 DEM (ESA, DLR/Airbus)", "OpenStreetMap contributors (ODbL)"])
    json.dump(meta, open(os.path.join(OUT, f"{m['id']}.json"), "w"), separators=(",", ":"))
    return dict(id=m["id"], name=m["name"], region=m["region"], runs=[dict(name=r["name"], drop=r["drop"], length=r["length"], difficulty=r["difficulty"]) for r in out_runs])


def main():
    want = set(sys.argv[1:])
    index_path = os.path.join(OUT, "index.json")
    index = {e["id"]: e for e in json.load(open(index_path))} if os.path.exists(index_path) else {}
    for m in MOUNTAINS:
        if want and m["id"] not in want:
            continue
        try:
            index[m["id"]] = build(m)
        except SystemExit as ex:
            log("SKIPPED", m["id"], ex)
    ordered = [index[m["id"]] for m in MOUNTAINS if m["id"] in index]
    os.makedirs(OUT, exist_ok=True)
    json.dump(ordered, open(index_path, "w"), indent=1)
    log("wrote", index_path, len(ordered), "mountains")


if __name__ == "__main__":
    main()
