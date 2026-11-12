// Estúdio greybox: chão, paredes, TETO (alvo da punição), púlpitos e coberturas.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { GROUP } from '../physics/PhysicsWorld.js';

export class Arena {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    const { width: W, depth: D, height: H, wallThickness: T } = CONFIG.arena;
    Object.assign(this, { W, D, H });

    const floor = 0x55535e, wall = 0x3b3846, ceil = 0x2a2733, prop = 0x8a8796, podium = 0xffd23f;

    // Estrutura (topo do chão em y = 0)
    this._box(W + 2 * T, T, D + 2 * T, 0, -T / 2, 0, floor, false);
    this._box(W + 2 * T, T, D + 2 * T, 0, H + T / 2, 0, ceil, false);
    this._box(T, H, D + 2 * T, -W / 2 - T / 2, H / 2, 0, wall, false);
    this._box(T, H, D + 2 * T, W / 2 + T / 2, H / 2, 0, wall, false);
    this._box(W, H, T, 0, H / 2, -D / 2 - T / 2, wall, false);
    this._box(W, H, T, 0, H / 2, D / 2 + T / 2, wall, false);

    // Púlpitos do quiz (na frente de cada spawn)
    this._box(1.6, 1.1, 0.6, 0, 0.55, 6.6, podium);
    this._box(1.6, 1.1, 0.6, 0, 0.55, -6.6, podium);

    // Coberturas para o combate
    this._box(2, 2, 2, -6, 1, 0, prop);
    this._box(2, 2, 2, 6, 1, 0, prop);
    this._box(3, 1.4, 1, -5, 0.7, -9, prop);
    this._box(3, 1.4, 1, 5, 0.7, 9, prop);
    this._box(1, 3.5, 1, -2.5, 1.75, -3, prop);
    this._box(1, 3.5, 1, 2.5, 1.75, 3, prop);

    const grid = new THREE.GridHelper(Math.max(W, D), Math.max(W, D), 0x77748a, 0x47454f);
    grid.position.y = 0.01;
    scene.add(grid);

    this._lights(W, D, H);
    if (typeof document !== 'undefined') {
      this._sign(-D / 2 + 0.02, 0);
      this._sign(D / 2 - 0.02, Math.PI);
    }

    // Posições no CHÃO + direção inicial (frente a frente)
    this.spawns = [
      { position: new CANNON.Vec3(0, 0, 8), yaw: 0 },
      { position: new CANNON.Vec3(0, 0, -8), yaw: Math.PI },
    ];
  }

  _box(w, h, d, x, y, z, color, cast = true) {
    const body = new CANNON.Body({
      mass: 0,
      material: this.physics.materials.ground,
      collisionFilterGroup: GROUP.ENV,
      collisionFilterMask: -1,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.set(x, y, z);
    this.physics.addBody(body);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return body;
  }

  _lights(W, D, H) {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2233, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(6, H - 0.5, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 0.5, far: 40 });
    s.add(key);
    // "luzes de palco" coloridas nos cantos
    const colors = [0xff2e88, 0x3dd6ff, 0xffd23f, 0x8a5cff];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], i) => {
      const l = new THREE.PointLight(colors[i], 60, 26, 2);
      l.position.set(sx * (W / 2 - 2), H - 1.2, sz * (D / 2 - 2));
      s.add(l);
    });
  }

  _sign(z, rotY) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff2e88';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#ffd23f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 76px system-ui, sans-serif';
    ctx.fillText('PROGRAMA DE AUDITÓRIO', 512, 82);
    ctx.font = '900 104px system-ui, sans-serif';
    ctx.fillText('CLANDESTINO', 512, 180);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: tex }));
    mesh.position.set(0, 5.8, z);
    mesh.rotation.y = rotY;
    this.scene.add(mesh);
  }

  /** Spawn de PvP: times em lados opostos, colegas lado a lado. */
  pvpSpawn(player, slot = 0) {
    const side = player.team % 2 === 0 ? 1 : -1;
    const x = (slot % 2 === 0 ? 1 : -1) * Math.ceil(slot / 2) * 2.2;
    return { position: new CANNON.Vec3(x, 0, side * 12.5), yaw: side > 0 ? 0 : Math.PI };
  }

  /** Desempate: frente a frente, pertinho. */
  duelSpawn(index, count) {
    const a = (index / count) * Math.PI * 2;
    const pos = new CANNON.Vec3(Math.sin(a) * 3, 0, Math.cos(a) * 3);
    return { position: pos, yaw: a }; // olhando para o centro
  }

  /** Prende um ponto (Vec3 do cannon ou Vector3 do three) dentro do estúdio. */
  clampInside(v, margin = 0.5) {
    const c = (val, lim) => Math.max(-lim, Math.min(lim, val));
    v.x = c(v.x, this.W / 2 - margin);
    v.z = c(v.z, this.D / 2 - margin);
    v.y = Math.max(margin, Math.min(this.H - margin, v.y));
    return v;
  }
}
