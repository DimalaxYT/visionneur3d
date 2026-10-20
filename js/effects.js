// Effets d'allumage : mèche qui brûle, étincelles, comètes projetées.
import * as THREE from 'three';
import { fuseCurve, M } from './candle.js';

const STAR_COLORS = [
  0xff5533, 0xffc233, 0x66ff88, 0x66ccff,
  0xff66cc, 0xffe28a, 0x8affd4, 0xff8844,
  0xaaff55, 0xff4466,
];

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,230,170,0.9)');
  grad.addColorStop(0.6, 'rgba(255,150,60,0.32)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Ignition {
  constructor(root, statusEl) {
    // Les effets sont enfants du modèle : la mèche et les comètes restent
    // alignées au produit même lorsqu'il est présenté en diagonale.
    this.scene = root;
    root.updateMatrixWorld(true);
    const worldQ = root.getWorldQuaternion(new THREE.Quaternion());
    this.gravity = new THREE.Vector3(0, -1, 0).applyQuaternion(worldQ.invert());
    this.statusEl = statusEl;
    this.active = false;
    this.phase = 'idle';     // idle | fuse | firing | done
    this.t = 0;
    this.fuseT = 0;
    this.shotIndex = 0;
    this.nextShot = 0;
    this.stars = [];
    this.sparks = null;
    this.sparkData = [];
    this.glowTex = glowTexture();

    // lumière de la mèche / de la bouche
    this.fuseLight = new THREE.PointLight(0xff8833, 0, 0.28, 2);
    scene.add(this.fuseLight);
    this.muzzleLight = new THREE.PointLight(0xffaa55, 0, 0.9, 2);
    scene.add(this.muzzleLight);

    // sprite d'éclat à la bouche
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xffc277,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
    }));
    this.flash.scale.setScalar(0.12);
    this.flash.position.set(0, M.Y_TOP + 0.01, 0);
    scene.add(this.flash);

    this._buildSparkPool();
  }

  _buildSparkPool() {
    const n = 90;
    const pos = new Float32Array(n * 3);
    this.sparkData = [];
    for (let i = 0; i < n; i++) {
      pos.set([0, -10, 0], i * 3);
      this.sparkData.push({ life: 0, vel: new THREE.Vector3() });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({
      map: this.glowTex, size: 0.012, color: 0xffc060,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      sizeAttenuation: true,
    }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
  }

  setStatus(msg) {
    if (!this.statusEl) return;
    this.statusEl.textContent = msg;
    this.statusEl.classList.remove('hidden');
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => this.statusEl.classList.add('hidden'), 4200);
  }

  start() {
    if (this.phase === 'fuse') return;
    this.reset();
    this.active = true;
    this.phase = 'fuse';
    this.fuseT = 0;
    this.setStatus('Mèche allumée… attention, ça va partir !');
  }

  reset() {
    this.phase = 'idle';
    this.active = false;
    this.t = 0;
    this.fuseT = 0;
    this.shotIndex = 0;
    for (const s of this.stars) {
      this.scene.remove(s.mesh, s.trail, s.light);
      s.mesh.material.dispose();
      s.trail.geometry.dispose();
      s.trail.material.dispose();
    }
    this.stars = [];
    this.fuseLight.intensity = 0;
    this.muzzleLight.intensity = 0;
    this.flash.material.opacity = 0;
    const pos = this.sparks.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, 0, -10, 0);
      this.sparkData[i].life = 0;
    }
    pos.needsUpdate = true;
    if (this._burnDot) {
      this.scene.remove(this._burnDot);
      this._burnDot = null;
    }
    this.setStatus('Modèle réinitialisé.');
  }

  _spawnStar() {
    const color = new THREE.Color(STAR_COLORS[this.shotIndex % STAR_COLORS.length]);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 12, 10),
      new THREE.MeshBasicMaterial({ color })
    );
    const start = new THREE.Vector3(0, M.Y_TOP + 0.008, 0);
    mesh.position.copy(start);

    // traînée : ruban de points
    const n = 26;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([start.x, start.y, start.z], i * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(mesh, trail);

    const light = new THREE.PointLight(color, 1.4, 0.55, 2);
    light.position.copy(start);
    this.scene.add(light);

    const angle = Math.random() * Math.PI * 2;
    const spread = 0.14 + Math.random() * 0.16;
    this.stars.push({
      mesh, trail, light,
      vel: new THREE.Vector3(Math.cos(angle) * spread, 1.35 + Math.random() * 0.45, Math.sin(angle) * spread),
      age: 0,
      life: 2.1 + Math.random() * 0.7,
    });

    // flash + étincelles à la bouche
    this.flash.material.opacity = 1;
    this.flash.scale.setScalar(0.10 + Math.random() * 0.05);
    this.muzzleLight.intensity = 3.2;

    const pos = this.sparks.geometry.attributes.position;
    let spawned = 0;
    for (let i = 0; i < pos.count && spawned < 14; i++) {
      const s = this.sparkData[i];
      if (s.life > 0) continue;
      s.life = 0.35 + Math.random() * 0.35;
      s.vel.set((Math.random() - 0.5) * 0.55, 0.35 + Math.random() * 0.65, (Math.random() - 0.5) * 0.55);
      pos.setXYZ(i, 0, M.Y_TOP + 0.01, 0);
      spawned++;
    }
    pos.needsUpdate = true;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;

    // ---- phase mèche ----
    if (this.phase === 'fuse') {
      this.fuseT += dt / 3.2;                 // ~3,2 s de mèche
      const curve = fuseCurve();
      const p = curve.getPoint(Math.min(this.fuseT, 1));
      if (!this._burnDot) {
        this._burnDot = new THREE.Mesh(
          new THREE.SphereGeometry(0.0026, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xffdd88 })
        );
        this.scene.add(this._burnDot);
      }
      this._burnDot.position.copy(p);
      this._burnDot.scale.setScalar(1 + 0.5 * Math.random());
      this.fuseLight.position.copy(p);
      this.fuseLight.intensity = 0.7 + Math.random() * 0.6;

      // étincelles de la mèche
      const pos = this.sparks.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const s = this.sparkData[i];
        if (s.life > 0) continue;
        if (Math.random() > 0.35) continue;
        s.life = 0.25 + Math.random() * 0.3;
        s.vel.set((Math.random() - 0.5) * 0.35, Math.random() * 0.45, (Math.random() - 0.5) * 0.35);
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;

      if (this.fuseT >= 1) {
        this.phase = 'firing';
        this.shotIndex = 0;
        this.nextShot = 0;
        if (this._burnDot) {
          this.scene.remove(this._burnDot);
          this._burnDot = null;
        }
        this.fuseLight.intensity = 0;
        this.setStatus('Décollage des comètes !');
      }
    }

    // ---- phase tirs ----
    if (this.phase === 'firing') {
      this.nextShot -= dt;
      if (this.nextShot <= 0 && this.shotIndex < 10) {
        this._spawnStar();
        this.shotIndex++;
        this.nextShot = 1.15;
      }
      if (this.shotIndex >= 10 && this.stars.length === 0) {
        this.phase = 'done';
        this.active = false;
        this.setStatus('Fin du tir — rechargez la chandelle pour recommencer.');
      }
    }

    // ---- physique des comètes ----
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i];
      s.age += dt;
      s.vel.addScaledVector(this.gravity, 1.55 * dt);
      s.mesh.position.addScaledVector(s.vel, dt);
      s.light.position.copy(s.mesh.position);

      // mise à jour de la traînée
      const pos = s.trail.geometry.attributes.position;
      for (let k = pos.count - 1; k > 0; k--) {
        pos.setXYZ(k, pos.getX(k - 1), pos.getY(k - 1), pos.getZ(k - 1));
      }
      pos.setXYZ(0, s.mesh.position.x, s.mesh.position.y, s.mesh.position.z);
      pos.needsUpdate = true;

      const fade = Math.max(0, 1 - s.age / s.life);
      s.mesh.material.opacity = fade;
      s.mesh.material.transparent = true;
      s.trail.material.opacity = 0.85 * fade;
      s.light.intensity = 1.4 * fade;

      if (s.age > s.life || s.mesh.position.y < -0.05) {
        this.scene.remove(s.mesh, s.trail, s.light);
        s.mesh.material.dispose();
        s.trail.geometry.dispose();
        s.trail.material.dispose();
        this.stars.splice(i, 1);
      }
    }

    // ---- étincelles en vol ----
    const pos = this.sparks.geometry.attributes.position;
    let dirty = false;
    for (let i = 0; i < pos.count; i++) {
      const s = this.sparkData[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        pos.setXYZ(i, 0, -10, 0);
        dirty = true;
        continue;
      }
      s.vel.addScaledVector(this.gravity, 1.9 * dt);
      pos.setXYZ(i, pos.getX(i) + s.vel.x * dt, pos.getY(i) + s.vel.y * dt, pos.getZ(i) + s.vel.z * dt);
      dirty = true;
    }
    if (dirty) pos.needsUpdate = true;

    // extinction des éclats
    this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 4.5);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 8);
  }
}
