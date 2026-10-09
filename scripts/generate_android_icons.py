#!/usr/bin/env python3
"""Generate all Android launcher icon densities from the existing Nalaro brand image."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/brand/nalaro.png"
RES = ROOT / "android/app/src/main/res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
BG = "#0B0C0A"

source = Image.open(SOURCE).convert("RGBA")
# The original Nalaro mark is the source of truth: no replacement graphics.
for density, factor in DENSITIES.items():
    folder = RES / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    size = round(48 * factor)
    artwork = ImageOps.contain(source, (size, size), Image.Resampling.LANCZOS)
    icon = Image.new("RGBA", (size, size), BG)
    icon.alpha_composite(artwork, ((size-artwork.width)//2, (size-artwork.height)//2))
    icon.convert("RGB").save(folder / "ic_launcher.png", optimize=True)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size-1, size-1), fill=255)
    rounded = icon.copy()
    rounded.putalpha(mask)
    rounded.save(folder / "ic_launcher_round.png", optimize=True)

    adaptive_size = round(108 * factor)
    safe_size = round(70 * factor)
    foreground = Image.new("RGBA", (adaptive_size, adaptive_size), (0,0,0,0))
    scaled = ImageOps.contain(source, (safe_size, safe_size), Image.Resampling.LANCZOS)
    foreground.alpha_composite(scaled, ((adaptive_size-scaled.width)//2, (adaptive_size-scaled.height)//2))
    foreground.save(folder / "ic_launcher_foreground.png", optimize=True)

print("Generated Nalaro Android icons from", SOURCE.relative_to(ROOT))
