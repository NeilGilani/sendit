#!/usr/bin/env python3
"""Build SENDIT's real mountain data.

Downloads Copernicus GLO-30 elevation tiles (AWS open data) and OpenStreetMap
pistes, lifts and forests (Overpass API) for a ~6x6 km box around the
Matterhorn above Zermatt, then exports game-ready data into assets/terrain/.

Outputs (assets/terrain/):
  height_f32.bin   2048x2048 float32 little-endian heights in metres (row 0 = north)
  far_f32.bin      512x512 float32 heights for a 30x30 km backdrop
  splat_rgb8.bin   2048x2048x3 uint8: R groomed, G rock, B forest (powder = remainder)
  normal_rg8.bin   2048x2048x2 uint8: terrain normal x/z (y reconstructed), 0..255 -> -1..1
  terrain.json     metadata (sizes, spacing, min/max, spawn)
  pistes.json      piste polylines in local metres
  lifts.json       lift polylines + tower positions in local metres
  scatter.json     tree and rock instances
Previews (tools/preview/): heightmap16.png (16-bit), splat.png

Coordinates: local metres, x = east, z = south (Godot -Z = north), origin at box centre.
Requires: Python 3.9+, numpy, Pillow. Run:  python3 tools/build_mountain.py
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
OUT = os.path.join(ROOT, "assets", "terrain")
PREVIEW = os.path.join(ROOT, "tools", "preview")

# Box centre: between the Matterhorn east face and Schwarzsee/Furgg/Trockener Steg.
LAT0, LON0 = 45.9830, 7.6880
SIZE_M = 6000.0
RES = 2048
FAR_SIZE_M = 30000.0
FAR_RES = 512
TREELINE = 2350.0
SEED = 7

R_EARTH = 6371008.8
COS0 = math.cos(math.radians(LAT0))
UA = "SENDIT-terrain-builder/1.0 (offline game data tool)"
OVERPASS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

FICTIONAL_LIFTS = [
    "Edelweiss", "Larch Ridge", "Glacier Lantern", "Silver Saddle", "Moonpass", "Alpenglow",
    "Quiet Couloir", "Snowfinch", "Cloudline", "Stonepine", "Whitewater", "Valcrest Summit",
    "Dawn Patrol", "Marmot Meadow", "High Ember", "Ibex Traverse",
]
LIFT_SUFFIX = {"chair_lift": "Chair", "mixed_lift": "Chair", "gondola": "Gondola", "cable_car": "Cable Car",
               "drag_lift": "Drag Lift", "t-bar": "T-Bar", "j-bar": "J-Bar", "platter": "Platter"}
FICTIONAL_PISTES = [
    "Golden Mile", "Slow River", "Bluebird", "Lantern Way", "Soft Shoulder", "Featherfall",
    "Hush", "Sunthread", "Long Exhale", "Paperwhite", "Kestrel", "Quiet Bowl", "Driftwood",
    "Larkspur", "Hearthside", "Silk Road", "Pale Fire", "Morning Glide", "Twin Pines", "Cirrus",
]


def log(*a):
    print("[mountain]", *a, flush=True)


def ll_to_xz(lat, lon):
    x = math.radians(lon - LON0) * R_EARTH * COS0
    north = math.radians(lat - LAT0) * R_EARTH
    return x, -north


def xz_to_ll(x, z):
    lat = LAT0 + math.degrees(-z / R_EARTH)
    lon = LON0 + math.degrees(x / (R_EARTH * COS0))
    return lat, lon


def fetch(url, data=None, timeout=180):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


# --------------------------------------------------------------------------- DEM
def tile_name(lat, lon):
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"


def load_tile(lat, lon):
    os.makedirs(CACHE, exist_ok=True)
    short = f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}_00_{'E' if lon >= 0 else 'W'}{abs(lon):03d}_00.tif"
    path = os.path.join(CACHE, short)
    if not os.path.exists(path):
        name = tile_name(lat, lon)
        url = f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
        log("downloading", url)
        with open(path, "wb") as f:
            f.write(fetch(url, timeout=600))
    return np.array(Image.open(path), dtype=np.float32)


class DEM:
    """Mosaic of 1x1 degree Copernicus tiles with bicubic sampling."""

    def __init__(self, lat_min, lat_max, lon_min, lon_max):
        self.lat_lo = math.floor(lat_min)
        self.lat_hi = math.floor(lat_max)
        self.lon_lo = math.floor(lon_min)
        self.lon_hi = math.floor(lon_max)
        rows = []
        for la in range(self.lat_hi, self.lat_lo - 1, -1):
            row = [load_tile(la, lo) for lo in range(self.lon_lo, self.lon_hi + 1)]
            rows.append(np.concatenate(row, axis=1))
        self.data = np.concatenate(rows, axis=0)
        self.n_per_deg_y = self.data.shape[0] / (self.lat_hi - self.lat_lo + 1)
        self.n_per_deg_x = self.data.shape[1] / (self.lon_hi - self.lon_lo + 1)

    def sample(self, lat, lon):
        # Pixel centres: row r has lat = top - (r + 0.5) / n
        top = self.lat_hi + 1
        fy = (top - lat) * self.n_per_deg_y - 0.5
        fx = (lon - self.lon_lo) * self.n_per_deg_x - 0.5
        return bicubic(self.data, fx, fy)


def cubic_w(t):
    # Catmull-Rom weights for offsets -1, 0, 1, 2
    t2, t3 = t * t, t * t * t
    return (
        -0.5 * t3 + t2 - 0.5 * t,
        1.5 * t3 - 2.5 * t2 + 1.0,
        -1.5 * t3 + 2.0 * t2 + 0.5 * t,
        0.5 * t3 - 0.5 * t2,
    )


def bicubic(img, fx, fy):
    h, w = img.shape
    x0 = np.floor(fx).astype(np.int64)
    y0 = np.floor(fy).astype(np.int64)
    tx, ty = fx - x0, fy - y0
    wx, wy = cubic_w(tx), cubic_w(ty)
    out = np.zeros(np.shape(fx), dtype=np.float64)
    for j in range(4):
        yy = np.clip(y0 + j - 1, 0, h - 1)
        row = np.zeros(np.shape(fx), dtype=np.float64)
        for i in range(4):
            xx = np.clip(x0 + i - 1, 0, w - 1)
            row += wx[i] * img[yy, xx]
        out += wy[j] * row
    return out


def grid_ll(size_m, res):
    half = size_m * 0.5
    coords = -half + np.arange(res) * (size_m / (res - 1))
    x, z = np.meshgrid(coords, coords)  # row = z (north at row 0 => z = -half)
    lat = LAT0 + np.degrees(-z / R_EARTH)
    lon = LON0 + np.degrees(x / (R_EARTH * COS0))
    return lat, lon


def blur(a, radius):
    """Separable box blur (3 passes ~ gaussian)."""
    a = a.astype(np.float64)
    r = int(max(1, radius))
    for _ in range(3):
        for axis in (0, 1):
            pad = [(0, 0), (0, 0)]
            pad[axis] = (r + 1, r)
            p = np.pad(a, pad, mode="edge")
            c = np.cumsum(p, axis=axis)
            if axis == 0:
                a = (c[2 * r + 1:, :] - c[:-2 * r - 1, :]) / (2 * r + 1)
            else:
                a = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return a


def value_noise(res, cell, rng):
    n = int(res / cell) + 3
    g = rng.random((n, n))
    f = np.arange(res) / cell
    fx, fy = np.meshgrid(f, f)
    return bicubic(g, fx + 1, fy + 1)


def fbm(res, base_cell, octaves, rng):
    out = np.zeros((res, res))
    amp, cell, total = 1.0, base_cell, 0.0
    for _ in range(octaves):
        out += amp * (value_noise(res, cell, rng) - 0.5)
        total += amp
        amp *= 0.5
        cell = max(2.0, cell * 0.5)
    return out / total


# --------------------------------------------------------------------------- OSM
def overpass_query():
    lat_a, lon_a = xz_to_ll(-SIZE_M / 2, SIZE_M / 2)
    lat_b, lon_b = xz_to_ll(SIZE_M / 2, -SIZE_M / 2)
    s, w, n, e = min(lat_a, lat_b), min(lon_a, lon_b), max(lat_a, lat_b), max(lon_a, lon_b)
    bb = f"({s:.5f},{w:.5f},{n:.5f},{e:.5f})"
    return f"""[out:json][timeout:180];
(
  way["piste:type"]{bb};
  relation["piste:type"]{bb};
  way["aerialway"]{bb};
  node["aerialway"="pylon"]{bb};
  way["natural"="wood"]{bb};
  way["landuse"="forest"]{bb};
  relation["natural"="wood"]{bb};
  relation["landuse"="forest"]{bb};
);
out body geom;"""


def load_osm():
    path = os.path.join(CACHE, "osm.json")
    if os.path.exists(path):
        return json.load(open(path))
    q = overpass_query()
    last = None
    for ep in OVERPASS:
        for attempt in range(2):
            try:
                log("overpass", ep)
                raw = fetch(ep, data=urllib.parse.urlencode({"data": q}).encode(), timeout=150)
                data = json.loads(raw)
                json.dump(data, open(path, "w"))
                return data
            except Exception as ex:  # try next mirror
                last = ex
                log("  failed:", ex)
                time.sleep(2 + attempt * 3)
    raise SystemExit(f"Overpass unavailable: {last}")


def way_xz(el):
    return [ll_to_xz(p["lat"], p["lon"]) for p in el.get("geometry", []) if p]


# --------------------------------------------------------------------------- main
def main():
    rng = np.random.default_rng(SEED)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PREVIEW, exist_ok=True)
    half = SIZE_M / 2
    ps = SIZE_M / (RES - 1)

    # Elevation ---------------------------------------------------------------
    far_lat, far_lon = grid_ll(FAR_SIZE_M, FAR_RES)
    dem = DEM(far_lat.min(), far_lat.max(), far_lon.min(), far_lon.max())
    lat, lon = grid_ll(SIZE_M, RES)
    log("resampling heights")
    h = dem.sample(lat, lon)
    far = dem.sample(far_lat, far_lon)

    # OSM ---------------------------------------------------------------------
    osm = load_osm()
    els = osm.get("elements", [])
    log("osm elements:", len(els))

    def to_px(pts):
        return [((x + half) / ps, (z + half) / ps) for x, z in pts]

    groomed_img = Image.new("L", (RES, RES), 0)
    gdraw = ImageDraw.Draw(groomed_img)
    forest_img = Image.new("L", (RES, RES), 0)
    fdraw = ImageDraw.Draw(forest_img)
    clear_img = Image.new("L", (RES, RES), 0)
    cdraw = ImageDraw.Draw(clear_img)

    pistes, lifts, pylons = [], [], []
    for el in els:
        tags = el.get("tags", {})
        if el["type"] == "node" and tags.get("aerialway") == "pylon":
            pylons.append(ll_to_xz(el["lat"], el["lon"]))
            continue
        if el["type"] == "way" and tags.get("piste:type") == "downhill":
            pts = way_xz(el)
            if len(pts) < 2:
                continue
            diff = tags.get("piste:difficulty", "intermediate")
            groom = tags.get("piste:grooming", "classic")
            try:
                width = float(tags.get("width", "").split()[0])
            except (ValueError, IndexError):
                width = {"novice": 40, "easy": 36, "intermediate": 30, "advanced": 24, "expert": 20}.get(diff, 30)
            is_area = tags.get("area") == "yes" or (pts[0] == pts[-1] and len(pts) > 3)
            groomed = groom not in ("backcountry", "mogul", "no")
            px = to_px(pts)
            if is_area:
                if groomed:
                    gdraw.polygon(px, fill=255)
                cdraw.polygon(px, fill=255)
            else:
                wpx = max(3, int(width / ps))
                if groomed:
                    gdraw.line(px, fill=255, width=wpx, joint="curve")
                cdraw.line(px, fill=255, width=int(wpx * 1.4), joint="curve")
                pistes.append({"difficulty": diff, "groomed": groomed, "width": width, "points": pts})
        elif el["type"] == "way" and "aerialway" in tags:
            kind = tags["aerialway"]
            if kind in ("station", "pylon", "goods", "zip_line", "magic_carpet", "rope_tow"):
                continue
            pts = way_xz(el)
            if len(pts) >= 2:
                lifts.append({"type": kind, "points": pts, "osm_id": el["id"]})
                cdraw.line(to_px(pts), fill=255, width=max(3, int(26 / ps)))
        elif tags.get("natural") == "wood" or tags.get("landuse") == "forest":
            if el["type"] == "way":
                rings = [way_xz(el)]
            else:
                rings = [[ll_to_xz(p["lat"], p["lon"]) for p in m.get("geometry", [])]
                         for m in el.get("members", []) if m.get("role") == "outer"]
                holes = [[ll_to_xz(p["lat"], p["lon"]) for p in m.get("geometry", [])]
                         for m in el.get("members", []) if m.get("role") == "inner"]
                for r in holes:
                    if len(r) > 2:
                        fdraw.polygon(to_px(r), fill=0)
            for r in rings:
                if len(r) > 2:
                    fdraw.polygon(to_px(r), fill=255)

    groomed = np.asarray(groomed_img, dtype=np.float64) / 255.0
    forest_osm = np.asarray(forest_img, dtype=np.float64) / 255.0
    clear = np.asarray(clear_img, dtype=np.float64) / 255.0

    # Smooth pistes (groomers flatten things), add gentle relief elsewhere -----
    gsoft = blur(groomed, 4)
    h_smooth = blur(h, 5)
    h = h * (1 - gsoft * 0.85) + h_smooth * gsoft * 0.85
    detail = fbm(RES, 48, 4, rng) * 1.4
    h = h + detail * (1 - gsoft)

    # Slope -------------------------------------------------------------------
    gz, gx = np.gradient(h, ps)
    slope_deg = np.degrees(np.arctan(np.hypot(gx, gz)))

    rock = np.clip((slope_deg - 34.0) / 10.0, 0, 1)
    rock_noise = fbm(RES, 64, 3, rng) * 0.6
    rock = np.clip(rock + rock_noise * (rock > 0.05), 0, 1)
    rock = rock * (1 - gsoft)
    rock = blur(rock, 1)

    alt_ok = np.clip((TREELINE - h) / 120.0, 0, 1)
    forest = blur(forest_osm, 3) * alt_ok * np.clip((40 - slope_deg) / 8.0, 0, 1)
    forest = forest * (1 - blur(clear, 2))
    forest = np.clip(forest, 0, 1)

    groomed_out = np.clip(gsoft * 1.15, 0, 1)
    splat = np.stack([groomed_out, rock, forest], axis=-1)
    splat8 = (np.clip(splat, 0, 1) * 255 + 0.5).astype(np.uint8)

    # Scatter: trees and rocks -------------------------------------------------
    log("scattering")
    trees = []
    step = 7.0
    n = int(SIZE_M / step)
    for j in range(n):
        for i in range(n):
            x = -half + (i + rng.random()) * step
            z = -half + (j + rng.random()) * step
            ci = min(RES - 1, int((x + half) / ps))
            cj = min(RES - 1, int((z + half) / ps))
            f = forest[cj, ci]
            p = f * 0.55
            if f < 0.05 and h[cj, ci] < TREELINE - 80 and slope_deg[cj, ci] < 32 and clear[cj, ci] < 0.1:
                p = 0.012  # lonely trees in open meadows
            if rng.random() < p:
                trees.append([round(x, 2), round(float(h[cj, ci]), 2), round(z, 2),
                              round(rng.random() * 6.2832, 3), round(1.3 + rng.random() * 1.0, 3),
                              int(rng.integers(0, 5))])
    rocks = []
    step = 18.0
    n = int(SIZE_M / step)
    for j in range(n):
        for i in range(n):
            x = -half + (i + rng.random()) * step
            z = -half + (j + rng.random()) * step
            ci = min(RES - 1, int((x + half) / ps))
            cj = min(RES - 1, int((z + half) / ps))
            s = slope_deg[cj, ci]
            if groomed_out[cj, ci] > 0.1 or clear[cj, ci] > 0.3:
                continue
            p = 0.0
            if 26 < s < 45:
                p = 0.10 + 0.25 * rock[cj, ci]
            elif s <= 26:
                p = 0.012
            if rng.random() < p:
                rocks.append([round(x, 2), round(float(h[cj, ci]) - 0.4, 2), round(z, 2),
                              round(rng.random() * 6.2832, 3), round(0.6 + rng.random() ** 2 * 2.6, 3),
                              int(rng.integers(0, 3))])

    # Lifts: names, towers ----------------------------------------------------
    def ground(x, z):
        fx = np.array([(x + half) / ps])
        fz = np.array([(z + half) / ps])
        return float(bicubic(h, fx, fz)[0])

    def inside(x, z, m=0.0):
        return -half + m <= x <= half - m and -half + m <= z <= half - m

    lift_out = []
    lifts.sort(key=lambda L: -sum(math.dist(a, b) for a, b in zip(L["points"], L["points"][1:])))
    for idx, L in enumerate(lifts):
        pts = [p for p in L["points"] if inside(p[0], p[1], 5)]
        if len(pts) < 2:
            continue
        # Orient bottom -> top
        if ground(*pts[0]) > ground(*pts[-1]):
            pts.reverse()
        line = [[round(x, 2), round(ground(x, z), 2), round(z, 2)] for x, z in pts]
        total = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
        towers = []
        for px_, pz_ in pylons:
            # distance to polyline
            best = 1e9
            for a, b in zip(pts, pts[1:]):
                ax, az = a
                bx, bz = b
                dx, dz = bx - ax, bz - az
                L2 = dx * dx + dz * dz
                t = 0 if L2 == 0 else max(0, min(1, ((px_ - ax) * dx + (pz_ - az) * dz) / L2))
                best = min(best, math.hypot(ax + t * dx - px_, az + t * dz - pz_))
            if best < 12:
                towers.append([round(px_, 2), round(ground(px_, pz_), 2), round(pz_, 2)])
        lift_out.append({
            "name": FICTIONAL_LIFTS[len(lift_out) % len(FICTIONAL_LIFTS)] + " " + LIFT_SUFFIX.get(L["type"], "Lift"),
            "type": L["type"],
            "length": round(total, 1),
            "line": line,
            "towers": towers,
        })

    piste_out = []
    for k, p in enumerate(pistes):
        pts = [q for q in p["points"] if inside(q[0], q[1])]
        if len(pts) < 2:
            continue
        line = [[round(x, 2), round(ground(x, z), 2), round(z, 2)] for x, z in pts]
        if line[0][1] < line[-1][1]:
            line.reverse()
        piste_out.append({"name": FICTIONAL_PISTES[k % len(FICTIONAL_PISTES)], "difficulty": p["difficulty"],
                          "groomed": p["groomed"], "width": p["width"], "line": line,
                          "length": round(sum(math.dist((a[0], a[2]), (b[0], b[2])) for a, b in zip(line, line[1:])), 1)})

    # Spawn: top of the longest easy/intermediate piste that starts near a lift top
    lift_tops = [L["line"][-1] for L in lift_out if L["type"] in ("chair_lift", "gondola", "mixed_lift", "cable_car")]

    def near_top(pt):
        return min((math.dist((pt[0], pt[2]), (t[0], t[2])) for t in lift_tops), default=1e9)

    spawn = None
    cands = sorted(piste_out, key=lambda p: -(p["length"] - near_top(p["line"][0]) * 2
                                                 - (0 if p["difficulty"] in ("easy", "intermediate", "novice") else 800)))
    for p in cands:
        a = p["line"][0]
        b = next((q for q in p["line"][1:] if math.dist((a[0], a[2]), (q[0], q[2])) > 25), p["line"][-1])
        if inside(a[0], a[2], 200):
            spawn = {"position": [a[0], a[1], a[2]], "heading": math.atan2(-(b[0] - a[0]), -(b[2] - a[2])),
                     "piste": p["name"]}
            break
    if spawn is None:
        spawn = {"position": [0.0, ground(0, 0), 0.0], "heading": 0.0, "piste": ""}

    # Export -------------------------------------------------------------------
    h32 = h.astype("<f4")
    h32.tofile(os.path.join(OUT, "height_f32.bin"))
    far.astype("<f4").tofile(os.path.join(OUT, "far_f32.bin"))
    splat8.tofile(os.path.join(OUT, "splat_rgb8.bin"))
    gz2, gx2 = np.gradient(h, ps)
    nrm = np.stack([-gx2, np.ones_like(h), -gz2], axis=-1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    nrg = np.stack([nrm[..., 0], nrm[..., 2]], axis=-1)
    (np.clip(nrg * 0.5 + 0.5, 0, 1) * 255 + 0.5).astype(np.uint8).tofile(os.path.join(OUT, "normal_rg8.bin"))
    meta = {
        "size_m": SIZE_M, "res": RES, "spacing": ps,
        "far_size_m": FAR_SIZE_M, "far_res": FAR_RES,
        "min_height": float(h.min()), "max_height": float(h.max()),
        "far_min_height": float(far.min()), "far_max_height": float(far.max()),
        "center_lat": LAT0, "center_lon": LON0, "treeline": TREELINE,
        "spawn": spawn,
        "sources": ["Copernicus GLO-30 DEM (ESA, DLR/Airbus)", "OpenStreetMap contributors (ODbL)"],
    }
    json.dump(meta, open(os.path.join(OUT, "terrain.json"), "w"), indent=1)
    json.dump(piste_out, open(os.path.join(OUT, "pistes.json"), "w"))
    json.dump(lift_out, open(os.path.join(OUT, "lifts.json"), "w"))
    json.dump({"trees": trees, "rocks": rocks}, open(os.path.join(OUT, "scatter.json"), "w"))

    hn = (h - h.min()) / max(1e-6, h.max() - h.min())
    Image.fromarray((hn * 65535).astype(np.uint16)).save(os.path.join(PREVIEW, "heightmap16.png"))
    prev = np.zeros((RES, RES, 3), dtype=np.float64)
    shade = np.clip(0.55 + 0.45 * (-gx * 0.7 - gz * 0.7) / (1 + np.hypot(gx, gz)), 0, 1)
    base = np.ones(3) * 0.92
    for c in range(3):
        prev[..., c] = base[c] * shade
    prev = prev * (1 - groomed_out[..., None]) + np.array([0.55, 0.75, 1.0]) * shade[..., None] * groomed_out[..., None]
    prev = prev * (1 - rock[..., None]) + np.array([0.45, 0.4, 0.37]) * shade[..., None] * rock[..., None]
    prev = prev * (1 - forest[..., None]) + np.array([0.15, 0.35, 0.2]) * shade[..., None] * forest[..., None]
    Image.fromarray((prev * 255).astype(np.uint8)).save(os.path.join(PREVIEW, "splat.png"))
    log(f"done: h {h.min():.0f}..{h.max():.0f} m, pistes {len(piste_out)}, lifts {len(lift_out)}, "
        f"trees {len(trees)}, rocks {len(rocks)}, spawn {spawn}")


if __name__ == "__main__":
    sys.exit(main())
