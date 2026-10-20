// Modèle 3D de la chandelle romaine.
// Constantes identiques à tools/render_model.py (moteur de rendu de contrôle).
import * as THREE from 'three';

export const M = {
  R_TUBE: 0.0105,      // rayon extérieur du tube habillé
  R_RIM: 0.0113,       // bourrelet carton (bouche)
  R_BORE: 0.0070,      // alésage intérieur
  R_CAP: 0.0109,       // capuchon bas
  Y0: 0.012,           // bas de l'étiquette
  L_LABEL: 0.398,      // longueur habillée
  H_RIM: 0.010,        // hauteur du bourrelet
};
M.Y1 = M.Y0 + M.L_LABEL;          // 0.410 — pied du bourrelet
M.Y_TOP = M.Y1 + M.H_RIM;         // 0.420 — bouche du tube

// Points de la mèche visco (bézier cubique, identique au rendu de contrôle)
const FUSE = [
  new THREE.Vector3(0.002, M.Y_TOP - 0.022, 0.002),
  new THREE.Vector3(0.010, M.Y_TOP + 0.024, 0.008),
  new THREE.Vector3(0.040, M.Y_TOP + 0.030, 0.016),
  new THREE.Vector3(0.062, M.Y_TOP + 0.002, 0.024),
];

export function fuseCurve() {
  return new THREE.CubicBezierCurve3(FUSE[0], FUSE[1], FUSE[2], FUSE[3]);
}

/* ------------------------------------------------------------------ */
/* Textures procédurales                                              */
/* ------------------------------------------------------------------ */

function kraftRingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b28b5c';
  g.fillRect(0, 0, 256, 256);
  // anneaux concentriques du carton stratifié
  for (let r = 8; r < 180; r += 7) {
    const k = 0.88 + 0.18 * Math.sin(r * 0.9);
    g.beginPath();
    g.arc(128, 128, r, 0, Math.PI * 2);
    g.strokeStyle = `rgba(${Math.round(178 * k)}, ${Math.round(139 * k)}, ${Math.round(92 * k)}, 0.9)`;
    g.lineWidth = 3.4;
    g.stroke();
  }
  // tranche extérieure plus sombre
  const grad = g.createRadialGradient(128, 128, 120, 128, 128, 128);
  grad.addColorStop(0, 'rgba(60,40,20,0)');
  grad.addColorStop(1, 'rgba(60,40,20,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fuseTexture() {
  // tresse diagonale verte + zone amorce + extrémité brûlée (le long de u)
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0.0, '#2c5e2c');
  grad.addColorStop(0.78, '#2c5e2c');
  grad.addColorStop(0.84, '#4a3520');
  grad.addColorStop(0.93, '#3a2a18');
  grad.addColorStop(1.0, '#241a10');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 64);
  // rayures de tresse
  for (let x = -64; x < 512; x += 14) {
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 7, 0);
    g.lineTo(x + 7 - 32, 64);
    g.lineTo(x - 32, 64);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.moveTo(x + 7, 0);
    g.lineTo(x + 14, 0);
    g.lineTo(x + 14 - 32, 64);
    g.lineTo(x + 7 - 32, 64);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 256, 40, 256, 256, 360);
  grad.addColorStop(0, '#cdd3dc');
  grad.addColorStop(0.55, '#b9c0cb');
  grad.addColorStop(1, '#8f97a4');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/* Construction du modèle                                             */
/* ------------------------------------------------------------------ */

export async function buildCandle({ labelURL = 'assets/label.png' } = {}) {
  const group = new THREE.Group();
  group.name = 'chandelle';

  const maxAniso = 8;

  // --- étiquette (texture validée par le moteur de contrôle) ---
  const label = await new THREE.TextureLoader().loadAsync(labelURL);
  label.colorSpace = THREE.SRGBColorSpace;
  label.wrapS = THREE.RepeatWrapping;
  // Alignement UV identique au moteur de contrôle :
  // u_moteur = 0.75 - u_three  =>  répétition inversée + décalage 0.75
  label.repeat.x = -1;
  label.offset.x = 0.75;
  label.anisotropy = maxAniso;
  label.needsUpdate = true;

  const tubeMat = new THREE.MeshStandardMaterial({
    map: label,
    roughness: 0.52,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(M.R_TUBE, M.R_TUBE, M.L_LABEL, 128, 1, true),
    tubeMat
  );
  tube.position.y = M.Y0 + M.L_LABEL / 2;
  tube.castShadow = tube.receiveShadow = true;
  group.add(tube);

  // --- bourrelet carton (latéral) ---
  const kraft = new THREE.MeshStandardMaterial({
    color: 0xb28b5c,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(M.R_RIM, M.R_RIM, M.H_RIM, 96, 1, true),
    kraft
  );
  rim.position.y = M.Y1 + M.H_RIM / 2;
  rim.castShadow = rim.receiveShadow = true;
  group.add(rim);

  // --- couronne supérieure (disque annulaire) ---
  const ringMat = new THREE.MeshStandardMaterial({
    map: kraftRingTexture(),
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(M.R_BORE, M.R_RIM, 96), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = M.Y_TOP;
  ring.receiveShadow = true;
  group.add(ring);

  // --- paroi intérieure de l'alésage + fond obscurci ---
  const boreMat = new THREE.MeshStandardMaterial({
    color: 0x4d331f,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const bore = new THREE.Mesh(
    new THREE.CylinderGeometry(M.R_BORE, M.R_BORE, 0.030, 64, 1, true),
    boreMat
  );
  bore.position.y = M.Y_TOP - 0.015;
  group.add(bore);

  const boreFloor = new THREE.Mesh(
    new THREE.CircleGeometry(M.R_BORE, 64),
    new THREE.MeshStandardMaterial({ color: 0x140c06, roughness: 1, metalness: 0 })
  );
  boreFloor.rotation.x = -Math.PI / 2;
  boreFloor.position.y = M.Y_TOP - 0.030;
  group.add(boreFloor);

  // --- capuchon bas plastique ---
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xb4142c,
    roughness: 0.38,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(M.R_CAP, M.R_CAP, M.Y0 + 0.001, 96),
    capMat
  );
  cap.position.y = (M.Y0 + 0.001) / 2;
  cap.castShadow = cap.receiveShadow = true;
  group.add(cap);

  // --- mèche visco (tube le long du bézier) ---
  const fuseMat = new THREE.MeshStandardMaterial({
    map: fuseTexture(),
    roughness: 0.62,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const fuse = new THREE.Mesh(
    new THREE.TubeGeometry(fuseCurve(), 72, 0.00175, 12, false),
    fuseMat
  );
  fuse.castShadow = true;
  fuse.name = 'fuse';
  group.add(fuse);

  // petite pointe à l'extrémité de la mèche
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.0019, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 0.9 })
  );
  const tipPt = fuseCurve().getPoint(1);
  tip.position.copy(tipPt);
  group.add(tip);

  return group;
}
