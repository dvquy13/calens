from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
from pathlib import Path

ROOT       = Path(__file__).resolve().parents[3]  # .claude/skills/cws-promo-tile/ -> repo root
GSANS      = str(ROOT / "public/fonts/GoogleSansFlex-Regular.ttf")
ICON_128   = str(ROOT / "public/icons/icon128.png")
SCREENSHOT = str(ROOT / "public/screenshots/calens-1280-800.png")

W, H = 440, 280

# Design system — light theme
BG          = (255, 255, 255)
BRAND       = (0,   98,  168)   # #0062a8
FG_DEFAULT  = (23,  23,  23)    # hsl 0 0% 9%
FG_LIGHT    = (82,  82,  82)    # hsl 0 0% 32%
FG_LIGHTER  = (112, 112, 112)   # hsl 0 0% 44%
BORDER      = (228, 228, 228)   # border-default

# ── Crop the Calens panel ─────────────────────────────────────────────────────
# Debug crop confirmed panel content starts at x≈874 in 1280px screenshot.
# We want: Calendar Progress section + top of Activity Lens (through filter bar).
src = Image.open(SCREENSHOT)
panel_crop = src.crop((874, 125, 1276, 490))  # 402 × 365 px

# Scale to 220px wide to fit right side of 440px tile
TARGET_W = 224
scale    = TARGET_W / panel_crop.width
panel_h  = int(panel_crop.height * scale)
panel    = panel_crop.resize((TARGET_W, panel_h), Image.LANCZOS)

# ── Base canvas ───────────────────────────────────────────────────────────────
img = Image.new('RGB', (W, H), BG)
d   = ImageDraw.Draw(img)

# Very subtle grid texture (matches landing page section pattern)
for x in range(0, W, 28):
    d.line([(x, 0), (x, H)], fill=(246, 247, 248))
for y in range(0, H, 28):
    d.line([(0, y), (W, y)], fill=(246, 247, 248))

# ── Card placement ────────────────────────────────────────────────────────────
CARD_X = W - TARGET_W - 10           # 206px from left, 10px right margin
CARD_Y = (H - min(panel_h, H - 16)) // 2  # vertically centered
visible_h = min(panel_h, H - 16)
panel_clipped = panel.crop((0, 0, TARGET_W, visible_h))

# Shadow layer
shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rectangle(
    [CARD_X + 3, CARD_Y + 4, CARD_X + TARGET_W + 3, CARD_Y + visible_h + 4],
    fill=(0, 0, 0, 28)
)
shadow = shadow.filter(ImageFilter.GaussianBlur(7))
img    = Image.alpha_composite(img.convert('RGBA'), shadow).convert('RGB')

# Card border
ImageDraw.Draw(img).rectangle(
    [CARD_X - 1, CARD_Y - 1, CARD_X + TARGET_W, CARD_Y + visible_h],
    outline=BORDER, width=1
)

# Paste panel
img.paste(panel_clipped, (CARD_X, CARD_Y))

# ── Fades ─────────────────────────────────────────────────────────────────────
# Right edge fade (card → white right margin)
fade = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for x in range(20):
    a = int(255 * (x / 20) ** 1.5)
    ImageDraw.Draw(fade).line([(W-1-x, 0), (W-1-x, H)], fill=(*BG, a))
img = Image.alpha_composite(img.convert('RGBA'), fade).convert('RGB')

# Left→right fade to blend panel into white (text zone stays clean white)
fade2 = Image.new('RGBA', (W, H), (0, 0, 0, 0))
FADE_ST = 185
FADE_EN = CARD_X + 28
for x in range(FADE_ST, FADE_EN):
    t = (x - FADE_ST) / (FADE_EN - FADE_ST)
    a = int(255 * t ** 1.0)
    ImageDraw.Draw(fade2).line([(x, 0), (x, H)], fill=(*BG, a))
img = Image.alpha_composite(img.convert('RGBA'), fade2).convert('RGB')

# Top/bottom vignettes (very subtle — just softens edge)
dv = ImageDraw.Draw(img)
for y in range(18):
    dv.line([(0,y),(W,y)], fill=(255,255,255,int(80*(1-y/18))))
for y in range(18):
    dv.line([(0,H-1-y),(W,H-1-y)], fill=(255,255,255,int(80*(1-y/18))))

# ── Typography ────────────────────────────────────────────────────────────────
d3 = ImageDraw.Draw(img)
f_title = ImageFont.truetype(GSANS, 52)
f_tag   = ImageFont.truetype(GSANS, 13)
f_micro = ImageFont.truetype(GSANS, 10)

# Icon + label
try:
    icon = Image.open(ICON_128).convert('RGBA').resize((26, 26), Image.LANCZOS)
    img.paste(icon, (24, 26), icon)
    d3.text((56, 32), "Chrome Extension", fill=FG_LIGHTER, font=f_micro)
except Exception as e:
    print(f"icon: {e}")

# Title
d3.text((24, 63), "Calens", fill=FG_DEFAULT, font=f_title)

# Accent rule — brand #0062a8
rule_y = 128
d3.rectangle([24, rule_y, 152, rule_y + 2], fill=BRAND)

# Tagline
d3.text((24, 138), "See your time clearly.", fill=FG_LIGHT, font=f_tag)

# Sub
d3.text((24, 158), "Analytics  ·  Editing  ·  Privacy", fill=FG_LIGHTER, font=f_micro)

img.save("/tmp/calens-promo-440x280.png", optimize=True)
print("Saved")
