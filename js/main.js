// Visionneur 3D — modèle redessiné pour suivre la photo de référence.
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
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

// Vue latérale sur fond blanc, comme la photo catalogue.
const camera = new THREE.PerspectiveCamera(31, window.innerWidth / window.innerHeight, 0.01, 10);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.target.set(0, 0.21, 0);
controls.minDistance = 0.16;
controls.maxDistance = 1.8;
controls.maxPolarAngle = Math.PI * 0.92;
controls.autoRotateSpeed = 0.75;

const VIEWS = {
  product: { pos: [0.00, 0.21, 0.62], target: [0.00, 0.21, 0], fov: 31 },
  muzzle:  { pos: [0.22, 0.34, 0.17], target: [0.178, 0.313, 0], fov: 34 },
  top:     { pos: [-0.22, 0.10, 0.17], target: [-0.178, 0.107, 0], fov: 34 },
  hero:    { pos: [0.12, 0.27, 0.67], target: [0, 0.21, 0], fov: 34 },
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

// Éclairage doux, sans décor de sol : conserve le fond blanc de la référence.
scene.add(new THREE.HemisphereLight(0xffffff, 0x75808e, 1.55));
const key = new THREE.DirectionalLight(0xffffff, 2.15);
key.position.set(-0.45, 0.65, 0.9);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 0.05;
key.shadow.camera.far = 2.5;
key.shadow.camera.left = -0.5;
key.shadow.camera.right = 0.5;
key.shadow.camera.top = 0.5;
key.shadow.camera.bottom = -0.5;
key.shadow.bias = -0.0003;
scene.add(key);
const fill = new THREE.DirectionalLight(0xd9e9ff, 0.65);
fill.position.set(0.5, -0.15, 0.8);
scene.add(fill);

// Pivot centré : tube orienté à environ 30° de l'horizontale comme sur la photo.
const presentation = new THREE.Group();
presentation.name = 'presentation-diagonale';
const presentationAngle = -Math.PI / 3;
const pivotY = M.Y_TOP / 2;
presentation.rotation.z = presentationAngle;
presentation.position.set(
  Math.sin(presentationAngle) * pivotY,
  0.21 - Math.cos(presentationAngle) * pivotY,
  0
);
scene.add(presentation);

const statusEl = document.getElementById('status');
let ignition = null;
buildCandle().then((candle) => {
  presentation.add(candle);
  ignition = new Ignition(presentation, statusEl);
  document.getElementById('btn-ignite').addEventListener('click', () => ignition.start());
  document.getElementById('btn-reset').addEventListener('click', () => ignition.reset());
}).catch((err) => {
  console.error(err);
  statusEl.textContent = 'Erreur de chargement du modèle : ' + err.message;
  statusEl.classList.remove('hidden');
});

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
