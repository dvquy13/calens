---
name: cws-promo-tile
description: Generate Chrome Web Store promotional tile images for Calens using Python + PIL. Use when creating or updating 440x280 or 920x680 CWS store assets.
---

# CWS Promotional Tile Generator

Generate Chrome Web Store promotional tile images (440×280 and 920×680) for Calens using Python + PIL.

## When to use

When creating or updating promotional tile images for the Chrome Web Store listing.
CWS requires at least a **440×280 small tile** to be eligible for the Featured badge.

## Design constraints (learned from session)

**Before writing any code, always read:**
- `docs/design-kit/tokens.css` — exact brand color, foreground steps, border radius values
- `public/screenshots/calens-1280-800.png` — source of truth for real UI components

**Key design decisions:**
- **Background**: white `(255, 255, 255)` — Calens is a light-theme product; never use dark unless the user asks
- **Brand blue**: `#0062a8` = `(0, 98, 168)` — extracted from `tokens.css` `--brand-default`
- **Font**: `public/fonts/GoogleSansFlex-Regular.ttf` — the project's own font, not canvas-design fonts
- **Foreground tokens (light theme)**:
  - default `(23, 23, 23)` — hsl 0 0% 9%
  - light   `(82, 82, 82)` — hsl 0 0% 32%
  - lighter `(112, 112, 112)` — hsl 0 0% 44%
- **Border radius**: 4px minimum (`--radius-sm`) for UI elements
- **Real UI**: use a cropped region of `public/screenshots/calens-1280-800.png` rather than abstract shapes

## Environment

PIL (Pillow) is installed for `python3.12`:
```bash
python3.12 /tmp/gen_promo.py
```

If PIL is missing: `python3.12 -m pip install --break-system-packages Pillow`

**Variable font weight caveat**: PIL loads `GoogleSansFlex-Regular.ttf` at its default weight (400).
`set_variation_by_axes()` returns `invalid argument` for this file.
To simulate weight ~600, use `stroke_width=1, stroke_fill=<same color>` in the `text()` call.

## Layout for 440×280

```
+--[left 45%]----------+--[right 55%]--------------------+
| icon  "Chrome Ext."  |                                  |
|                      |   [cropped screenshot card]      |
| Calens               |   shadow + 1px border            |
| ────────────         |   fade into white on both edges  |
| See your time        |                                  |
| clearly.             |                                  |
| Analytics · ...      |                                  |
+----------------------+----------------------------------+
```

## Screenshot crop coordinates (1280×800 source)

The Calens sidebar panel (Calendar Progress + Activity Lens) lives at approximately:
- `x: 874–1276, y: 125–490` — Calendar Progress widget + top of Activity Lens

Adjust y-range if a different section is desired. Always verify by saving an intermediate
crop and reading it before compositing.

## Generation script template

```python
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

GSANS      = "public/fonts/GoogleSansFlex-Regular.ttf"
ICON_128   = "public/icons/icon128.png"
SCREENSHOT = "public/screenshots/calens-1280-800.png"
OUT        = "store-assets/calens-promo-440x280.png"

W, H = 440, 280

BG         = (255, 255, 255)
BRAND      = (0, 98, 168)          # #0062a8 from tokens.css --brand-default
FG_DEFAULT = (23, 23, 23)
FG_LIGHT   = (82, 82, 82)
FG_LIGHTER = (112, 112, 112)
BORDER     = (228, 228, 228)

def rrect(draw, xy, r, fill):
    x0, y0, x1, y1 = xy
    if x1-x0 < 2*r or y1-y0 < 2*r:
        draw.rectangle(xy, fill=fill); return
    draw.rectangle([x0+r, y0, x1-r, y1], fill=fill)
    draw.rectangle([x0, y0+r, x1, y1-r], fill=fill)
    for cx, cy in [(x0,y0),(x1-2*r,y0),(x0,y1-2*r),(x1-2*r,y1-2*r)]:
        draw.ellipse([cx, cy, cx+2*r, cy+2*r], fill=fill)

# 1. Crop panel from screenshot
src        = Image.open(SCREENSHOT)
panel_crop = src.crop((874, 125, 1276, 490))
TARGET_W   = 224
panel      = panel_crop.resize((TARGET_W, int(panel_crop.height * TARGET_W / panel_crop.width)), Image.LANCZOS)

# 2. White canvas
img = Image.new('RGB', (W, H), BG)
# optional: subtle grid texture
d = ImageDraw.Draw(img)
for x in range(0, W, 28): d.line([(x,0),(x,H)], fill=(246,247,248))
for y in range(0, H, 28): d.line([(0,y),(W,y)], fill=(246,247,248))

# 3. Card shadow + paste panel
CARD_X, CARD_Y = W - TARGET_W - 10, (H - min(panel.height, H-16)) // 2
visible_h = min(panel.height, H - 16)
shadow = Image.new('RGBA', (W, H), (0,0,0,0))
ImageDraw.Draw(shadow).rectangle([CARD_X+3, CARD_Y+4, CARD_X+TARGET_W+3, CARD_Y+visible_h+4], fill=(0,0,0,28))
shadow = shadow.filter(ImageFilter.GaussianBlur(7))
img = Image.alpha_composite(img.convert('RGBA'), shadow).convert('RGB')
ImageDraw.Draw(img).rectangle([CARD_X-1, CARD_Y-1, CARD_X+TARGET_W, CARD_Y+visible_h], outline=BORDER, width=1)
img.paste(panel.crop((0, 0, TARGET_W, visible_h)), (CARD_X, CARD_Y))

# 4. Fades (right edge + left→right blend)
for img, coords, color in [
    (lambda: None, None, None),  # placeholder — copy fade loop from reference script
]: pass
# See /tmp/gen_calens_promo_v6.py for full fade implementation

# 5. Typography
d3 = ImageDraw.Draw(img)
f_title = ImageFont.truetype(GSANS, 52)
f_tag   = ImageFont.truetype(GSANS, 13)
f_micro = ImageFont.truetype(GSANS, 10)

icon = Image.open(ICON_128).convert('RGBA').resize((26, 26), Image.LANCZOS)
img.paste(icon, (24, 26), icon)
d3.text((56, 32),  "Chrome Extension",        fill=FG_LIGHTER, font=f_micro)
d3.text((24, 63),  "Calens",                  fill=FG_DEFAULT, font=f_title)
d3.rectangle([24, 128, 152, 130],                              fill=BRAND)
d3.text((24, 138), "See your time clearly.",  fill=FG_LIGHT,   font=f_tag)
d3.text((24, 158), "Analytics · Editing · Privacy", fill=FG_LIGHTER, font=f_micro)

img.save(OUT, optimize=True)
```

## Producing the 920×680 large tile

Same technique, scale everything by 920/440 ≈ 2.09×.
Use a larger panel crop (extend y range) and larger font sizes (title ~108px).
Output to `store-assets/calens-promo-920x680.png`.

## Reference output

Working generated file: `store-assets/calens-promo-440x280.png`
The full working script is preserved at `/tmp/gen_calens_promo_v6.py` (session-local, will not persist).
