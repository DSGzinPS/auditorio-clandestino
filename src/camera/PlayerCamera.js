// Câmera de cada jogador humano: 1ª pessoa enquanto controla, e durante o ragdoll
// 'chase' (persegue o tronco voando) ou 'head' (presa no tronco, girando junto).
// Layers do Three.js escondem o próprio corpo em 1ª pessoa. O viewmodel (arma na mão)
// usa os modelos 3D reais, com zoom de mira (ADS), recuo, recarga e soco animados.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { buildDuckMesh } from '../entities/ProjectileSystem.js';
import { GunModels } from '../entities/GunModels.js';

const BASE_FOV = 75;
const SPECIAL_BASE = new THREE.Vector3(0.17, -0.16, -0.42); // punhos, patinho, bola

export class PlayerCamera {
  constructor(index, character, arena, scene, playerCount = 2) {
    this.index = index;
    this.character = character;
    this.arena = arena;
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.03, 220);
    this.bodyLayer = 1 + index;
    this.viewmodelLayer = 1 + playerCount + index;

    const L = this.camera.layers;
    L.enable(0);
    for (let j = 0; j < playerCount; j++) if (j !== index) L.enable(1 + j); // corpo dos outros
    scene.add(this.camera); // necessário para o filho (viewmodel) renderizar

    this.viewmodel = null;
    this.viewId = null;
    this.forceFists = false; // desempate: só soco
    this.viewOverride = null;
    this.recoil = 0;
    this.punch = 0;
    this.adsT = 0;
    this.bob = 0;
    this.hip = new THREE.Vector3();
    this.adsPos = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._t = new THREE.Vector3();

    character.weapon.onFire = (def) => { this.recoil = def?.type === 'throw' ? 0.6 : Math.min(1.6, 0.6 + (def?.recoil?.[0] ?? 0.02) * 12); };
    character.weapon.onMelee = () => { this.punch = 1; };
  }

  /** Força recriar o viewmodel (ex.: quando os modelos terminam de carregar). */
  refresh() {
    this.viewId = null;
  }

  _syncViewmodel() {
    const override = this.viewOverride?.();
    const def = override ? { id: override, type: override }
      : this.forceFists ? { id: 'none', type: 'none' } : this.character.weapon.def;
    const key = `${def.id}:${GunModels.ready}`;
    if (key === this.viewId) return;
    if (this.viewmodel) this.camera.remove(this.viewmodel);
    const { group, hip, ads } = buildViewmodel(def);
    this.viewmodel = group;
    this.hip.copy(hip);
    this.adsPos.copy(ads);
    this.viewmodel.position.copy(hip);
    this.viewmodel.traverse((o) => { o.layers.set(this.viewmodelLayer); if (o.isMesh) o.castShadow = false; });
    this.camera.add(this.viewmodel);
    this.viewId = key;
    this.def = def;
  }

  update(dt) {
    const c = this.character;
    const cam = this.camera;
    const w = c.weapon;
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
        // chase: atrás de onde ele estava olhando, acima, sempre dentro do mapa.
        const t = this._t.set(torso.position.x, torso.position.y, torso.position.z);
        const desired = this._v.set(t.x + Math.sin(c.yaw) * 4.5, t.y + 2.2, t.z + Math.cos(c.yaw) * 4.5);
        this.arena.clampInside(desired, 0.6);
        cam.position.lerp(desired, 1 - Math.exp(-dt * 6));
        cam.lookAt(t);
        this._layers(true, false);
      }
    }

    // zoom de mira (ADS)
    const adsTarget = w.ads && !this.viewOverride?.() && !this.forceFists ? 1 : 0;
    this.adsT += (adsTarget - this.adsT) * (1 - Math.exp(-dt * 14));
    const fov = BASE_FOV + ((w.def.adsFov ?? BASE_FOV) - BASE_FOV) * this.adsT;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }

    // balanço ao andar, recuo, soco e recarga
    const v = c.controller.velocity;
    const speed = c.mode === 'controlled' ? Math.hypot(v.x, v.z) : 0;
    this.bob += dt * speed * 1.6;
    const bobAmt = Math.min(1, speed / 7) * (1 - this.adsT * 0.85);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.punch = Math.max(0, this.punch - dt * 5);
    const jab = Math.sin(this.punch * Math.PI);
    const rl = w.reloading > 0 ? Math.sin(w.reloadProgress * Math.PI) : 0;

    const vm = this.viewmodel;
    vm.position.lerpVectors(this.hip, this.adsPos, this.adsT);
    vm.position.x += Math.sin(this.bob) * 0.012 * bobAmt - jab * 0.08;
    vm.position.y += Math.abs(Math.cos(this.bob)) * 0.01 * bobAmt + jab * 0.04 - rl * 0.12;
    vm.position.z += this.recoil * 0.05 - jab * 0.28;
    vm.rotation.set(this.recoil * 0.12 - rl * 0.7, 0, rl * 0.35);

    // minigun: cano gira conforme acelera
    const barrels = vm.getObjectByName('barrels');
    if (barrels) barrels.rotation.z += dt * 45 * (w.spin ?? 0);
  }

  _layers(showOwnBody, showViewmodel) {
    const L = this.camera.layers;
    showOwnBody ? L.enable(this.bodyLayer) : L.disable(this.bodyLayer);
    showViewmodel ? L.enable(this.viewmodelLayer) : L.disable(this.viewmodelLayer);
  }
}

/** Monta o viewmodel. Retorna o grupo e as posições "no quadril" e "mirando". */
function buildViewmodel(def) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9d9e0, roughness: 0.7 });
  const special = (build) => {
    const inner = new THREE.Group();
    build(inner);
    inner.scale.setScalar(0.6);
    g.add(inner);
    return { group: g, hip: SPECIAL_BASE.clone(), ads: SPECIAL_BASE.clone() };
  };

  if (def.type === 'none' || def.id === 'none') {
    return special((inner) => {
      for (const s of [-1, 1]) {
        const fist = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.14), skin);
        fist.position.set(s * 0.22 - 0.1, -0.02, -0.05);
        inner.add(fist);
      }
    });
  }
  if (def.id === 'ball') {
    return special((inner) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 12), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7 }));
      ball.position.set(0.12, -0.04, -0.12); // canto da tela, sem tampar a mira
      inner.add(ball);
    });
  }
  if (def.id === 'grenade') {
    return special((inner) => {
      inner.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshStandardMaterial({ color: 0x3a7d2c, roughness: 0.6 })));
    });
  }
  if (def.id === 'duck') {
    return special((inner) => {
      const duck = buildDuckMesh(0.14);
      duck.position.set(0, 0.02, -0.05);
      duck.rotation.y = 0.4;
      inner.add(duck);
    });
  }

  // arma de verdade (modelo 3D)
  const len = def.viewLen ?? 0.4;
  const model = GunModels.make(def.model ?? 'none', len);
  const h = model.userData.height ?? len * 0.3;
  g.add(model);
  // no quadril: canto inferior direito, coronha perto da câmera
  // (modelo mais alto que comprido, tipo estilingue, vai mais pra frente pra não tampar a tela)
  const depth = Math.max(len * 0.5 + 0.1, h * 1.7);
  const hip = new THREE.Vector3(0.13, -0.1 - h * 0.35, -depth);
  // mirando: centralizada, o topo (alça de mira) na linha do olho
  const ads = new THREE.Vector3(0, -h * 0.42, -(depth - 0.05));
  return { group: g, hip, ads };
}
