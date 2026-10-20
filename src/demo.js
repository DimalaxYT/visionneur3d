import * as THREE from 'three';

/**
 * Modèle de démonstration généré en direct : un gyroscope métallique
 * qui met en valeur les reflets, les ombres et la grille.
 */
export function createDemoModel() {
  const root = new THREE.Group();
  root.name = 'Gyroscope';

  const silver = new THREE.MeshStandardMaterial({
    color: 0xd9e0e8,
    metalness: 1,
    roughness: 0.15,
    envMapIntensity: 1.5,
  });

  const gunmetal = new THREE.MeshStandardMaterial({
    color: 0x39414b,
    metalness: 0.96,
    roughness: 0.3,
    envMapIntensity: 1.25,
  });

  const accent = new THREE.MeshStandardMaterial({
    color: 0xd8ff3e,
    metalness: 0.55,
    roughness: 0.22,
    emissive: 0x394607,
    emissiveIntensity: 0.55,
    envMapIntensity: 1.2,
  });

  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.92,
    roughness: 0.07,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.7,
  });

  const ring = (radius, tube, material, rotation) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 26, 240), material);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    return mesh;
  };

  root.add(ring(1.56, 0.046, silver, [Math.PI / 2, 0, 0]));
  root.add(ring(1.27, 0.036, gunmetal, [0.35, Math.PI / 2.6, Math.PI / 3]));
  root.add(ring(0.96, 0.03, accent, [Math.PI / 2.5, Math.PI / 5.5, 0]));

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 2), chrome);
  core.rotation.set(0.4, 0.8, 0.1);
  root.add(core);

  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), accent);
  root.add(inner);

  const satelliteGeometry = new THREE.SphereGeometry(0.062, 24, 16);
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const satellite = new THREE.Mesh(satelliteGeometry, accent);
    satellite.position.set(Math.cos(angle) * 1.56, Math.sin(angle) * 0.05, Math.sin(angle) * 1.56);
    root.add(satellite);
  }

  root.position.y = 1.68;

  return {
    object: root,
    animations: [],
    name: 'Gyroscope',
    format: 'DÉMO',
    fileCount: 1,
    files: [],
    dependencies: 0,
  };
}
