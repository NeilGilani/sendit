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
