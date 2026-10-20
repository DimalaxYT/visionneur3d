import { Viewer, disposeObject } from './viewer.js';
import { loadFiles, ACCEPTED_EXTENSIONS } from './assetLoader.js';
import { createDemoModel } from './demo.js';

const $ = (id) => document.getElementById(id);

const canvas = $('viewer');
const app = $('app');
const openBtn = $('openBtn');
const fileInput = $('fileInput');
const dropzone = $('dropzone');
const demoBtn = $('demoBtn');
const fileChip = $('fileChip');
const fileChipName = $('fileChipName');
const fileChipFormat = $('fileChipFormat');
const infoCard = $('infoCard');
const infoName = $('infoName');
const infoFormat = $('infoFormat');
const toolbar = $('toolbar');
const controlsHint = $('controlsHint');
const resetBtn = $('resetBtn');
const rotateBtn = $('rotateBtn');
const gridBtn = $('gridBtn');
const shotBtn = $('shotBtn');
const fullBtn = $('fullBtn');
const loading = $('loading');
const loadingTitle = $('loadingTitle');
const loadingSub = $('loadingSub');
const progress = document.querySelector('.progress');
const progressBar = $('progressBar');
const dragOverlay = $('dragOverlay');
const toastEl = $('toast');

const statTris = $('statTris');
const statVerts = $('statVerts');
const statMeshes = $('statMeshes');
const statMats = $('statMats');

fileInput.accept = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

let viewer = null;
let loadToken = 0;
let currentName = '';
let hasModel = false;
let toastTimer = 0;
let hintTimer = 0;
let dragDepth = 0;

try {
  viewer = new Viewer(canvas);
  if (import.meta.env.DEV) window.__viewer = viewer;
  viewer.onContextLost = () => {
    showToast("Le contexte WebGL a été perdu. Recharge la page pour retrouver l'affichage.", 'error', 9000);
  };
} catch (error) {
  console.error(error);
  showFatal(
    "WebGL n'est pas disponible dans ce navigateur.",
    "Active l'accélération matérielle ou essaie Chrome, Edge, Firefox ou Safari récent."
  );
}

/* ---------------- Fichiers ---------------- */

function pickFile() {
  fileInput.click();
}

openBtn?.addEventListener('click', pickFile);
dropzone?.addEventListener('click', pickFile);
dropzone?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    pickFile();
  }
});

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = '';
  if (files.length) openFiles(files);
});

demoBtn?.addEventListener('click', () => {
  if (!viewer) return;
  loadToken += 1;
  hideLoading();
  const demo = createDemoModel();
  applyResult(demo, { demo: true });
  showToast("Modèle d'exemple chargé. Dépose ton propre fichier quand tu veux.", 'info', 4500);
});

async function openFiles(files) {
  if (!viewer) {
    showToast("La 3D n'est pas disponible dans ce navigateur.", 'error', 6000);
    return;
  }

  const token = (loadToken += 1);
  const first = files[0];
  const title =
    files.length > 1
      ? `Ouverture de ${files.length} fichiers…`
      : `Ouverture de ${first?.name || 'ton modèle'}…`;

  showLoading(title, 'Lecture des géométries et des textures');

  try {
    const result = await loadFiles(files, {
      renderer: viewer.renderer,
      onStatus: (text, ratio) => {
        if (token !== loadToken) return;
        loadingTitle.textContent = text;
        setProgress(ratio);
      },
      onProgress: (ratio) => {
        if (token !== loadToken) return;
        setProgress(ratio);
      },
    });

    if (token !== loadToken) {
      disposeObject(result.object);
      return;
    }

    applyResult(result);
    await wait(240);
    if (token === loadToken) hideLoading();

    if (result.withAnimation) {
      showToast('Animation intégrée détectée : lecture automatique.', 'info', 4200);
    }
  } catch (error) {
    console.error(error);
    if (token !== loadToken) return;
    hideLoading();
    const fileName = files.length === 1 ? `« ${files[0].name} »` : `${files.length} fichiers`;
    showToast(capitalize(`impossible d'ouvrir ${fileName} : ${friendlyError(error)}`), 'error', 9000);
  }
}

function applyResult(result, options = {}) {
  hasModel = true;
  currentName = result.name || 'modèle';

  viewer.setModel(result.object, result.animations || []);
  app.classList.add('has-model');

  fileChip.hidden = false;
  fileChipName.textContent = currentName;
  fileChipName.title = currentName;
  fileChipFormat.textContent = result.format || '3D';

  infoCard.hidden = false;
  infoName.textContent = currentName;
  infoName.title = currentName;
  infoFormat.textContent = result.format || '3D';

  const stats = viewer.computeStats(result.object);
  statTris.textContent = formatNumber(stats.triangles);
  statVerts.textContent = formatNumber(stats.vertices);
  statMeshes.textContent = formatNumber(stats.meshes);
  statMats.textContent = formatNumber(stats.materials);

  toolbar.hidden = false;
  controlsHint.hidden = false;
  controlsHint.classList.remove('is-fading');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => controlsHint.classList.add('is-fading'), 7000);

  setToggle(rotateBtn, false);
  viewer.setAutoRotate(false);
  setToggle(gridBtn, true);
  viewer.setGridVisible(true);

  document.title = options.demo ? 'Visionneur3D — modèle d’exemple' : `${currentName} — Visionneur3D`;
  dropzone?.classList.remove('is-over');
}

/* ---------------- Chargement ---------------- */

function showLoading(title, subtitle) {
  loadingTitle.textContent = title;
  loadingSub.textContent = subtitle;
  progressBar.style.width = '0%';
  progress.classList.add('is-indeterminate');
  loading.hidden = false;
}

function setProgress(ratio) {
  if (typeof ratio !== 'number' || Number.isNaN(ratio)) return;
  const clamped = Math.max(0, Math.min(ratio, 1));
  progress.classList.remove('is-indeterminate');
  progressBar.style.width = `${Math.round(clamped * 100)}%`;
}

function hideLoading() {
  loading.hidden = true;
  progress.classList.remove('is-indeterminate');
  progressBar.style.width = '0%';
}

const formatNumber = new Intl.NumberFormat('fr-FR').format;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------------- Glisser-déposer ---------------- */

const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

window.addEventListener('dragenter', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth += 1;
  dragOverlay.classList.add('is-visible');
});

window.addEventListener('dragover', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('dragleave', (event) => {
  // Certains navigateurs n'exposent pas les types sur dragleave : on se fie
  // aussi à la position pour ne pas laisser l'overlay coincé à l'écran.
  const leftWindow =
    event.clientX <= 0 ||
    event.clientY <= 0 ||
    event.clientX >= window.innerWidth ||
    event.clientY >= window.innerHeight;
  if (!hasFiles(event) && !leftWindow) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0 || leftWindow) {
    dragDepth = 0;
    dragOverlay.classList.remove('is-visible');
    dropzone?.classList.remove('is-over');
  }
});

window.addEventListener('blur', () => {
  if (document.hidden) {
    dragDepth = 0;
    dragOverlay.classList.remove('is-visible');
  }
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  dragOverlay.classList.remove('is-visible');
  dropzone?.classList.remove('is-over');
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length) openFiles(files);
});

dropzone?.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('is-over');
});

dropzone?.addEventListener('dragleave', () => {
  dropzone.classList.remove('is-over');
});

/* ---------------- Outils ---------------- */

resetBtn?.addEventListener('click', () => viewer?.resetView(true));

rotateBtn?.addEventListener('click', () => {
  if (!viewer) return;
  const next = rotateBtn.getAttribute('aria-pressed') !== 'true';
  setToggle(rotateBtn, next);
  viewer.setAutoRotate(next);
});

gridBtn?.addEventListener('click', () => {
  if (!viewer) return;
  const next = gridBtn.getAttribute('aria-pressed') !== 'true';
  setToggle(gridBtn, next);
  viewer.setGridVisible(next);
});

shotBtn?.addEventListener('click', takeScreenshot);

async function takeScreenshot() {
  if (!viewer || !hasModel) return;
  try {
    const safeName = (currentName || 'rendu')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    await viewer.screenshot(`${safeName || 'rendu'}-visionneur3d.png`);
    showToast('Capture enregistrée.', 'info', 2600);
  } catch (error) {
    console.error(error);
    showToast("La capture d'écran a échoué.", 'error', 4000);
  }
}

fullBtn?.addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {
      showToast('Le plein écran est bloqué par le navigateur.', 'error', 3200);
    });
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

document.addEventListener('fullscreenchange', () => {
  const isFull = Boolean(document.fullscreenElement);
  fullBtn?.setAttribute('aria-label', isFull ? 'Quitter le plein écran' : 'Passer en plein écran');
  fullBtn?.setAttribute('data-tip', isFull ? 'Quitter le plein écran' : 'Plein écran');
});

function setToggle(button, active) {
  if (!button) return;
  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', String(active));
}

/* ---------------- Raccourcis clavier ---------------- */

window.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  if (!hasModel || !viewer) return;

  switch (event.key.toLowerCase()) {
    case 'r':
      viewer.resetView(true);
      break;
    case 'f':
      toggleFullscreen();
      break;
    case 'g':
      gridBtn?.click();
      break;
    case 's':
      takeScreenshot();
      break;
    case ' ':
      event.preventDefault();
      rotateBtn?.click();
      break;
    default:
      break;
  }
});

/* ---------------- Toasts ---------------- */

function showToast(message, type = 'info', duration = 4000) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.toggle('is-error', type === 'error');
  toastEl.classList.add('is-visible');
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), duration);
}

function friendlyError(error) {
  const message = String(error?.message || error || '').trim();

  if (/draco/i.test(message)) {
    return "le décodeur Draco n'a pas pu démarrer. Vérifie ta connexion et recharge la page.";
  }
  if (/ktx2|basis/i.test(message)) {
    return "les textures compressées KTX2 n'ont pas pu être décodées. Essaie un export sans compression KTX2.";
  }
  if (/fbx/i.test(message) && /unsupported|not supported|invalid/i.test(message)) {
    return 'ce fichier FBX semble corrompu ou dans une version non prise en charge. Réexporte-le en FBX 2014/2015 ou en GLB.';
  }
  if (/json|unexpected token|parse/i.test(message) && /gltf/i.test(message)) {
    return "le fichier glTF est illisible. Vérifie qu'il est complet (.gltf + .bin + textures).";
  }
  if (/fetch|network|cors|failed to load|load failed/i.test(message)) {
    return "un fichier lié au modèle est introuvable (texture, .bin ou .mtl). Dépose tous les fichiers ensemble.";
  }
  if (/aucune géométrie|empty|scène glTF vide/i.test(message)) {
    return 'ce fichier ne contient aucune géométrie visible.';
  }
  if (/dataview|arraybuffer|offset is outside|out of bounds|unexpected end|truncated/i.test(message)) {
    return 'ce fichier semble corrompu ou incomplet. Réexporte-le depuis ton logiciel 3D (GLB de préférence).';
  }
  if (/unsupported|not supported|invalid|unexpected token|syntax/i.test(message)) {
    return "le format n'est pas reconnu ou la version n'est pas prise en charge.";
  }
  const cleaned = message.replace(/\.$/, '');
  return cleaned ? `${cleaned}.` : 'impossible de charger ce fichier.';
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function showFatal(title, text) {
  document.querySelector('.empty-inner')?.remove();
  const container = document.querySelector('.empty');
  if (!container) return;
  const panel = document.createElement('div');
  panel.className = 'empty-inner';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.className = 'lede';
  copy.textContent = text;
  panel.append(heading, copy);
  container.append(panel);
  openBtn.disabled = true;
  openBtn.style.opacity = '0.5';
}

/* Le canvas garde le focus clavier après un clic. */
canvas.tabIndex = 0;
