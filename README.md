# Visionneur 3D — chandelle romaine

Reprise du modèle pour correspondre à la **photo produit de référence** :
tube fin présenté en diagonale sur fond blanc, habillage sombre bleu nuit/vert
avec gerbes imprimées multicolores, repères jaune et rouge côté capuchon bleu,
et mèche rouge très courte à l'autre extrémité.

## Lancer

```bash
python3 -m http.server 8000
```

Ouvrir ensuite `http://localhost:8000/`. Three.js et OrbitControls sont fournis
dans `vendor/`, sans étape de compilation.

## Commandes du visionneur

- Souris / molette : orbiter et zoomer.
- Vues produit, extrémité rouge, capuchon bleu et 3/4.
- Rotation automatique.
- Démonstration d'allumage animée (étincelles et comètes).

## Construction

- `js/candle.js` : géométrie du tube, capuchon bleu, lèvre sombre, mèche fine.
- `js/main.js` : éclairage de studio blanc, présentation diagonale et caméras.
- `js/effects.js` : animation de démonstration.
- `tools/make_label.py` : génération procédurale de l'habillage festif.
- `assets/label.png` : texture d'impression enroulée sur le cylindre.
- `image-search/` : images produit utilisées comme référence visuelle.

Le tube fait environ 42 cm de long pour 17 mm de diamètre. La mèche s'étend
d'environ 1 cm au-delà de l'extrémité, avec un diamètre inférieur à 1,5 mm.
