// Biblioteca de modelos de armas.
// • Modelos do Quaternius (CC0): carregados dos .glb, normalizados com o cano
//   apontando para -Z, centralizados e com comprimento 1 (depois escala por arma).
// • RPG-7, minigun e estilingue: feitos em código no mesmo estilo (cores chapadas).
// Sem os modelos carregados (testes no Node), make() devolve uma caixa simples.

import * as THREE from 'three';

const cache = new Map(); // nome → Object3D normalizado (comprimento 1 em Z)
let loading = null;

const flat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1, ...opts });

function normalize(obj) {
  const wrap = new THREE.Group();
  obj.rotation.y = Math.PI / 2; // cano em +X no arquivo → -Z (frente)
  wrap.add(obj);
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  obj.position.sub(c);
  const s = 1 / size.z;
  const out = new THREE.Group();
  wrap.scale.setScalar(s);
  out.add(wrap);
  out.userData.height = size.y * s;
  out.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      if (o.material) o.material = o.material.clone();
    }
  });
  return out;
}

// ---------------------------------------------------------------- modelos em código
function procRpg() {
  const g = new THREE.Group();
  const green = flat(0x556b2f), wood = flat(0x7a4a24), dark = flat(0x222222, { metalness: 0.4 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 12), dark);
  tube.rotation.x = Math.PI / 2;
  tube.position.z = 0.08;
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 12), wood);
  guard.rotation.x = Math.PI / 2;
  guard.position.z = 0.02;
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.1, 12), dark);
  bell.rotation.x = Math.PI / 2;
  bell.position.z = 0.48;
  const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.16, 12), green);
  warhead.rotation.x = -Math.PI / 2;
  warhead.position.z = -0.4;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.04, 0.12, 12), green);
  body.rotation.x = Math.PI / 2;
  body.position.z = -0.27;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), wood);
  grip.position.set(0, -0.07, 0.0);
  const grip2 = grip.clone();
  grip2.position.z = 0.14;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.05), dark);
  sight.position.set(0.035, 0.05, -0.05);
  g.add(tube, guard, bell, warhead, body, grip, grip2, sight);
  return normalizeProc(g);
}

function procMinigun() {
  const g = new THREE.Group();
  const metal = flat(0x3a3a40, { metalness: 0.6, roughness: 0.4 }), dark = flat(0x1a1a1a), yellow = flat(0xc9a227);
  const barrels = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8), metal);
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.15);
    barrels.add(b);
  }
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), dark);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = -0.38;
  barrels.add(ring);
  barrels.name = 'barrels';
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.25), metal);
  housing.position.z = 0.25;
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12), dark);
  motor.rotation.x = Math.PI / 2;
  motor.position.set(0, 0.09, 0.25);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), dark);
  handle.position.set(0, -0.12, 0.3);
  const ammo = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), yellow);
  ammo.position.set(-0.11, -0.03, 0.27);
  const top = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 14, Math.PI), dark);
  top.position.set(0, 0.08, 0.12);
  g.add(barrels, housing, motor, handle, ammo, top);
  return normalizeProc(g);
}

function procSlingshot() {
  const g = new THREE.Group();
  const wood = flat(0x8a5a2b), band = flat(0xcc3333);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.12, 8), wood);
  handle.position.set(0, -0.08, 0.02);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.1, 8), wood);
    arm.position.set(s * 0.03, 0.01, 0);
    arm.rotation.z = -s * 0.5;
    g.add(arm);
    const rubber = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.13, 6), band);
    rubber.rotation.x = Math.PI / 2 - 0.3;
    rubber.position.set(s * 0.05, 0.04, 0.06);
    g.add(rubber);
  }
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.02), flat(0x4a3020));
  pouch.position.set(0, 0.02, 0.12);
  g.add(handle, pouch);
  return normalizeProc(g);
}

function normalizeProc(g) {
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  g.position.sub(c);
  const wrap = new THREE.Group();
  wrap.add(g);
  wrap.scale.setScalar(1 / size.z);
  const out = new THREE.Group();
  out.add(wrap);
  out.userData.height = size.y / size.z;
  out.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return out;
}

const PROC = { 'proc:rpg': procRpg, 'proc:minigun': procMinigun, 'proc:slingshot': procSlingshot };

export const GunModels = {
  get ready() {
    return cache.size > 0;
  },

  /** Carrega os .glb (navegador). Pode ser chamado várias vezes. */
  load() {
    if (loading) return loading;
    loading = (async () => {
      for (const [k, fn] of Object.entries(PROC)) cache.set(k, fn());
      const [{ GUN_URLS }, { GLTFLoader }] = await Promise.all([
        import('./gunAssets.js'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
      ]);
      const loader = new GLTFLoader();
      await Promise.all(Object.entries(GUN_URLS).map(async ([name, url]) => {
        try {
          const gltf = await loader.loadAsync(url);
          cache.set(name, normalize(gltf.scene));
        } catch (e) {
          console.warn('modelo não carregou', name, e);
        }
      }));
    })();
    return loading;
  },

  /** Cópia do modelo com o comprimento pedido (m). */
  make(model, length) {
    const base = cache.get(model);
    if (!base) {
      const fallback = new THREE.Mesh(new THREE.BoxGeometry(length * 0.18, length * 0.25, length), flat(0x2b2a33));
      fallback.userData.height = 0.25;
      return fallback;
    }
    const m = base.clone(true);
    m.scale.setScalar(length);
    m.userData.height = (base.userData.height ?? 0.3) * length;
    return m;
  },
};
