#!/usr/bin/env python3
"""Prepare the skier character from Quaternius "Universal Base Characters" (CC0).

Copies Superhero_Male_FullBody.gltf into assets/models/skier/, downsizes textures to 1K and bakes a
COLOR_0 vertex attribute that marks clothing zones from the skin weights:
  R = jacket, G = pants, B = gloves/boots, A = clothing coverage (0 = skin).
The game's suit shader turns these zones into a fictional outfit (Northwake jacket, etc.).

Usage: python3 tools/prep_character.py "<path to 'Universal Base Characters[Standard]' folder>"
"""
import json
import os
import shutil
import struct
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "models", "skier")

ZONES = {
    "jacket": ("spine", "clavicle", "upperarm", "lowerarm", "neck"),
    "pants": ("pelvis", "thigh", "calf", "root"),
    "dark": ("hand", "index", "middle", "pinky", "ring", "thumb", "foot", "ball"),
}
COMP = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_accessor(g, binbuf, idx):
    a = g["accessors"][idx]
    bv = g["bufferViews"][a["bufferView"]]
    n = NCOMP[a["type"]]
    fmt = COMP[a["componentType"]]
    size = struct.calcsize(fmt)
    stride = bv.get("byteStride", size * n)
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    dt = np.dtype("<" + fmt)
    out = np.zeros((a["count"], n), dtype=dt)
    raw = binbuf[off: off + stride * a["count"]]
    if stride == size * n:
        out = np.frombuffer(raw[: size * n * a["count"]], dtype=dt).reshape(a["count"], n)
    else:
        for i in range(a["count"]):
            out[i] = np.frombuffer(raw[i * stride: i * stride + size * n], dtype=dt)
    return out


def weld(pos):
    key = np.round(pos * 1e4).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    return inv.reshape(-1)


def tailor(pos, idx, col):
    """Smooth away muscle definition under clothing (Taubin) and puff the fabric out."""
    grp = weld(pos)
    ng = grp.max() + 1
    gpos = np.zeros((ng, 3))
    np.add.at(gpos, grp, pos)
    cnt = np.bincount(grp, minlength=ng)[:, None]
    gpos /= cnt
    gcol = np.zeros((ng, 4))
    np.add.at(gcol, grp, col)
    gcol /= cnt
    # Hands keep their fingers; everything else under fabric gets smoothed.
    hands = (gcol[:, 2] > 0.5) & (gpos[:, 1] > 0.5)
    w = np.clip(gcol[:, 3], 0, 1) * (~hands)
    e = np.concatenate([idx[:, [0, 1]], idx[:, [1, 2]], idx[:, [2, 0]]])
    e = grp[e]
    e = np.concatenate([e, e[:, ::-1]])
    deg = np.bincount(e[:, 0], minlength=ng).astype(np.float64)[:, None]
    for it in range(30):
        for lam in (0.5, -0.52):
            acc = np.zeros((ng, 3))
            np.add.at(acc, e[:, 0], gpos[e[:, 1]])
            lap = acc / np.maximum(deg, 1) - gpos
            gpos += lam * lap * w[:, None]
    # Inflate along smoothed normals: jacket most, boots chunky, pants loose.
    gidx = grp[idx]
    gn = vertex_normals(gpos, gidx)
    puff = gcol[:, 0] * 0.028 + gcol[:, 1] * 0.022 + gcol[:, 2] * 0.03 * (gpos[:, 1] < 0.5)
    puff += gcol[:, 2] * 0.006 * (gpos[:, 1] >= 0.5)
    gpos += gn * puff[:, None] * gcol[:, 3:4]
    return gpos[grp]


def vertex_normals(pos, idx):
    a, b, c = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    fn = np.cross(b - a, c - a)
    grp = weld(pos)
    ng = grp.max() + 1
    gn = np.zeros((ng, 3))
    for k in range(3):
        np.add.at(gn, grp[idx[:, k]], fn)
    gn /= np.maximum(np.linalg.norm(gn, axis=1, keepdims=True), 1e-9)
    return gn[grp]


def write_vec3(g, binbuf, acc_idx, arr):
    a = g["accessors"][acc_idx]
    bv = g["bufferViews"][a["bufferView"]]
    stride = bv.get("byteStride", 12)
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    data = arr.astype("<f4")
    for i in range(a["count"]):
        binbuf[off + i * stride: off + i * stride + 12] = data[i].tobytes()
    if "min" in a:
        a["min"] = data.min(axis=0).tolist()
        a["max"] = data.max(axis=0).tolist()


def main():
    src_root = sys.argv[1] if len(sys.argv) > 1 else "."
    src = os.path.join(src_root, "Base Characters", "Godot - UE")
    os.makedirs(OUT, exist_ok=True)
    g = json.load(open(os.path.join(src, "Superhero_Male_FullBody.gltf")))
    binbuf = bytearray(open(os.path.join(src, g["buffers"][0]["uri"]), "rb").read())

    skin = g["skins"][0]
    joint_names = [g["nodes"][j]["name"] for j in skin["joints"]]

    def zone_of(name):
        for z, keys in ZONES.items():
            if any(name.startswith(k) for k in keys):
                return z
        return "skin"

    zone_vec = {"jacket": (1, 0, 0, 1), "pants": (0, 1, 0, 1), "dark": (0, 0, 1, 1), "skin": (0, 0, 0, 0)}
    jz = np.array([zone_vec[zone_of(n)] for n in joint_names], dtype=np.float64)

    for mesh in g["meshes"]:
        for prim in mesh["primitives"]:
            attrs = prim["attributes"]
            if "JOINTS_0" not in attrs:
                continue
            mat = g["materials"][prim.get("material", 0)]["name"] if "material" in prim else ""
            if "Superhero" not in mat:
                continue
            joints = read_accessor(g, binbuf, attrs["JOINTS_0"]).astype(np.int64)
            weights = read_accessor(g, binbuf, attrs["WEIGHTS_0"]).astype(np.float64)
            col = np.zeros((joints.shape[0], 4))
            for k in range(4):
                col += jz[joints[:, k]] * weights[:, k: k + 1]
            col /= np.maximum(weights.sum(axis=1, keepdims=True), 1e-6)
            # Sharpen clothing seams a little.
            col[:, 3] = np.clip((col[:, 3] - 0.5) * 3.0 + 0.5, 0, 1)
            # Height-based zones read better than bones alone: a long jacket over the hips,
            # tall ski boots below the shin.
            pos = read_accessor(g, binbuf, attrs["POSITION"]).astype(np.float64)
            y = pos[:, 1]
            clothed = col[:, 3] > 0.5
            hand = col[:, 2] > 0.5
            jacket_h = clothed & ~hand & (y > 0.86)
            col[jacket_h] = [1, 0, 0, 1]
            legs = clothed & (y <= 0.86) & ~hand
            col[legs & (y > 0.36)] = [0, 1, 0, 1]
            col[legs & (y <= 0.36)] = [0, 0, 1, 1]
            col[(col[:, 2] > 0.5) & (y < 0.4)] = [0, 0, 1, 1]
            idx = read_accessor(g, binbuf, prim["indices"]).astype(np.int64).reshape(-1, 3)
            new_pos = tailor(pos, idx, col)
            nrm = vertex_normals(new_pos, idx)
            write_vec3(g, binbuf, attrs["POSITION"], new_pos)
            write_vec3(g, binbuf, attrs["NORMAL"], nrm)
            data = (np.clip(col, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()
            while len(binbuf) % 4:
                binbuf.append(0)
            off = len(binbuf)
            binbuf.extend(data)
            g["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(data)})
            g["accessors"].append({"bufferView": len(g["bufferViews"]) - 1, "componentType": 5121,
                                   "normalized": True, "count": joints.shape[0], "type": "VEC4"})
            attrs["COLOR_0"] = len(g["accessors"]) - 1
            print("baked zones for", mesh.get("name"), joints.shape[0], "verts")

    g["buffers"][0]["uri"] = "skier.bin"
    g["buffers"][0]["byteLength"] = len(binbuf)
    open(os.path.join(OUT, "skier.bin"), "wb").write(binbuf)
    for img in g.get("images", []):
        uri = img["uri"]
        p = os.path.join(src, uri)
        if not os.path.exists(p):
            p = os.path.join(src, uri.replace("_png.png", ".png"))
        im = Image.open(p)
        if max(im.size) > 1024:
            im = im.resize((1024, 1024), Image.LANCZOS)
        im.save(os.path.join(OUT, uri))
    json.dump(g, open(os.path.join(OUT, "skier.gltf"), "w"))
    print("joints:", joint_names)


if __name__ == "__main__":
    main()
