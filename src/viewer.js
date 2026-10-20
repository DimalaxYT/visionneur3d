import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Scène three.js : rendu, éclairage studio, cadrage automatique,
 * grille de sol, ombres portées, rotation, captures.
 */
export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.modelRoot = null;
    this.mixer = null;
    this.animations = [];
    this.flight = null;
    this.home = null;
    this.modelRadius = 1;
    this.modelCenter = new THREE.Vector3();
    this.fitDistance = 0;
    this.homeDirection = new THREE.Vector3(1, 0.56, 1.15).normalize();
    this._lastTime = performance.now();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
    this.camera.position.set(3, 2, 4);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.8;
    this.controls.autoRotateSpeed = 0.9;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.1;
    this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI * 0.995;

    this._setupEnvironment();
    this._setupLights();
    this._setupFloor();

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();

    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.onContextLost?.();
    });

    this.renderer.setAnimationLoop(() => this._tick());
    this._tick();
  }

  _setupEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTexture = pmrem.fromScene(room, 0.04).texture;
    this.scene.environment = this.envTexture;
    room.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material?.dispose();
      }
    });
    pmrem.dispose();
  }

  _setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0x10151a, 0.7));

    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(6, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    this.keyLight = key;
    this.scene.add(key);
    this.scene.add(key.target);

    const rim = new THREE.DirectionalLight(0x9dbcff, 1.7);
    rim.position.set(-7, 4, -7);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight(0xe6ffb0, 0.55);
    fill.position.set(1, 2, 8);
    this.scene.add(fill);
  }

  _setupFloor() {
    // Grille procédurale qui s'estompe vers les bords.
    const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color('#93a2b5') },
        uOpacity: { value: 0.26 },
        uCells: { value: 48 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vPos;
        void main() {
          vPos = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vPos;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uCells;
        void main() {
          vec2 coord = vPos * uCells;
          vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
          float line = 1.0 - min(min(grid.x, grid.y), 1.0);
          float fade = smoothstep(0.98, 0.08, length(vPos));
          float alpha = line * fade * uOpacity;
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    this.grid = new THREE.Mesh(geometry, material);
    this.grid.rotation.x = -Math.PI / 2;
    this.grid.renderOrder = -1;
    this.scene.add(this.grid);

    const shadowGeo = new THREE.PlaneGeometry(2, 2);
    const shadowMat = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.46, transparent: true });
    // ShadowMaterial n'a pas d'alphaMap : on ajoute un fondu radial maison
    // pour éviter la découpe nette du bord de la shadow camera.
    shadowMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec2 vShadowPos;\nvoid main() {\n\tvShadowPos = position.xy;');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'varying vec2 vShadowPos;\nvoid main() {')
        .replace(
          'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
          'float fade = smoothstep( 0.92, 0.32, length( vShadowPos ) );\n\tgl_FragColor = vec4( color, opacity * fade * ( 1.0 - getShadowMask() ) );'
        );
    };
    this.shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.receiveShadow = true;
    this.scene.add(this.shadowPlane);
  }

  _tick() {
    const now = performance.now();
    const delta = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;

    if (this.flight) {
      const { fromPos, toPos, fromTarget, toTarget, start, duration } = this.flight;
      let t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(fromPos, toPos, eased);
      this.controls.target.lerpVectors(fromTarget, toTarget, eased);
      if (t >= 1) this.flight = null;
    }

    this.controls.update();
    this.mixer?.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);

    // Conserve le cadrage quand la fenêtre change de proportions
    // (rotation d'écran, barre d'outils…).
    if (this.modelRoot && this.fitDistance > 0) {
      const offset = this.camera.position.clone().sub(this.controls.target);
      const zoomRatio = offset.length() / this.fitDistance;
      this.fitDistance = this._fitDistanceToBox(this.modelBox, this.homeDirection);
      const direction = offset.normalize();
      this.camera.position.copy(this.controls.target).add(direction.multiplyScalar(this.fitDistance * zoomRatio));
      this.controls.update();
      this.home = {
        position: this.modelCenter.clone().add(this.homeDirection.clone().multiplyScalar(this.fitDistance)),
        target: this.modelCenter.clone(),
      };
    }
  }

  /**
   * Cadrage serré : cherche par dichotomie la plus petite distance pour
   * laquelle les 8 coins de la boîte englobante restent dans le champ.
   */
  _fitDistanceToBox(box, direction) {
    const center = box.getCenter(new THREE.Vector3());
    const dir = direction.clone().normalize();
    const size = box.getSize(new THREE.Vector3()).length();
    if (!Number.isFinite(size) || size <= 0) return 1;

    const corners = [];
    for (let i = 0; i < 8; i += 1) {
      corners.push(
        new THREE.Vector3(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z
        )
      );
    }

    const probe = new THREE.PerspectiveCamera(this.camera.fov, Math.max(this.camera.aspect, 0.2), 0.001, 10);
    const limit = 0.8; // le modèle occupe ~80 % du cadre, l'interface respire
    const overflow = (distance) => {
      probe.position.copy(center).addScaledVector(dir, distance);
      probe.lookAt(center);
      probe.updateMatrixWorld();
      probe.updateProjectionMatrix();
      let worst = 0;
      for (const corner of corners) {
        const projected = corner.clone().project(probe);
        worst = Math.max(worst, Math.abs(projected.x), Math.abs(projected.y));
      }
      return worst;
    };

    let near = size * 0.02;
    let far = size * 14;
    for (let i = 0; i < 32; i += 1) {
      const mid = (near + far) / 2;
      if (overflow(mid) > limit) near = mid;
      else far = mid;
    }
    return far;
  }

  frameObject(root) {
    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(0.5 * size.length(), 0.0001);

      this.modelRadius = radius;
      this.modelCenter.copy(center);
      this.modelBox = box.clone();

      const direction = new THREE.Vector3(1, 0.56, 1.15).normalize();
      const distance = this._fitDistanceToBox(box, direction);
      this.fitDistance = distance;
      this.homeDirection = direction.clone();
      const position = center.clone().add(direction.multiplyScalar(distance));

      this.camera.near = Math.max(distance / 2000, radius / 5000, 0.0001);
      this.camera.far = Math.max(distance * 60, 100);
      this.camera.position.copy(position);
      this.camera.updateProjectionMatrix();

      this.controls.target.copy(center);
      this.controls.minDistance = radius * 0.12;
      this.controls.maxDistance = radius * 22;
      this.controls.update();

      this.home = { position: position.clone(), target: center.clone() };

      // Sol + grille alignés sur la base du modèle.
      const floorY = box.min.y - radius * 0.002;
      this.grid.position.set(center.x, floorY, center.z);
      this.grid.scale.setScalar(radius * 3.6);
      this.shadowPlane.position.set(center.x, floorY - radius * 0.0006, center.z);
      this.shadowPlane.scale.setScalar(radius * 2.5);

      this._fitLightToBox(box, center, radius);
    }
  }

  _fitLightToBox(box, center, radius) {
    const light = this.keyLight;
    light.position.set(center.x + radius * 2.4, center.y + radius * 3.4, center.z + radius * 2.1);
    light.target.position.copy(center);
    light.target.updateMatrixWorld();

    const cam = light.shadow.camera;
    const extent = radius * 2.6;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = Math.max(radius * 0.05, 0.001);
    cam.far = radius * 14;
    cam.updateProjectionMatrix();
    light.shadow.bias = -0.0002;
    light.shadow.normalBias = Math.max(radius * 0.0015, 0.0001);
  }

  setModel(root, animations = []) {
    this.clearModel();
    this.modelRoot = root;
    this.scene.add(root);

    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const geometry = child.geometry;
      if (geometry && !geometry.attributes.normal) geometry.computeVertexNormals();
      if (geometry && !geometry.boundingSphere) geometry.computeBoundingSphere();
    });

    this.frameObject(root);

    this.animations = animations;
    if (animations.length) {
      this.mixer = new THREE.AnimationMixer(root);
      animations.forEach((clip) => this.mixer.clipAction(clip).play());
    }

    this.controls.autoRotate = false;
    this.controls.enabled = true;
  }

  clearModel() {
    if (!this.modelRoot) return;
    this.scene.remove(this.modelRoot);
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.animations = [];
    disposeObject(this.modelRoot);
    this.modelRoot = null;
    this.home = null;
  }

  resetView(animated = true) {
    if (!this.home) return;
    if (!animated) {
      this.camera.position.copy(this.home.position);
      this.controls.target.copy(this.home.target);
      this.controls.update();
      return;
    }
    this.flight = {
      fromPos: this.camera.position.clone(),
      toPos: this.home.position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: this.home.target.clone(),
      start: performance.now(),
      duration: 650,
    };
  }

  setAutoRotate(enabled) {
    this.controls.autoRotate = enabled;
  }

  setGridVisible(visible) {
    this.grid.visible = visible;
    this.shadowPlane.visible = visible;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      return document.documentElement.requestFullscreen?.().catch(() => {});
    }
    return document.exitFullscreen?.().catch(() => {});
  }

  async screenshot(filename = 'rendu-3d.png') {
    this.renderer.render(this.scene, this.camera);
    const source = this.renderer.domElement;
    const output = document.createElement('canvas');
    output.width = source.width;
    output.height = source.height;
    const ctx = output.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, output.width * 0.4, output.height);
    gradient.addColorStop(0, '#171d25');
    gradient.addColorStop(0.55, '#0d1116');
    gradient.addColorStop(1, '#070809');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, output.width, output.height);

    // Halo discret derrière le modèle, comme dans l'interface.
    const halo = ctx.createRadialGradient(
      output.width * 0.62,
      output.height * 0.32,
      0,
      output.width * 0.62,
      output.height * 0.32,
      output.width * 0.55
    );
    halo.addColorStop(0, 'rgba(108, 142, 186, 0.22)');
    halo.addColorStop(1, 'rgba(108, 142, 186, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, output.width, output.height);

    ctx.drawImage(source, 0, 0);

    const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Capture impossible');
    downloadBlob(blob, filename);
  }

  computeStats(root) {
    let triangles = 0;
    let vertices = 0;
    let meshes = 0;
    const materials = new Set();

    root.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      meshes += 1;
      const geometry = child.geometry;
      const position = geometry.attributes.position;
      const count = position ? position.count : 0;
      vertices += count;
      const instanceFactor = child.isInstancedMesh ? child.count : 1;
      const tris = geometry.index ? geometry.index.count / 3 : count / 3;
      triangles += Math.floor(tris) * instanceFactor;
      if (child.material) {
        (Array.isArray(child.material) ? child.material : [child.material]).forEach((m) => materials.add(m));
      }
    });

    return { triangles, vertices, meshes, materials: materials.size };
  }

  dispose() {
    this.clearModel();
    window.removeEventListener('resize', this._onResize);
    this.renderer.setAnimationLoop(null);
    this.grid.geometry.dispose();
    this.grid.material.dispose();
    this.shadowPlane.geometry.dispose();
    this.shadowPlane.material.dispose();
    this.envTexture?.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}

export function disposeObject(root) {
  const textures = new Set();
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const materials = child.material
      ? Array.isArray(child.material)
        ? child.material
        : [child.material]
      : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value && value.isTexture) textures.add(value);
      });
      material.dispose?.();
    });
  });
  textures.forEach((texture) => texture.dispose());
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export { THREE };
