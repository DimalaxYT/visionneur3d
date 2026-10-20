// Visionneur 3D — chandelle romaine.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildCandle, M } from './candle.js';
import { Ignition } from './effects.js';

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// fond studio dégradé (comme les rendus de contrôle)
{
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#9aa6b8');
  grad.addColorStop(0.55, '#8e97a6');
  grad.addColorStop(1, '#6f7784');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 512);
  const bg = new THREE.CanvasTexture(c);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;
}

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.01, 60);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0, 0.238, 0);
controls.minDistance = 0.12;
controls.maxDistance = 2.6;
controls.maxPolarAngle = Math.PI * 0.52;
controls.autoRotateSpeed = 1.1;

/* ---------------- vues ---------------- */
const VIEWS = {
  product: { pos: [0.34, 0.35, 0.86], target: [0, 0.238, 0], fov: 30 },
  muzzle:  { pos: [0.14, 0.53, 0.22], target: [0.018, 0.428, 0.006], fov: 26 },
  top:     { pos: [0.06, 0.72, 0.13], target: [0, 0.40, 0], fov: 30 },
  hero:    { pos: [0.42, 0.30, 0.70], target: [0, 0.245, 0], fov: 33 },
};

function setView(name) {
  const v = VIEWS[name];
  if (!v) return;
  camera.position.set(...v.pos);
  camera.fov = v.fov;
  camera.updateProjectionMatrix();
  controls.target.set(...v.target);
  controls.update();
}
setView('product');

/* ---------------- lumières ---------------- */
const hemi = new THREE.HemisphereLight(0xbfd0e6, 0x3d3630, 0.85);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff1dc, 2.35);
key.position.set(-0.50, 1.05, 0.62);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.05;
key.shadow.camera.far = 4;
key.shadow.camera.left = -0.55;
key.shadow.camera.right = 0.55;
key.shadow.camera.top = 0.95;
key.shadow.camera.bottom = -0.15;
key.shadow.bias = -0.0004;
key.shadow.radius = 5;
scene.add(key);

const fill = new THREE.DirectionalLight(0x9db4dd, 0.72);
fill.position.set(0.85, 0.55, 0.85);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xbfd4ff, 0.55);
rim.position.set(0.15, 0.75, -0.95);
scene.add(rim);

/* ---------------- sol ---------------- */
{
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 256, 30, 256, 256, 360);
  grad.addColorStop(0, '#c9d0da');
  grad.addColorStop(0.6, '#b2bac6');
  grad.addColorStop(1, '#848c99');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 72),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.94, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

/* ---------------- modèle + effets ---------------- */
const statusEl = document.getElementById('status');
let ignition = null;

buildCandle().then((candle) => {
  scene.add(candle);
  ignition = new Ignition(scene, statusEl);
  document.getElementById('btn-ignite').addEventListener('click', () => ignition.start());
  document.getElementById('btn-reset').addEventListener('click', () => ignition.reset());
}).catch((err) => {
  console.error(err);
  statusEl.textContent = 'Erreur de chargement du modèle : ' + err.message;
  statusEl.classList.remove('hidden');
});

/* ---------------- UI ---------------- */
document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    setView(btn.dataset.view);
  });
});

const rotateBtn = document.getElementById('btn-rotate');
rotateBtn.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  rotateBtn.classList.toggle('active', controls.autoRotate);
});

/* ---------------- boucle ---------------- */
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (ignition) ignition.update(dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
