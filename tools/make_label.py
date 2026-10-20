#!/usr/bin/env python3
"""Texture d'étiquette de chandelle romaine — version « bannière » puis rotation.

Le texte doit se lire LE LONG de l'axe du tube (comme sur les vrais produits).
On dessine donc une bannière où x = axe du tube (mm) et y = autour du tube (mm),
puis on la transforme en texture (u autour, v axe) :
    T_img[p, q] = B[q, Wb-1-p]   <=>   T = B[:, ::-1].T
Ainsi v=0 (bas de l'image) = bas du tube, et le texte reste horizontal lisible.

Échelle isotrope : S px/mm dans les deux directions (pas de déformation une fois
enroulée). 2 panneaux identiques par tour (nom visible sur les deux faces).
"""
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

random.seed(20261020)

S = 10                      # px/mm
LBL_AROUND = 66.0           # mm — circonférence (2π·10.5)
LBL_AXIS = 398.0            # mm — longueur habillée du tube
NB_PANELS = 2

WB = int(LBL_AXIS * S)      # largeur bannière = axe (x)
HB = int(LBL_AROUND * S)    # hauteur bannière = autour (y) — 2 panneaux
PANEL = HB // NB_PANELS

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
F_BOLD = f"{FONT_DIR}/DejaVuSans-Bold.ttf"
F_SANS = f"{FONT_DIR}/DejaVuSans.ttf"

RED = (188, 22, 42)
RED_DEEP = (132, 12, 32)
RED_LIGHT = (222, 48, 68)
RED_DARK = (112, 10, 26)
GOLD = (214, 160, 52)
GOLD_LIGHT = (240, 204, 118)
GOLD_DEEP = (186, 130, 32)
CREAM = (248, 242, 231)
NAVY = (26, 38, 86)
WHITE = (252, 250, 246)


def font(path, mm):
    return ImageFont.truetype(path, int(mm * S))


def text_at(d, x, y, txt, f, fill, anchor="lm", outline=None, ow=2):
    """Texte positionné sur la bannière (x = le long de l'axe, y = autour)."""
    d.text((x, y), txt, font=f, fill=fill, anchor=anchor,
           stroke_width=ow if outline else 0, stroke_fill=outline)


def text_size(d, txt, f):
    bb = d.textbbox((0, 0), txt, font=f)
    return bb[2] - bb[0], bb[3] - bb[1]


def center_x(d, x0, x1, txt, f):
    w, _ = text_size(d, txt, f)
    return (x0 + x1 - w) / 2


def star_burst(d, cx, cy, r_mm, color, rays=14, w_mm=0.5, inner=0.3, seed=0):
    rnd = random.Random(seed)
    r = r_mm * S
    for i in range(rays):
        a = 2 * math.pi * i / rays + rnd.uniform(-0.08, 0.08)
        r0 = r * inner * rnd.uniform(0.65, 1.1)
        r1 = r * rnd.uniform(0.6, 1.0)
        d.line([(cx + r0 * math.cos(a), cy + r0 * math.sin(a)),
                (cx + r1 * math.cos(a), cy + r1 * math.sin(a))],
               fill=color, width=max(1, int(w_mm * S)))
    d.ellipse([cx - r * 0.13, cy - r * 0.13, cx + r * 0.13, cy + r * 0.13], fill=color)


def comet(d, cx, cy, size_mm, color, tail, angle_deg=0):
    """Comète : boule + traînée fuselée (angle 0 = traînée vers -x)."""
    a = math.radians(angle_deg)
    size = size_mm * S
    steps = 22
    for i in range(steps, 0, -1):
        t = i / steps
        w = size * 0.20 * (1 - t) + 0.6
        x = cx - math.cos(a) * size * 2.4 * t
        y = cy - math.sin(a) * size * 2.4 * t
        k = 0.30 + 0.70 * (1 - t)
        c = tuple(int(tail[j] * k + 18 * (1 - k)) for j in range(3))
        d.ellipse([x - w, y - w, x + w, y + w], fill=c)
    d.ellipse([cx - size * 0.5, cy - size * 0.5, cx + size * 0.5, cy + size * 0.5], fill=color)
    d.ellipse([cx - size * 0.26, cy - size * 0.26, cx + size * 0.26, cy + size * 0.26],
              fill=(255, 242, 208))


def diag_stripes(img, x0, y0, x1, y1, band_mm, c1, c2, shift_mm=26):
    """Rayures candy en diagonale : le motif glisse de shift_mm sur l'axe
    pour un demi-tour (33 mm autour) -> spirale visible comme sur les vrais
    produits. shift ≈ band donne des anneaux, shift ≈ 33 donne du 45°."""
    rect = Image.new("RGB", (x1 - x0, y1 - y0), c1)
    d = ImageDraw.Draw(rect)
    w, h = rect.size
    band = band_mm * S
    dx = int(shift_mm * S)
    x = -abs(dx) - band * 2
    while x < w + band + abs(dx):
        d.polygon([(x, 0), (x + band, 0), (x + band + dx, h), (x + dx, h)], fill=c2)
        x += band * 2
    img.paste(rect, (x0, y0))


def mmx(mm):
    return int(mm * S)


def mmy(mm, panel):
    return int(mm * S) + panel


def draw_panel(b, d, panel_y):
    """Un demi-tour de l'étiquette. panel_y = décalage y du panneau (px)."""
    py = panel_y          # haut du panneau (y autour = 0 du demi-tour)
    pmm = 33.0            # 33 mm autour par demi-tour

    # ---------- fond rouge ----------
    for x in range(0, WB, 4):
        t = x / WB
        col = tuple(max(0, min(255, int(RED[i] * (0.92 + 0.16 * (1 - abs(t - 0.5) * 1.7)))))
                    for i in range(3))
        d.rectangle([x, py, x + 4, py + PANEL], fill=col)

    # ---------- bandes or aux extrémités ----------
    d.rectangle([0, py, mmx(10), py + PANEL], fill=GOLD)
    d.rectangle([mmx(10), py, mmx(11.5), py + PANEL], fill=RED_DARK)
    d.rectangle([mmx(LBL_AXIS - 9), py, WB, py + PANEL], fill=GOLD)
    d.rectangle([mmx(LBL_AXIS - 11), py, mmx(LBL_AXIS - 9), py + PANEL], fill=RED_DARK)

    # bande basse : lot / marque
    f_micro = font(F_BOLD, 1.6)
    text_at(d, mmx(0.6), py + PANEL * 0.5, "LOT F1-26", f_micro, RED_DEEP, "lm")

    # ---------- rayures diagonales haut/bas ----------
    diag_stripes(b, mmx(11.5), py, mmx(28), py + PANEL, 3.4, CREAM, RED, shift_mm=14)
    diag_stripes(b, mmx(LBL_AXIS - 28), py, mmx(LBL_AXIS - 11), py + PANEL, 3.4, CREAM, RED, shift_mm=14)
    d.rectangle([mmx(28), py, mmx(30), py + PANEL], fill=GOLD)
    d.rectangle([mmx(LBL_AXIS - 30), py, mmx(LBL_AXIS - 28), py + PANEL], fill=GOLD)

    # ---------- champs rouges ----------
    f_run = font(F_BOLD, 2.1)
    run = ("⚠ NE PAS TENIR À LA MAIN — PLACER SUR UN SOL PLAN — "
           "SÉCURITÉ 8 m — DANGER FEU D'ARTIFICE F1 ⚠ ROMAN CANDLE · ")
    # bande de texte courant en haut du demi-tour
    text_at(d, mmx(32), py + 1.6, run * 3, f_run, (250, 168, 148), "lt")
    # et en bas du demi-tour
    text_at(d, mmx(32), py + PANEL - 1.6, run * 3, f_run, (250, 168, 148), "ls")

    # liserés or autour du bloc titre
    d.rectangle([mmx(30), py + 3.2, mmx(LBL_AXIS - 30), py + 4.2], fill=GOLD_DEEP)
    d.rectangle([mmx(30), py + PANEL - 4.2, mmx(LBL_AXIS - 30), py + PANEL - 3.2], fill=GOLD_DEEP)

    # motifs filigrane (étoiles + comètes) derrière le titre
    for i, x in enumerate((40, 110, 185, 255, 318)):
        star_burst(d, mmx(x), py + PANEL * 0.26, 3.1, (222, 92, 88), rays=14, w_mm=0.45, seed=i)
    for i, x in enumerate((60, 140, 225, 300)):
        star_burst(d, mmx(x), py + PANEL * 0.74, 2.7, (222, 92, 88), rays=12, w_mm=0.45, seed=10 + i)
    comet(d, mmx(66), py + PANEL * 0.50, 2.1, GOLD_LIGHT, GOLD, -24)
    comet(d, mmx(LBL_AXIS - 58), py + PANEL * 0.52, 1.9, GOLD_LIGHT, GOLD, 206)

    # ---------- bloc titre principal (le long de l'axe) ----------
    cy = py + PANEL * 0.42
    f_brand = font(F_BOLD, 3.0)
    f_title = font(F_BOLD, 11.0)
    f_sub = font(F_SANS, 3.2)
    f_rib = font(F_BOLD, 3.8)

    text_at(d, mmx(34), cy, "★ LA STELLAIRE ★", f_brand, GOLD_LIGHT, "lm",
            outline=RED_DEEP, ow=1)
    d.line([(mmx(70), cy), (mmx(78), cy)], fill=GOLD, width=int(0.6 * S))

    t1 = "CHANDELLE ROMAINE"
    x1 = mmx(82)
    text_at(d, x1, cy, t1, f_title, CREAM, "lm", outline=RED_DEEP, ow=3)
    text_at(d, x1 + int(0.35 * S), cy + int(0.35 * S), t1, f_title, (255, 200, 90), "lm",
            outline=None)  # ombre dorée décalée
    text_at(d, x1, cy, t1, f_title, CREAM, "lm", outline=RED_DEEP, ow=3)

    w_t, _ = text_size(d, t1, f_title)
    x2 = x1 + w_t + mmx(6)
    # ruban or « 10 ÉTOILES »
    rib = "10 ÉTOILES · CAL. 20 mm"
    w_rib, h_rib = text_size(d, rib, f_rib)
    d.rounded_rectangle([x2 - mmx(1.5), cy - h_rib * 0.78 - mmx(1.2),
                         x2 + w_rib + mmx(1.5), cy + h_rib * 0.78 + mmx(1.2)],
                        radius=mmx(1.2), fill=NAVY, outline=GOLD, width=max(1, int(0.45 * S)))
    text_at(d, x2, cy, rib, f_rib, GOLD_LIGHT, "lm")

    # sous-titre / effets
    cy2 = py + PANEL * 0.66
    t2 = "COMÈTES COLORÉES · EFFET SIFFLEUR · 10 COUPS"
    text_at(d, mmx(34), cy2, "→", f_sub, GOLD_LIGHT, "lm")
    text_at(d, mmx(42), cy2, t2, f_sub, CREAM, "lm", outline=RED_DEEP, ow=1)

    cy3 = py + PANEL * 0.80
    t3 = "ROMAN CANDLE — SHOOTS GOLDEN COMETS — MADE FOR NIGHT SKIES"
    text_at(d, mmx(42), cy3, t3, font(F_SANS, 2.6), (255, 214, 180), "lm")

    # code-barres compact
    bx, by = mmx(238), cy3 - mmx(2.2)
    d.rectangle([bx, by, bx + mmx(15), by + mmx(4.4)], fill=WHITE)
    rnd = random.Random(7)
    xx = bx + mmx(0.5)
    while xx < bx + mmx(14.5):
        w = rnd.choice([2, 2, 3, 5, 7])
        d.rectangle([xx, by + mmx(0.4), xx + w, by + mmx(3.2)], fill=(20, 20, 20))
        xx += w + rnd.choice([2, 3, 5])

    # ---------- mention point d'allumage (dans le champ, flèche vers le haut) ----------
    f_all = font(F_BOLD, 3.0)
    text_at(d, mmx(318), cy - mmx(1.8), "POINT", f_all, CREAM, "lm", outline=RED_DEEP, ow=2)
    text_at(d, mmx(318), cy + mmx(1.8), "D'ALLUMAGE", font(F_BOLD, 2.5), GOLD_LIGHT, "lm",
            outline=RED_DEEP, ow=1)
    d.line([(mmx(346), cy + mmx(3.0)), (mmx(346), cy - mmx(3.2))], fill=CREAM, width=int(0.55 * S))
    d.polygon([(mmx(346), cy - mmx(5.0)), (mmx(344), cy - mmx(2.6)), (mmx(348), cy - mmx(2.6))],
              fill=CREAM)

    # décor de la bande rouge haute (sous le bourrelet)
    star_burst(d, mmx(LBL_AXIS - 20), py + PANEL * 0.30, 1.9, GOLD_LIGHT, rays=12, w_mm=0.4, seed=3)
    star_burst(d, mmx(LBL_AXIS - 22), py + PANEL * 0.74, 1.5, GOLD_LIGHT, rays=10, w_mm=0.35, seed=4)
    comet(d, mmx(LBL_AXIS - 34), py + PANEL * 0.5, 1.2, (255, 220, 150), GOLD, 168)

    # mini flèches vers le haut, uniquement dans la bande or du haut
    for ax in range(int(LBL_AXIS - 7), int(LBL_AXIS - 2), 6):
        d.polygon([(mmx(ax), py + PANEL * 0.38), (mmx(ax - 1.1), py + PANEL * 0.56),
                   (mmx(ax + 1.1), py + PANEL * 0.56)], fill=RED_DEEP)


def main():
    b = Image.new("RGB", (WB, HB), RED)
    d = ImageDraw.Draw(b)
    draw_panel(b, d, 0)
    draw_panel(b, d, PANEL)

    # ---- transformation bannière -> texture (u autour, v axe) ----
    arr = np.asarray(b)
    # Orientation validée empiriquement (tests /tmp/render_orient.py) :
    # transpose simple -> lettres lisibles, non en miroir sur le tube.
    T = np.transpose(arr, (1, 0, 2))   # T[u, v] ; v=0 en bas du tube
    img = Image.fromarray(T)

    # couture du papier (u=0) + grain d'impression
    d2 = ImageDraw.Draw(img)
    d2.line([(1, 0), (1, img.height)], fill=(120, 12, 28), width=2)
    d2.line([(img.width - 2, 0), (img.width - 2, img.height)], fill=(120, 12, 28), width=2)

    noise = Image.effect_noise(img.size, 14).convert("L")
    noise = noise.filter(ImageFilter.GaussianBlur(0.5))
    img = Image.composite(img.point(lambda p: min(255, int(p * 1.05))),
                          img.point(lambda p: int(p * 0.95)), noise)
    img = img.filter(ImageFilter.GaussianBlur(0.35))

    img.save("assets/label.png")
    print("assets/label.png", img.size)


if __name__ == "__main__":
    main()
