#!/usr/bin/env python3
"""Audit Practice Perfect website image references and library quality."""
from pathlib import Path
import re, sys

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / "assets" / "library"
PAGES = [ROOT / p for p in [
    "index.html","services.html","what-we-fix.html","our-system.html",
    "about.html","pricing.html","contact.html","styles.css","enhancements.css"
] if (ROOT / p).exists()]

REF_RE = re.compile(r'(?:src=["\']([^"\']+\.(?:png|jpe?g|webp|svg))["\']|url\(["\']?([^)"\']+\.(?:png|jpe?g|webp|svg)))', re.I)
errors=[]
warnings=[]
refs=[]

for page in PAGES:
    text=page.read_text(encoding="utf-8", errors="ignore")
    for m in REF_RE.finditer(text):
        ref=m.group(1) or m.group(2)
        if ref.startswith("http://") or ref.startswith("https://"):
            errors.append(f"{page.name}: external image URL not allowed: {ref}")
            continue
        refs.append((page.name,ref))
        if ref.startswith("data:"):
            warnings.append(f"{page.name}: embedded image should be moved to library")
            continue
        if "/assets/library/" not in ref:
            errors.append(f"{page.name}: image is outside central library: {ref}")
            continue
        path=ROOT / ref.lstrip("/")
        if not path.exists():
            errors.append(f"{page.name}: missing image: {ref}")

print("Practice Perfect image asset audit")
print(f"Pages/styles checked: {len(PAGES)}")
print(f"Image references checked: {len(refs)}")
if warnings:
    print("\nWARNINGS")
    for x in warnings: print(" -",x)
if errors:
    print("\nERRORS")
    for x in errors: print(" -",x)
    sys.exit(1)
print("\nPASS: all discovered image references resolve through /assets/library/.")
