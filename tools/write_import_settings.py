#!/usr/bin/env python3
"""Write Godot .import files so 3D textures get mipmaps + VRAM compression (and normal-map mode).
Run before the first editor/headless import (or after adding textures)."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = """[remap]

importer="texture"
type="CompressedTexture2D"

[deps]

source_file="res://{rel}"

[params]

compress/mode=2
compress/high_quality=false
compress/lossy_quality=0.7
compress/hdr_compression=1
compress/normal_map={normal}
compress/channel_pack=0
mipmaps/generate=true
mipmaps/limit=-1
roughness/mode=0
roughness/src_normal=""
process/fix_alpha_border=true
process/premult_alpha=false
process/normal_map_invert_y=false
process/hdr_as_srgb=false
process/hdr_clamp_exposure=false
process/size_limit=0
detect_3d/compress_to=0
"""

for base in ("assets/textures", "assets/models"):
    for dirpath, _, files in os.walk(os.path.join(ROOT, base)):
        for f in files:
            if not f.lower().endswith((".png", ".jpg", ".jpeg")):
                continue
            path = os.path.join(dirpath, f)
            rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
            imp = path + ".import"
            normal = 1 if ("nor" in f.lower() or "normal" in f.lower()) else 0
            want = TEMPLATE.format(rel=rel, normal=normal)
            if os.path.exists(imp) and "mipmaps/generate=true" in open(imp).read() and f"compress/normal_map={normal}" in open(imp).read():
                continue
            open(imp, "w").write(want)
            print("wrote", imp)
