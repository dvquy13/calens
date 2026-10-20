from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT       = Path(__file__).resolve().parents[1]  # store-assets/ -> repo root
GSANS      = str(ROOT / "public/fonts/GoogleSansFlex-Regular.ttf")
ICON_128   = str(ROOT / "public/icons/icon128.png")
SCREENSHOT = str(ROOT / "public/screenshots/calens-screenshot.png")
OUT        = str(ROOT / "store-assets/calens-promo-1400x560.png")

W, H = 1400, 560

BG          = (255, 255, 255)
BRAND       = (0,   98,  168)
FG_DEFAULT  = (23,  23,  23)
FG_LIGHT    = (82,  82,  82)
FG_LIGHTER  = (112, 112, 112)
BORDER      = (228, 228, 228)

# ── Load and scale panels ─────────────────────────────────────────────────────
src = Image.open(SCREENSHOT)

# Both cards the same width for visual symmetry
CARD_W = 390
CARD_Y = 40          # same top alignment for both
CARD_GAP = 24
CARD1_X = 480

# Card 1: full Calendar Progress (all bars + total)
crop1  = src.crop((1048, 48, 1492, 430))    # 444×382
panel1 = crop1.resize((CARD_W, int(crop1.height * CARD_W / crop1.width)), Image.LANCZOS)
vis1_h = min(panel1.height, H - CARD_Y - 16)

# Card 2: full Activity Lens (dot matrix + bar charts, footer trimmed)
crop2  = src.crop((1048, 415, 1492, 870))   # 444×455
panel2 = crop2.resize((CARD_W, int(crop2.height * CARD_W / crop2.width)), Image.LANCZOS)
CARD2_X = CARD1_X + CARD_W + CARD_GAP
vis2_h  = min(panel2.height, H - CARD_Y - 16)

# ── Base canvas ───────────────────────────────────────────────────────────────
img = Image.new('RGB', (W, H), BG)
d   = ImageDraw.Draw(img)

for x in range(0, W, 56):
    d.line([(x, 0), (x, H)], fill=(246, 247, 248))
for y in range(0, H, 56):
    d.line([(0, y), (W, y)], fill=(246, 247, 248))

# ── Helper: draw one card (shadow → border → paste) ──────────────────────────
def draw_card(base, panel, cx, cy, cw, ch):
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle(
        [cx + 4, cy + 6, cx + cw + 4, cy + ch + 6],
        fill=(0, 0, 0, 25)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    base = Image.alpha_composite(base.convert('RGBA'), shadow).convert('RGB')
    ImageDraw.Draw(base).rectangle(
        [cx - 1, cy - 1, cx + cw, cy + ch],
        outline=BORDER, width=1
    )
    base.paste(panel.crop((0, 0, cw, ch)), (cx, cy))
    return base

img = draw_card(img, panel1, CARD1_X, CARD_Y, CARD_W, vis1_h)
img = draw_card(img, panel2, CARD2_X, CARD_Y, CARD_W, vis2_h)

# ── Fades ─────────────────────────────────────────────────────────────────────
# Right edge fade
fade_r = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for x in range(50):
    a = int(255 * (x / 50) ** 1.5)
    ImageDraw.Draw(fade_r).line([(W - 1 - x, 0), (W - 1 - x, H)], fill=(*BG, a))
img = Image.alpha_composite(img.convert('RGBA'), fade_r).convert('RGB')

# Left→right fade: white text zone blends cleanly into card 1 edge
fade_lr = Image.new('RGBA', (W, H), (0, 0, 0, 0))
FADE_ST = 370
FADE_EN = CARD1_X - 4
for x in range(FADE_ST, FADE_EN):
    t = (x - FADE_ST) / (FADE_EN - FADE_ST)
    a = int(255 * t)
    ImageDraw.Draw(fade_lr).line([(x, 0), (x, H)], fill=(*BG, a))
img = Image.alpha_composite(img.convert('RGBA'), fade_lr).convert('RGB')

# Top/bottom vignettes
dv = ImageDraw.Draw(img)
for y in range(32):
    dv.line([(0, y), (W, y)], fill=(255, 255, 255, int(80 * (1 - y / 32))))
for y in range(32):
    dv.line([(0, H - 1 - y), (W, H - 1 - y)], fill=(255, 255, 255, int(80 * (1 - y / 32))))

# ── Typography ────────────────────────────────────────────────────────────────
d3 = ImageDraw.Draw(img)
f_title = ImageFont.truetype(GSANS, 96)
f_tag   = ImageFont.truetype(GSANS, 24)
f_label = ImageFont.truetype(GSANS, 18)

try:
    icon = Image.open(ICON_128).convert('RGBA').resize((40, 40), Image.LANCZOS)
    img.paste(icon, (48, 52), icon)
    d3 = ImageDraw.Draw(img)
    d3.text((98, 62), "Chrome Extension", fill=FG_LIGHTER, font=f_label)
except Exception as e:
    print(f"icon: {e}")

d3 = ImageDraw.Draw(img)
d3.text((48, 118), "Calens", fill=FG_DEFAULT, font=f_title,
        stroke_width=1, stroke_fill=FG_DEFAULT)
d3.rectangle([48, 244, 320, 248], fill=BRAND)
d3.text((48, 258), "See your time clearly.", fill=FG_LIGHT, font=f_tag)
d3.text((48, 298), "Analytics  ·  Editing  ·  Privacy", fill=FG_LIGHTER, font=f_label)

img.save(OUT, optimize=True)
print(f"Saved → {OUT}")
