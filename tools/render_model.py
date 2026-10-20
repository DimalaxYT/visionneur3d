#!/usr/bin/env python3
"""Mini raytracer numpy — rendu de contrôle du modèle 3D de la chandelle romaine.

Même géométrie / mêmes textures que le viewer Three.js (js/candle.js) afin que
les auto-critiques visuelles soient valables pour le livrable web.

Usage :
  .venv/bin/python tools/render_model.py            # rendu hero + détails
  .venv/bin/python tools/render_model.py v3         # suffixe de nom de fichier
"""
import math
import sys

import numpy as np
from PIL import Image

# ----------------------------------------------------------------------------
# Paramètres du modèle (en mètres) — À SYNCHRONISER avec js/candle.js
# ----------------------------------------------------------------------------
L_LABEL = 0.398         # longueur habillée (texture)
R_TUBE = 0.0105         # rayon extérieur
R_RIM = 0.0113          # rayon du bourrelet supérieur (carton nu)
R_BORE = 0.0070         # rayon intérieur (alésage)
Y0 = 0.012              # bas du tube habillé
Y1 = Y0 + L_LABEL       # haut de l'étiquette = pied du bourrelet
H_RIM = 0.010           # hauteur du bourrelet
Y_TOP = Y1 + H_RIM      # bouche du tube
R_CAP = 0.0109          # rayon du capuchon bas

MAT_PAPER = {"spec": 0.18, "shin": 26.0}
MAT_KRAFT = {"spec": 0.12, "shin": 18.0}
MAT_PLASTIC = {"spec": 0.55, "shin": 90.0}
MAT_FUSE = {"spec": 0.35, "shin": 40.0}
MAT_GROUND = {"spec": 0.06, "shin": 12.0}
MAT_BORE = {"spec": 0.04, "shin": 8.0}

LABEL_PATH = "assets/label.png"


def normalize(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-9)


# ----------------------------------------------------------------------------
# Chargement texture
# ----------------------------------------------------------------------------
LABEL = None
LABEL_ARR = None


def load_label():
    global LABEL, LABEL_ARR
    LABEL = Image.open(LABEL_PATH).convert("RGB")
    LABEL_ARR = np.asarray(LABEL).astype(np.float32) / 255.0


def sample_label(u, v):
    """u,v dans [0,1] -> rgb. u autour du tube, v bas->haut."""
    h, w = LABEL_ARR.shape[:2]
    x = np.mod(u, 1.0) * (w - 1)
    y = (1.0 - np.mod(v, 1.0)) * (h - 1)   # flipY : v=0 en bas de l'image
    x0 = np.clip(x.astype(np.int32), 0, w - 2)
    y0 = np.clip(y.astype(np.int32), 0, h - 2)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    c00 = LABEL_ARR[y0, x0]
    c10 = LABEL_ARR[y0, x0 + 1]
    c01 = LABEL_ARR[y0 + 1, x0]
    c11 = LABEL_ARR[y0 + 1, x0 + 1]
    return (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy


# ----------------------------------------------------------------------------
# Intersections vectorisées
# ----------------------------------------------------------------------------
def intersect_y_cylinders(o, d, cyls):
    """cyls : liste de dict(rayon, y0, y1, mat, kind, tex)."""
    best_t = np.full(o.shape[:-1], np.inf)
    best_n = np.zeros_like(o)
    best_alb = np.zeros_like(o)
    best_mat = np.zeros(o.shape[:-1] + (2,))
    best_kind = np.zeros(o.shape[:-1], dtype=np.int32)

    ox, oy, oz = o[..., 0], o[..., 1], o[..., 2]
    dx, dy, dz = d[..., 0], d[..., 1], d[..., 2]

    for cyl in cyls:
        r = cyl["rayon"]
        # surface latérale : (ox+t dx)^2 + (oz+t dz)^2 = r^2
        a = dx * dx + dz * dz
        b = 2.0 * (ox * dx + oz * dz)
        c = ox * ox + oz * oz - r * r
        disc = b * b - 4 * a * c
        m = disc > 0
        sq = np.sqrt(np.maximum(disc, 0))
        for sign in (-1.0, 1.0):
            t = (-b + sign * sq) / (2 * a)
            hit = m & (t > 1e-4) & (t < best_t)
            px = ox + t * dx
            py = oy + t * dy
            pz = oz + t * dz
            hit &= (py >= cyl["y0"]) & (py <= cyl["y1"])
            if not np.any(hit):
                continue
            n = np.stack([px, np.zeros_like(py), pz], axis=-1) / r
            alb, mat, kind = cyl_shade(cyl, px, py, pz, n)
            best_t = np.where(hit, t, best_t)
            best_n = np.where(hit[..., None], n, best_n)
            best_alb = np.where(hit[..., None], alb, best_alb)
            best_mat = np.where(hit[..., None], mat, best_mat)
            best_kind = np.where(hit, kind, best_kind)

        # disques haut/bas (annulus si r_in)
        caps = cyl.get("caps", "both")
        r_in2 = cyl.get("r_in", 0.0) ** 2
        cap_list = []
        if caps in ("both", "bottom"):
            cap_list.append((cyl["y0"], np.array([0.0, -1.0, 0.0]), 2))
        if caps in ("both", "top"):
            cap_list.append((cyl["y1"], np.array([0.0, 1.0, 0.0]), 3))
        for ycap, nrm, cap_kind in cap_list:
            denom = dy
            t = (ycap - oy) / np.where(np.abs(denom) < 1e-9, 1e-9, denom)
            px = ox + t * dx
            pz = oz + t * dz
            rr2 = px * px + pz * pz
            hit = (t > 1e-4) & (t < best_t) & (rr2 <= r * r) & (rr2 >= r_in2)
            if not np.any(hit):
                continue
            py = np.full_like(px, ycap)
            n = np.broadcast_to(nrm, o.shape).copy()
            alb, mat, kind = cyl_shade(cyl, px, py, pz, n, force_kind=cap_kind)
            best_t = np.where(hit, t, best_t)
            best_n = np.where(hit[..., None], n, best_n)
            best_alb = np.where(hit[..., None], alb, best_alb)
            best_mat = np.where(hit[..., None], mat, best_mat)
            best_kind = np.where(hit, kind, best_kind)

    return best_t, best_n, best_alb, best_mat, best_kind


def cyl_shade(cyl, px, py, pz, n, force_kind=None):
    kind = cyl.get("kind", 0)
    if force_kind is not None:
        kind = force_kind
    mat = np.stack([np.full_like(px, cyl["mat"]["spec"]),
                    np.full_like(px, cyl["mat"]["shin"])], axis=-1)
    if cyl.get("tex"):
        u = np.arctan2(pz, px) / (2 * math.pi) + 0.5
        v = (py - cyl["y0"]) / (cyl["y1"] - cyl["y0"])
        alb = sample_label(u, v)
    else:
        col = np.asarray(cyl.get("couleur", (0.8, 0.8, 0.8)), dtype=np.float32)
        alb = np.broadcast_to(col, px.shape + (3,)).copy()
        if cyl.get("ring_pattern"):
            rr = np.sqrt(px * px + pz * pz)
            k = 0.90 + 0.13 * np.sin(rr * 1400.0) + 0.06 * np.sin(rr * 310.0)
            edge = np.clip((rr - 0.0092) / 0.0021, 0, 1) * 0.35   # tranche plus sombre
            alb = alb * (k * (1.0 - edge))[..., None]
    return alb, mat, np.full_like(px, kind, dtype=np.int32)


def intersect_spheres(o, d, spheres):
    best_t = np.full(o.shape[:-1], np.inf)
    best_n = np.zeros_like(o)
    best_alb = np.zeros_like(o)
    best_mat = np.zeros(o.shape[:-1] + (2,))
    best_kind = np.zeros(o.shape[:-1], dtype=np.int32)

    for sp in spheres:
        c = sp["centre"]
        r = sp["rayon"]
        oc = o - np.asarray(c)
        a = np.sum(d * d, axis=-1)
        b = 2.0 * np.sum(oc * d, axis=-1)
        cc = np.sum(oc * oc, axis=-1) - r * r
        disc = b * b - 4 * a * cc
        m = disc > 0
        sq = np.sqrt(np.maximum(disc, 0))
        for sign in (-1.0, 1.0):
            t = (-b + sign * sq) / (2 * a)
            hit = m & (t > 1e-4) & (t < best_t)
            if not np.any(hit):
                continue
            p = o + t[..., None] * d
            n = (p - np.asarray(c)) / r
            col = np.asarray(sp.get("couleur", (0.2, 0.5, 0.2)), dtype=np.float32)
            # rayures de tresse : teinte alternée par segment de mèche
            if sp.get("braid") is not None:
                band = 0.82 + 0.35 * (0.5 + 0.5 * math.sin(sp["braid"] * 26.0))
                alb = np.broadcast_to(col * band, p.shape).copy()
            else:
                alb = np.broadcast_to(col, p.shape).copy()
            mat = np.stack([np.full_like(t, sp["mat"]["spec"]),
                            np.full_like(t, sp["mat"]["shin"])], axis=-1)
            best_t = np.where(hit, t, best_t)
            best_n = np.where(hit[..., None], n, best_n)
            best_alb = np.where(hit[..., None], alb, best_alb)
            best_mat = np.where(hit[..., None], mat, best_mat)
            best_kind = np.where(hit, 4, best_kind)
    return best_t, best_n, best_alb, best_mat, best_kind


def intersect_ground(o, d, y=0.0):
    t = (y - o[..., 1]) / np.where(np.abs(d[..., 1]) < 1e-9, 1e-9, d[..., 1])
    hit = (t > 1e-4) & (d[..., 1] < 0)
    t = np.where(hit, t, np.inf)
    n = np.broadcast_to(np.array([0.0, 1.0, 0.0]), o.shape).copy()
    p = o + t[..., None] * d
    # damier studio très doux
    checker = ((np.floor(p[..., 0] * 6) + np.floor(p[..., 2] * 6)) % 2)
    base = 0.615 + 0.018 * checker
    alb = np.stack([base, base * 0.99, base * 0.97], axis=-1)
    mat = np.stack([np.full_like(t, MAT_GROUND["spec"]),
                    np.full_like(t, MAT_GROUND["shin"])], axis=-1)
    kind = np.where(hit, 5, 0).astype(np.int32)
    return t, n, alb, mat, kind


# ----------------------------------------------------------------------------
# Scène
# ----------------------------------------------------------------------------
def build_scene():
    kraft = (0.70, 0.545, 0.36)
    cyls = [
        # tube habillé (étiquette)
        {"rayon": R_TUBE, "y0": Y0, "y1": Y1, "mat": MAT_PAPER,
         "kind": 0, "tex": True},
        # bourrelet carton nu (latéral seul)
        {"rayon": R_RIM, "y0": Y1, "y1": Y_TOP, "mat": MAT_KRAFT,
         "kind": 1, "couleur": kraft, "caps": "none"},
        # couronne supérieure (disque annulaire, carton stratifié)
        {"rayon": R_RIM, "y0": Y_TOP, "y1": Y_TOP, "mat": MAT_KRAFT,
         "kind": 1, "couleur": kraft, "caps": "top", "r_in": R_BORE,
         "ring_pattern": True},
        # paroi intérieure de l'alésage
        {"rayon": R_BORE, "y0": Y_TOP - 0.030, "y1": Y_TOP, "mat": MAT_BORE,
         "kind": 3, "couleur": (0.30, 0.20, 0.12), "caps": "none"},
        # fond d'alésage (obscurci)
        {"rayon": R_BORE, "y0": Y_TOP - 0.030, "y1": Y_TOP - 0.030, "mat": MAT_BORE,
         "kind": 3, "couleur": (0.030, 0.018, 0.010), "caps": "top"},
        # capuchon bas plastique
        {"rayon": R_CAP, "y0": 0.0, "y1": Y0 + 0.001, "mat": MAT_PLASTIC,
         "kind": 2, "couleur": (0.62, 0.05, 0.08)},
    ]
    # mèche visco : cordon continu (sphères jointives) le long d'un bezier
    p0 = np.array([0.002, Y_TOP - 0.022, 0.002])
    p1 = np.array([0.010, Y_TOP + 0.024, 0.008])
    p2 = np.array([0.040, Y_TOP + 0.030, 0.016])
    p3 = np.array([0.062, Y_TOP + 0.002, 0.024])
    spheres = []
    nf = 72
    for i in range(nf):
        t = i / (nf - 1)
        b = ((1 - t) ** 3) * p0 + 3 * ((1 - t) ** 2) * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3
        r = 0.00175 * (1.0 + 0.10 * math.sin(t * 34.0))
        if t > 0.90:
            col = (0.10, 0.085, 0.07)      # extrémité brûlée
        elif t > 0.80:
            col = (0.23, 0.16, 0.10)       # zone amorce
        else:
            col = (0.17, 0.35, 0.17)
        spheres.append({
            "centre": (float(b[0]), float(b[1]), float(b[2])),
            "rayon": float(r),
            "couleur": col,
            "mat": MAT_FUSE,
            "braid": t if t <= 0.8 else None,
        })
    return cyls, spheres


# ----------------------------------------------------------------------------
# Rendu
# ----------------------------------------------------------------------------
def look_at(eye, target, up=(0.0, 1.0, 0.0)):
    fwd = normalize(np.asarray(target) - np.asarray(eye))
    up = np.asarray(up, dtype=np.float64)
    right = normalize(np.cross(fwd, up))
    up2 = np.cross(right, fwd)
    return fwd, right, up2


def shade_tile(o, d, cyls, spheres, eye):
    """Intersection + éclairage pour un lot de rayons (o,d) de forme (N,3)."""
    t_c, n_c, alb_c, mat_c, k_c = intersect_y_cylinders(o, d, cyls)
    t_s, n_s, alb_s, mat_s, k_s = intersect_spheres(o, d, spheres)
    t_g, n_g, alb_g, mat_g, k_g = intersect_ground(o, d)

    t = np.minimum(np.minimum(t_c, t_s), t_g)
    hit = t < np.inf
    t_safe = np.where(hit, t, 0.0)

    def pick(ta, na, aa, ma, ka):
        m = (ta == t)[..., None]
        return np.where(m, na, 0), np.where(m, aa, 0), np.where(m, ma, 0), np.where(ta == t, ka, 0)

    n = np.zeros_like(o)
    alb = np.zeros_like(o)
    mat = np.zeros(o.shape[:-1] + (2,))
    kind = np.zeros(t.shape)
    for ta, na, aa, ma, ka in ((t_c, n_c, alb_c, mat_c, k_c),
                               (t_s, n_s, alb_s, mat_s, k_s),
                               (t_g, n_g, alb_g, mat_g, k_g)):
        nn, aa2, mm, kk = pick(ta, na, aa, ma, ka)
        n += nn
        alb += aa2
        mat += mm
        kind = kind + kk

    p = o + t_safe[..., None] * d
    n = normalize(n)
    # micro-relief papier : bruit déterministe faible sur l'étiquette
    paper = kind == 0
    if np.any(paper):
        hsh = np.sin(p[..., 0] * 8123.7 + p[..., 1] * 6271.3 + p[..., 2] * 7733.1)
        hsh2 = np.sin(p[..., 0] * 1531.1 - p[..., 1] * 2287.9 + p[..., 2] * 3319.7)
        pert = (0.055 * hsh + 0.035 * hsh2)[..., None]
        tangent = normalize(np.stack([-n[..., 2], np.zeros_like(n[..., 0]), n[..., 0]], axis=-1))
        n = normalize(n + tangent * pert)
    V = normalize(eye - p)

    def light(lp, lcol, shadow=True):
        lp = np.asarray(lp, dtype=np.float32)
        lv = lp - p
        dist = np.linalg.norm(lv, axis=-1)
        L = lv / np.maximum(dist, 1e-6)[..., None]
        lam = np.maximum(np.sum(n * L, axis=-1), 0)
        att = 1.0 / (1.0 + 0.25 * dist * dist)
        sh = np.ones_like(lam)
        if shadow:
            so = p + n * 2.5e-3
            acc = np.zeros_like(lam)
            for ox, oz in ((0.0, 0.0), (0.022, 0.014), (-0.018, 0.024)):
                Lp = L + np.array([ox, 0.03, oz], dtype=np.float32)
                Lp = Lp / np.maximum(np.linalg.norm(Lp, axis=-1, keepdims=True), 1e-6)
                tsh, _, _, _, _ = intersect_y_cylinders(so, Lp, cyls)
                acc += np.where((tsh < dist) & (tsh < np.inf), 0.22, 1.0)
            sh = acc / 3.0
        return lam[..., None] * att[..., None] * sh[..., None] * np.asarray(lcol, dtype=np.float32)

    amb_up = np.array([0.30, 0.34, 0.42], dtype=np.float32)
    amb_dn = np.array([0.15, 0.12, 0.10], dtype=np.float32)
    hemi = amb_up * (0.5 + 0.5 * n[..., 1:2]) + amb_dn * (0.5 - 0.5 * n[..., 1:2])

    dif = (light((-0.50, 1.05, 0.62), (1.30, 1.18, 1.02))
           + light((0.85, 0.55, 0.85), (0.36, 0.40, 0.50), shadow=False)
           + light((0.15, 0.75, -0.95), (0.28, 0.31, 0.43), shadow=False))

    col = alb * (hemi + dif)

    sheen = np.ones_like(mat[..., 0])
    if np.any(paper):
        sheen = np.where(paper, 0.82 + 0.45 * (0.5 + 0.5 * np.sin(p[..., 1] * 260.0 + p[..., 0] * 170.0)), 1.0)
    mat = mat.copy()
    mat[..., 0] = mat[..., 0] * sheen
    for lp, lcol in (((-0.50, 1.05, 0.62), (1.0, 0.95, 0.85)),
                     ((0.85, 0.55, 0.85), (0.35, 0.38, 0.48))):
        L = normalize(np.asarray(lp, dtype=np.float32) - p)
        Hv = normalize(L + V)
        ndh = np.maximum(np.sum(n * Hv, axis=-1), 0)
        spec = mat[..., 0] * np.power(ndh, mat[..., 1])
        col = col + spec[..., None] * np.asarray(lcol, dtype=np.float32)

    bg = np.array([0.46, 0.50, 0.56], dtype=np.float32)
    fog = np.clip((t_safe - 0.8) / 2.2, 0, 1)[..., None] * 0.25
    col = col * (1 - fog) + bg * fog
    col = np.where(hit[..., None], col, bg)
    return np.nan_to_num(col, nan=0.0, posinf=4.0, neginf=0.0), hit


def render(w, h, eye, target, fov_deg=34.0, ss=2, out="renders/out.png"):
    load_label()
    cyls, spheres = build_scene()

    W, Hh = w * ss, h * ss
    aspect = W / Hh
    fov = math.radians(fov_deg)
    fwd, right, up2 = look_at(eye, target)
    eye = np.asarray(eye, dtype=np.float32)
    fwd = fwd.astype(np.float32)
    right = right.astype(np.float32)
    up2 = up2.astype(np.float32)

    half = math.tan(fov / 2)
    img = np.zeros((Hh, W, 3), dtype=np.float32)
    tile = max(1, int(600_000 // W))  # ~0.6M pixels / lot

    for y0i in range(0, Hh, tile):
        y1i = min(Hh, y0i + tile)
        ys, xs = np.mgrid[y0i:y1i, 0:W]
        px = ((xs + 0.5) / W * 2 - 1) * aspect * half
        py = (1 - (ys + 0.5) / Hh * 2) * half
        d = normalize(fwd + px[..., None] * right + py[..., None] * up2)
        o = np.broadcast_to(eye, d.shape)
        col, hit = shade_tile(o.reshape(-1, 3), d.reshape(-1, 3), cyls, spheres, eye)
        col = col.reshape(y1i - y0i, W, 3)
        hit = hit.reshape(y1i - y0i, W)

        # fond dégradé studio pour les rayons qui partent dans le vide
        grad = (0.35 + 0.75 * (ys / Hh))[..., None]
        col = np.where(hit[..., None], col, bg_gradient(grad))
        img[y0i:y1i] = col

    # tone mapping léger + gamma + vignette
    img = img / (1.0 + img * 0.22)
    img = np.clip(img, 0, 1) ** (1 / 2.2)
    ys, xs = np.mgrid[0:Hh, 0:W]
    vx = (xs / W - 0.5) * 2
    vy = (ys / Hh - 0.5) * 2
    vig = 1.0 - 0.20 * np.clip(vx * vx + vy * vy - 0.25, 0, 2)
    img *= vig[..., None]

    img = img.reshape(h, ss, w, ss, 3).mean(axis=(1, 3))
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(out)
    print("écrit", out)


def bg_gradient(grad):
    """Fond studio dégradé (haut clair, bas légèrement plus chaud)."""
    base = np.array([0.545, 0.575, 0.625], dtype=np.float32)
    warm = np.array([0.575, 0.565, 0.555], dtype=np.float32)
    g = np.clip(grad, 0, 1) ** 1.4
    return base * g + warm * (1 - g)


def main():
    suffix = sys.argv[1] if len(sys.argv) > 1 else "v1"

    # Vue « produit » 3/4 (comme les photos de référence)
    render(900, 1200,
           eye=(0.34, 0.35, 0.86), target=(0.0, 0.238, 0.0), fov_deg=29,
           out=f"renders/hero-{suffix}.png")

    # Gros plan étiquette
    render(1100, 750,
           eye=(0.19, 0.27, 0.40), target=(0.0, 0.225, 0.0), fov_deg=27,
           out=f"renders/detail-{suffix}.png")

    # Mèche / bourrelet
    render(900, 750,
           eye=(0.14, 0.53, 0.22), target=(0.018, 0.428, 0.006), fov_deg=25,
           out=f"renders/fuse-{suffix}.png")


if __name__ == "__main__":
    main()
