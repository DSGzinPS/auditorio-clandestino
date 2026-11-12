// Câmera de cada jogador humano: 1ª pessoa enquanto controla, e durante o ragdoll
// 'chase' (persegue o tronco voando) ou 'head' (presa no tronco, girando junto).
// Layers do Three.js escondem o próprio corpo em 1ª pessoa; o viewmodel (arma na
// mão) muda conforme a arma equipada.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { buildDuckMesh } from '../entities/ProjectileSystem.js';

const VIEWMODEL_BASE = new THREE.Vector3(0.17, -0.16, -0.42);

export class PlayerCamera {
  constructor(index, character, arena, scene, playerCount = 2) {
    this.index = index;
    this.character = character;
    this.arena = arena;
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
    this.bodyLayer = 1 + index;
    this.viewmodelLayer = 1 + playerCount + index;

    const L = this.camera.layers;
    L.enable(0);
    for (let j = 0; j < playerCount; j++) if (j !== index) L.enable(1 + j); // corpo dos outros
    scene.add(this.camera); // necessário para o filho (viewmodel) renderizar

    this.viewmodel = null;
    this.viewId = null;
    this.forceFists = false; // desempate: só soco
    this.recoil = 0;
    this.punch = 0;
    this._v = new THREE.Vector3();
    this._t = new THREE.Vector3();

    character.weapon.onFire = (def) => { this.recoil = def?.type === 'throw' ? 0.6 : 1; };
    character.weapon.onMelee = () => { this.punch = 1; };
  }

  _syncViewmodel() {
    const def = this.forceFists ? { id: 'none', type: 'none' } : this.character.weapon.def;
    if (def.id === this.viewId) return;
    if (this.viewmodel) this.camera.remove(this.viewmodel);
    this.viewmodel = buildViewmodel(def, this.character.color);
    this.viewmodel.position.copy(VIEWMODEL_BASE);
    this.viewmodel.scale.setScalar(0.6);
    this.viewmodel.traverse((o) => o.layers.set(this.viewmodelLayer));
    this.camera.add(this.viewmodel);
    this.viewId = def.id;
  }

  update(dt) {
    const c = this.character;
    const cam = this.camera;
    this._syncViewmodel();

    if (c.mode === 'controlled') {
      c.getEyePosition(cam.position);
      cam.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
      this._layers(false, true);
    } else {
      const torso = c.parts.torso.body;
      if (CONFIG.character.ragdollCamera === 'head') {
        c.getEyePosition(cam.position);
        cam.quaternion.copy(torso.quaternion);
        this._layers(false, false);
      } else {
        // chase: atrás de onde ele estava olhando, acima, sempre dentro do estúdio.
        // lerp a partir da última posição (os olhos) → transição suave 1ª → 3ª pessoa
        const t = this._t.set(torso.position.x, torso.position.y, torso.position.z);
        const desired = this._v.set(t.x + Math.sin(c.yaw) * 4.5, t.y + 2.2, t.z + Math.cos(c.yaw) * 4.5);
        this.arena.clampInside(desired, 0.6);
        cam.position.lerp(desired, 1 - Math.exp(-dt * 6));
        cam.lookAt(t);
        this._layers(true, false);
      }
    }

    // recuo e soco no viewmodel
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.punch = Math.max(0, this.punch - dt * 5);
    const jab = Math.sin(this.punch * Math.PI);
    this.viewmodel.position.set(
      VIEWMODEL_BASE.x - jab * 0.08,
      VIEWMODEL_BASE.y + jab * 0.04,
      VIEWMODEL_BASE.z + this.recoil * 0.09 - jab * 0.28,
    );
    this.viewmodel.rotation.x = this.recoil * 0.18;
  }

  _layers(showOwnBody, showViewmodel) {
    const L = this.camera.layers;
    showOwnBody ? L.enable(this.bodyLayer) : L.disable(this.bodyLayer);
    showViewmodel ? L.enable(this.viewmodelLayer) : L.disable(this.viewmodelLayer);
  }
}

function buildViewmodel(def, playerColor) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2a33, roughness: 0.5, metalness: 0.2 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9d9e0, roughness: 0.7 });

  if (def.type === 'none') {
    // dois punhos (os "bracinhos" brancos do boneco)
    for (const s of [-1, 1]) {
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.14), skin);
      fist.position.set(s * 0.22 - 0.1, -0.02, -0.05);
      g.add(fist);
    }
    return g;
  }
  if (def.id === 'duck') {
    const duck = buildDuckMesh(0.14);
    duck.position.set(0, 0.02, -0.05);
    duck.rotation.y = 0.4;
    g.add(duck);
    return g;
  }

  const len = def.view?.len ?? 0.42, thick = def.view?.thick ?? 0.1;
  const accent = new THREE.MeshStandardMaterial({ color: def.color ?? playerColor, roughness: 0.5 });
  if (def.id === 'cannon') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.6, thick * 0.75, len, 14), accent);
    tube.rotation.x = Math.PI / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.78, thick * 0.78, 0.05, 14), dark);
    band.rotation.x = Math.PI / 2;
    band.position.z = 0.12;
    g.add(tube, band);
  } else {
    const block = new THREE.Mesh(new THREE.BoxGeometry(thick, thick * 1.2, len), dark);
    const top = new THREE.Mesh(new THREE.BoxGeometry(thick * 1.05, thick * 0.3, len * 0.7), accent);
    top.position.y = thick * 0.7;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.25, thick * 0.25, 0.16, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -len / 2 - 0.07;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), dark);
    grip.position.set(0, -0.11, len * 0.22);
    grip.rotation.x = 0.25;
    g.add(block, top, barrel, grip);
  }
  return g;
}
