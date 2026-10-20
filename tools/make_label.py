#!/usr/bin/env python3
"""Étiquette graphique inspirée de la photo produit de référence.

Le tube photographié est un modèle étroit, imprimé de motifs pyrotechniques
multicolores sur un fond bleu nuit/vert sombre, avec un marquage jaune et rouge
près du capuchon bleu. Pas de gros titre rouge fictif.

La bannière est dessinée avec x le long du tube et y autour du tube, puis
transposée vers la texture Three.js (u autour, v bas -> haut).
"""
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

random.seed(20261020)
S = 10
LENGTH_MM = 398.0
AROUND_MM = 53.5            # circonférence pour tube Ø ~17 mm
PANELS = 2
W = int(LENGTH_MM * S)
H = int(AROUND_MM * S)
PH = H // PANELS
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
FONT = f"{FONT_DIR}/DejaVuSans-Bold.ttf"

NAVY = (8, 20, 43)
BLUE = (12, 43, 76)
TEAL = (13, 67, 69)
YELLOW = (246, 203, 35)
RED = (206, 35, 42)
WHITE = (235, 239, 222)
CYAN = (38, 191, 218)
LIME = (162, 207, 52)
ORANGE = (250, 113, 36)
MAGENTA = (221, 64, 143)


def mm(v):
    return int(round(v * S))


def starburst(draw, x, y, radius, color, rays=12, seed=0):
    rng = random.Random(seed)
    for i in range(rays):
        a = 2 * math.pi * i / rays + rng.uniform(-0.12, 0.12)
        r0 = radius * rng.uniform(0.10, 0.28)
        r1 = radius * rng.uniform(0.58, 1.0)
        width = rng.choice([1, 2, 3, 4])
        draw.line((x + math.cos(a)*r0, y + math.sin(a)*r0,
                   x + math.cos(a)*r1, y + math.sin(a)*r1), fill=color, width=width)
    draw.ellipse((x-radius*.10, y-radius*.10, x+radius*.10, y+radius*.10), fill=WHITE)
    # petites étoiles ponctuant chaque éclat
    for _ in range(8):
        a = rng.random() * 2 * math.pi
        r = radius * rng.uniform(.25, 1.25)
        sx, sy = x + math.cos(a)*r, y + math.sin(a)*r
        rr = rng.choice([1, 2, 3])
        draw.ellipse((sx-rr, sy-rr, sx+rr, sy+rr), fill=color)


def paint_panel(img, draw, y0):
    # Impression nuit bleue/verte en dégradé irrégulier.
    for x in range(W):
        t = x / W
        band = 0.5 + 0.5 * math.sin(t * math.pi * 8 + 0.5)
        col = tuple(int(NAVY[i]*(1-band*.34) + (TEAL if int(t*7)%2 else BLUE)[i]*band*.34) for i in range(3))
        draw.line((x, y0, x, y0+PH), fill=col)

    # Base colorée près du capuchon bleu : grand panneau jaune + bande rouge.
    draw.rectangle((0, y0, mm(47), y0+PH), fill=YELLOW)
    draw.rectangle((mm(47), y0, mm(61), y0+PH), fill=RED)
    draw.rectangle((mm(61), y0, mm(65), y0+PH), fill=(242, 232, 197))
    # Liserés fins sur le panneau jaune, évoquant l'impression sur emballage.
    draw.rectangle((mm(3), y0+mm(2), mm(43), y0+mm(2.8)), fill=(255, 239, 106))
    draw.rectangle((mm(3), y0+PH-mm(2.8), mm(43), y0+PH-mm(2)), fill=(190, 139, 20))
    f = ImageFont.truetype(FONT, mm(2.7))
    draw.text((mm(7), y0+PH*.50), "ROMAN CANDLE", font=f, fill=(75, 43, 20), anchor="mm")
    f2 = ImageFont.truetype(FONT, mm(1.6))
    draw.text((mm(29), y0+PH*.73), "FIREWORKS", font=f2, fill=(112, 53, 22), anchor="mm")

    # Champ principal : constellation de gerbes et d'étincelles multicolores.
    colors = [CYAN, LIME, ORANGE, WHITE, MAGENTA, YELLOW, (78, 139, 244), (255, 91, 72)]
    centers = [(83, .26), (112, .72), (145, .42), (177, .78), (211, .23),
               (244, .60), (278, .32), (310, .74), (346, .43), (376, .72)]
    for i, (ax, fy) in enumerate(centers):
        cx, cy = mm(ax), y0 + int(PH * fy)
        color = colors[i % len(colors)]
        starburst(draw, cx, cy, mm(5.5 if i % 3 else 7.5), color, 14 if i % 2 else 18, i+51)
        # petites traînées obliques aux gerbes, comme des étoiles filantes imprimées
        if i % 2 == 0:
            for j in range(4):
                sx = cx - mm(7 + j*1.7)
                sy = cy + mm(4 + j*0.7)
                draw.line((sx, sy, sx+mm(4+j), sy-mm(1.2+j*.35)), fill=colors[(i+j+2)%len(colors)], width=mm(.28))

    # Nervures/éclats ponctuels répartis sur tout le fond.
    rng = random.Random(624)
    for _ in range(155):
        x = rng.randint(mm(68), W-1)
        y = rng.randint(y0+mm(1), y0+PH-mm(1))
        c = rng.choice(colors)
        r = rng.choice([1, 2, 3, 4])
        draw.ellipse((x-r, y-r, x+r, y+r), fill=c)

    # Petite marque typographique intégrée au dessin, sans dominer la photo.
    fmark = ImageFont.truetype(FONT, mm(2.25))
    draw.text((mm(230), y0+PH*.5), "COMET", font=fmark, fill=(234, 241, 220), anchor="mm",
              stroke_width=1, stroke_fill=(9, 20, 36))

    # Fin de gaine sous le bourrelet, rouge très discret près de la mèche.
    draw.rectangle((mm(LENGTH_MM-5), y0, W, y0+PH), fill=(123, 26, 37))


def main():
    banner = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(banner)
    for p in range(PANELS):
        paint_panel(banner, d, p*PH)

    # Texture: hauteur = axe du tube, largeur = circonférence.
    tex = Image.fromarray(np.transpose(np.asarray(banner), (1, 0, 2)))
    tex = tex.filter(ImageFilter.GaussianBlur(.18))
    tex.save("assets/label.png")
    print("assets/label.png", tex.size)


if __name__ == "__main__":
    main()
