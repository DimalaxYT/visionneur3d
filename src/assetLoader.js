import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

export const MODEL_EXTENSIONS = ['glb', 'gltf', 'obj', 'fbx', 'stl', 'ply'];
export const ACCEPTED_EXTENSIONS = [
  ...MODEL_EXTENSIONS,
  'mtl',
  'bin',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'ktx2',
  'bmp',
  'gif',
  'tga',
  'hdr',
];

const SUPPORTED = new Set(MODEL_EXTENSIONS);
const assetPath = (folder) => new URL(`${import.meta.env.BASE_URL}${folder}/`, window.location.href).href;

export function extensionOf(file) {
  const match = /\.([a-z0-9]+)$/i.exec(file.name || '');
  return match ? match[1].toLowerCase() : '';
}

export function baseNameOf(file) {
  return (file.name || 'modèle').replace(/\.[^.]+$/, '');
}

/**
 * Charge un ou plusieurs fichiers 3D déposés (avec leurs dépendances éventuelles :
 * MTL, BIN, textures) et renvoie un groupe prêt à être ajouté à la scène.
 */
const NATIVE_HINTS = {
  blend: 'Depuis Blender : Fichier → Exporter → glTF 2.0 (.glb).',
  max: 'Depuis 3ds Max : File → Export → glTF 2.0 (.glb).',
  c4d: 'Depuis Cinema 4D : Fichier → Exporter → glTF 2.0 (.glb).',
  ma: 'Depuis Maya : File → Export All → glTF 2.0 (.glb).',
  mb: 'Depuis Maya : File → Export All → glTF 2.0 (.glb).',
  ztl: 'Depuis ZBrush : exporter un OBJ, STL ou PLY.',
};

export async function loadFiles(files, options = {}) {
  const { onProgress = () => {}, onStatus = () => {}, renderer } = options;
  const list = Array.from(files).filter((file) => file && file.size >= 0);
  const models = list.filter((file) => SUPPORTED.has(extensionOf(file)));

  if (!list.length) throw new Error('aucun fichier reçu');
  if (!models.length) {
    const first = extensionOf(list[0]);
    const hint = NATIVE_HINTS[first];
    if (hint) {
      throw new Error(
        `les fichiers .${first} ne s'ouvrent pas directement dans le navigateur. ${hint}`
      );
    }
    throw new Error(
      first
        ? `le format « .${first} » n'est pas pris en charge. Essaie GLB, GLTF, OBJ, FBX, STL ou PLY.`
        : 'format non reconnu. Essaie GLB, GLTF, OBJ, FBX, STL ou PLY.'
    );
  }

  // Table des ressources locales (textures, .bin, .mtl) résolues par leur nom.
  const objectUrls = [];
  const resourceMap = new Map();
  const anonymous = [];

  for (const file of list) {
    const url = URL.createObjectURL(file);
    objectUrls.push(url);
    const relative = (file.webkitRelativePath || file.name).replace(/\\/g, '/').toLowerCase();
    const clean = relative.replace(/^(\.\/)+/, '');
    if (!resourceMap.has(clean)) resourceMap.set(clean, url);
    const base = clean.split('/').pop();
    if (base && !resourceMap.has(base)) resourceMap.set(base, url);
    anonymous.push({ file, url });
  }

  const resolveUrl = (rawUrl) => {
    if (!rawUrl) return rawUrl;

    let candidate = rawUrl;
    if (/^blob:/i.test(candidate)) {
      // Le loader transforme « blob:.../uuid » + « fichier.bin » en
      // « blob:.../fichier.bin » : on récupère le nom pour le retrouver.
      candidate = candidate.split('/').pop() || '';
      if (!candidate) return rawUrl;
    } else if (/^(data:|https?:|file:)/i.test(candidate)) {
      return rawUrl;
    }

    let clean = candidate.split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
    try {
      clean = decodeURIComponent(clean);
    } catch {
      /* séquence d'échappement invalide : on garde la chaîne brute */
    }
    clean = clean.replace(/^(\.\/)+/, '');
    const base = clean.split('/').pop();
    return resourceMap.get(clean) || resourceMap.get(base) || rawUrl;
  };

  const manager = new THREE.LoadingManager();
  manager.setURLModifier(resolveUrl);

  const draco = new DRACOLoader(manager);
  draco.setDecoderPath(assetPath('draco'));
  draco.setWorkerLimit(2);

  const ktx2 = new KTX2Loader(manager);
  ktx2.setTranscoderPath(assetPath('basis'));
  if (renderer) ktx2.detectSupport(renderer);

  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setDRACOLoader(draco);
  gltfLoader.setKTX2Loader(ktx2);

  const total = models.length;
  const results = [];

  try {
    for (let index = 0; index < models.length; index += 1) {
      const file = models[index];
      const label = models.length > 1 ? ` (${index + 1}/${total})` : '';
      onStatus(`Lecture de ${baseNameOf(file)}${label}`, 0.08 + (index / total) * 0.8);

      const progress = (event) => {
        if (!event || !event.total) return;
        const ratio = Math.min(event.loaded / event.total, 1);
        onProgress(0.08 + ((index + ratio * 0.85) / total) * 0.85);
      };

      const result = await loadSingle(file, {
        list,
        manager,
        gltfLoader,
        draco,
        ktx2,
        progress,
        onStatus,
        resolveUrl,
        anonymous,
      });

      if (!result.object || !hasGeometry(result.object)) {
        throw new Error('aucune géométrie exploitable dans ce fichier');
      }
      result.object.name = baseNameOf(file);
      results.push({ ...result, file });
      onProgress(0.08 + ((index + 1) / total) * 0.85);
    }

    onStatus('Finalisation de la scène', 0.96);

    const group = new THREE.Group();
    group.name = 'Modèle importé';

    if (results.length === 1) {
      group.add(results[0].object);
    } else {
      // Plusieurs modèles déposés : on les aligne côte à côte.
      const gap = Math.max(
        ...results.map((result) => {
          const size = new THREE.Box3().setFromObject(result.object).getSize(new THREE.Vector3());
          return Math.max(size.x, size.z);
        })
      ) * 0.25;
      let cursor = 0;
      results.forEach((result) => {
        const box = new THREE.Box3().setFromObject(result.object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        result.object.position.x += -center.x + cursor + size.x / 2;
        result.object.position.z -= center.z;
        cursor += size.x + gap;
        group.add(result.object);
      });
    }

    const animations = results.length === 1 ? results[0].animations || [] : [];
    const withAnimation = animations.length > 0;

    const name =
      results.length === 1
        ? baseNameOf(results[0].file)
        : `${results.length} modèles`;

    const format =
      results.length === 1 ? extensionOf(results[0].file).toUpperCase() : 'MULTI';

    onProgress(1);

    return {
      object: group,
      animations,
      withAnimation,
      name,
      format,
      fileCount: results.length,
      files: results.map((result) => result.file),
      dependencies: list.length - results.length,
    };
  } finally {
    draco.dispose();
    ktx2.dispose();
    // On laisse aux textures locales le temps de finir de se décoder.
    setTimeout(() => objectUrls.forEach((url) => URL.revokeObjectURL(url)), 20000);
  }
}


/** Vrai si l'objet contient au moins un maillage (ou points/lignes) visible. */
function hasGeometry(root) {
  let found = false;
  root.traverse((child) => {
    if (found) return;
    const renderable = child.isMesh || child.isPoints || child.isLine || child.isSprite;
    if (renderable && child.geometry && child.geometry.attributes?.position) found = true;
  });
  return found;
}

async function loadSingle(file, context) {
  const ext = extensionOf(file);
  const { anonymous, manager } = context;
  const entry = anonymous.find((item) => item.file === file);
  const url = entry ? entry.url : URL.createObjectURL(file);

  switch (ext) {
    case 'glb':
    case 'gltf': {
      context.onStatus('Décodage de la scène glTF…');
      const gltf = await loadWith(context.gltfLoader, url, context.progress);
      const object = gltf.scene || gltf.scenes?.[0];
      if (!object) throw new Error('scène glTF vide');
      return { object, animations: gltf.animations || [] };
    }

    case 'obj': {
      const objLoader = new OBJLoader(manager);
      const mtls = context.list.filter((candidate) => extensionOf(candidate) === 'mtl');

      if (mtls.length) {
        context.onStatus('Lecture des matériaux MTL…');
        const modelBase = baseNameOf(file).toLowerCase();
        const chosen =
          mtls.find((mtl) => baseNameOf(mtl).toLowerCase() === modelBase) ||
          mtls.find((mtl) => modelBase.includes(baseNameOf(mtl).toLowerCase())) ||
          mtls[0];
        try {
          const mtlText = await chosen.text();
          const mtlLoader = new MTLLoader(manager);
          const materials = mtlLoader.parse(mtlText, '');
          materials.preload();
          objLoader.setMaterials(materials);
        } catch (error) {
          console.warn('MTL illisible, matériau par défaut appliqué.', error);
        }
      }

      context.onStatus('Décodage de la géométrie OBJ…');
      const object = await loadWith(objLoader, url, context.progress);

      if (!mtls.length) {
        const fallback = new THREE.MeshStandardMaterial({
          color: 0xc9d1d9,
          metalness: 0.28,
          roughness: 0.48,
          envMapIntensity: 1.15,
        });
        object.traverse((child) => {
          if (!child.isMesh) return;
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material?.dispose?.());
          } else {
            child.material?.dispose?.();
          }
          child.material = fallback;
        });
      }
      return { object, animations: [] };
    }

    case 'fbx': {
      context.onStatus('Décodage de la géométrie FBX…');
      const object = await loadWith(new FBXLoader(manager), url, context.progress);
      return { object, animations: object.animations || [] };
    }

    case 'stl': {
      context.onStatus('Décodage du maillage STL…');
      const geometry = await loadWith(new STLLoader(manager), url, context.progress);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: 0xcbd3dc,
        metalness: 0.32,
        roughness: 0.42,
        envMapIntensity: 1.2,
        side: THREE.DoubleSide,
      });
      return { object: new THREE.Mesh(geometry, material), animations: [] };
    }

    case 'ply': {
      context.onStatus('Décodage du nuage PLY…');
      const geometry = await loadWith(new PLYLoader(manager), url, context.progress);
      const hadNormals = Boolean(geometry.attributes.normal);
      if (!hadNormals) geometry.computeVertexNormals();
      const vertexColors = Boolean(geometry.attributes.color);
      const material = new THREE.MeshStandardMaterial({
        color: vertexColors ? 0xffffff : 0xcfd6de,
        vertexColors,
        metalness: 0.22,
        roughness: 0.52,
        envMapIntensity: 1.1,
        // Un PLY sans normales (scan, sortie de logiciel) est souvent
        // retourné : face avant ET arrière visibles.
        side: THREE.DoubleSide,
        flatShading: !hadNormals,
      });
      return { object: new THREE.Mesh(geometry, material), animations: [] };
    }

    default:
      throw new Error(`format .${ext} non pris en charge`);
  }
}

function loadWith(loader, url, onProgress) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      resolve,
      onProgress,
      (error) => reject(error instanceof Error ? error : new Error(String(error)))
    );
  });
}
