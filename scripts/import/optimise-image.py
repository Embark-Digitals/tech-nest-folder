"""Optimise an oversized extracted product image in place, preserving format and transparency."""
import sys
from PIL import Image

p = sys.argv[1]
im = Image.open(p)
if max(im.size) > 1600:
    im.thumbnail((1600, 1600), Image.LANCZOS)
if p.lower().endswith((".jpg", ".jpeg")):
    im.convert("RGB").save(p, "JPEG", quality=88, optimize=True, progressive=True)
else:
    im.save(p, optimize=True)
