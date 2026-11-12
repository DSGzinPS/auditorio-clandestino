// Gerenciador de mapas: monta/desmonta o cenário (corpos estáticos, luzes,
// obstáculos móveis) e oferece spawns, limites e utilidades para os estados.
// Os mapas em si ficam em world/maps.js.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUP } from '../physics/PhysicsWorld.js';
import { MAPS } from './maps.js';

export class Arena {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bodies = [];
    this.movers = [];
    this.knocks = [];
    this.time = 0;
    this.mapId = null;
    this.def = null;
    this.shadows = true;
    this.keyLight = null;
    this.setMap('estudio');
  }

  // ---------------------------------------------------------------- troca de mapa
  setMap(id) {
    if (id === this.mapId) return;
    const def = MAPS[id];
    if (!def) throw new Error(`Mapa desconhecido: ${id}`);
    this._clear();
    this.mapId = id;
    this.def = def;
    this.W = def.size.W;
    this.D = def.size.D;
    this.H = def.size.H;
    this.extras = {};
    if (this.scene.background?.isColor && def.background !== undefined) this.scene.background.setHex(def.background);
    def.build(this);
    this.spawns = def.spawns.map((s) => ({ position: new CANNON.Vec3(s.x, 0, s.z), yaw: s.yaw }));
  }

  _clear() {
    for (const b of this.bodies) this.physics.removeBody(b);
    this.bodies = [];
    this.movers = [];
    this.knocks = [];
    this.group.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    this.group.clear();
  }

  /** Spawn de minigame/quiz para o jogador i. */
  spawnFor(index) {
    const s = this.spawns[index % this.spawns.length];
    const extra = Math.floor(index / this.spawns.length); // >2 jogadores: lado a lado
    return { position: new CANNON.Vec3(s.position.x + extra * 2.2, 0, s.position.z), yaw: s.yaw };
  }

  /** Spawn de PvP: times em lados opostos, colegas lado a lado. */
  pvpSpawn(player, slot = 0) {
    const side = player.team % 2 === 0 ? 1 : -1;
    const x = (slot % 2 === 0 ? 1 : -1) * Math.ceil(slot / 2) * 2.2;
    return { position: new CANNON.Vec3(x, 0, side * this.def.pvpZ), yaw: side > 0 ? 0 : Math.PI };
  }

  /** Desempate: frente a frente, pertinho, no centro. */
  duelSpawn(index, count) {
    const a = (index / count) * Math.PI * 2;
    const c = this.def.duelCenter ?? { x: 0, z: 0 };
    return { position: new CANNON.Vec3(c.x + Math.sin(a) * 3, 0, c.z + Math.cos(a) * 3), yaw: a };
  }

  /** Prende um ponto (Vec3 do cannon ou Vector3 do three) dentro do mapa. */
  clampInside(v, margin = 0.5) {
    const c = (val, lim) => Math.max(-lim, Math.min(lim, val));
    v.x = c(v.x, this.W / 2 - margin);
    v.z = c(v.z, this.D / 2 - margin);
    v.y = Math.max(margin, Math.min(this.H - margin, v.y));
    return v;
  }

  // ---------------------------------------------------------------- construtores usados pelos mapas
  mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts });
  }

  /** Caixa estática com física. */
  box(w, h, d, x, y, z, color, { cast = true, visible = true, rotY = 0, material } = {}) {
    const body = new CANNON.Body({
      mass: 0,
      material: this.physics.materials.ground,
      collisionFilterGroup: GROUP.ENV,
      collisionFilterMask: -1,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.set(x, y, z);
    if (rotY) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotY);
    this.physics.addBody(body);
    this.bodies.push(body);
    if (visible) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material ?? this.mat(color));
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotY;
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    return body;
  }

  /** Esfera estática (aro da cesta). */
  sphere(r, x, y, z, color) {
    const body = new CANNON.Body({ mass: 0, material: this.physics.materials.ground, collisionFilterGroup: GROUP.ENV, collisionFilterMask: -1 });
    body.addShape(new CANNON.Sphere(r));
    body.position.set(x, y, z);
    this.physics.addBody(body);
    this.bodies.push(body);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), this.mat(color, { roughness: 0.4 }));
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    return body;
  }

  /** Só visual (faixas, pintura do chão…). */
  decal(w, h, d, x, y, z, color, rotY = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /** Chão, paredes e teto (o teto pode ser invisível, mas sempre existe fisicamente). */
  shell({ floor, wall, ceil, T = 2, ceilingVisible = true, grid = true }) {
    const { W, D, H } = this;
    this.box(W + 2 * T, T, D + 2 * T, 0, -T / 2, 0, floor, { cast: false });
    this.box(W + 2 * T, T, D + 2 * T, 0, H + T / 2, 0, ceil, { cast: false, visible: ceilingVisible });
    this.box(T, H, D + 2 * T, -W / 2 - T / 2, H / 2, 0, wall, { cast: false });
    this.box(T, H, D + 2 * T, W / 2 + T / 2, H / 2, 0, wall, { cast: false });
    this.box(W, H, T, 0, H / 2, -D / 2 - T / 2, wall, { cast: false });
    this.box(W, H, T, 0, H / 2, D / 2 + T / 2, wall, { cast: false });
    if (grid) {
      const g = new THREE.GridHelper(Math.max(W, D), Math.max(W, D), 0x77748a, 0x47454f);
      g.position.y = 0.01;
      this.group.add(g);
    }
  }

  lights({ hemi = 1.1, key = 1.6, colors = [0xff2e88, 0x3dd6ff, 0xffd23f, 0x8a5cff], point = 60 } = {}) {
    const { W, D, H } = this;
    this.group.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2233, hemi));
    const k = new THREE.DirectionalLight(0xffffff, key);
    k.position.set(W * 0.25, H - 0.5, D * 0.18);
    k.castShadow = this.shadows;
    k.shadow.mapSize.set(2048, 2048);
    this.keyLight = k;
    const r = Math.max(W, D) * 0.65;
    Object.assign(k.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: H + 40 });
    this.group.add(k);
    this.group.add(k.target);
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], i) => {
      const l = new THREE.PointLight(colors[i % colors.length], point, Math.max(W, D), 2);
      l.position.set(sx * (W / 2 - 2), H - 1.2, sz * (D / 2 - 2));
      this.group.add(l);
    });
  }

  sign(lines, { x = 0, y = 5.8, z, rotY = 0, w = 10, h = 2.5, bg = '#ff2e88', fg = '#ffd23f' }) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach(([text, size], i) => {
      ctx.font = `900 ${size}px system-ui, sans-serif`;
      ctx.fillText(text, 512, lines.length === 1 ? 128 : 82 + i * 98);
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this.group.add(mesh);
  }

  // ---------------------------------------------------------------- obstáculos móveis
  /**
   * Corpo cinemático que derruba (sem dano) quem encostar.
   * @param kind 'spin' (gira no eixo Y) | 'slide' (vai e volta em X) | 'car' (anda em X e dá a volta)
   * @param knock força do empurrão (1 = tiro cheio)
   */
  mover({ kind, shapes, mesh, x = 0, y = 0, z = 0, knock = 1, speed = 1, amplitude = 0, period = 4, phase = 0, limit = 22 }) {
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      material: this.physics.materials.ground,
      collisionFilterGroup: GROUP.ENV,
      collisionFilterMask: -1 & ~GROUP.ENV,
    });
    for (const s of shapes) body.addShape(s.shape, s.offset);
    body.position.set(x, y, z);
    this.physics.addBody(body, mesh);
    this.bodies.push(body);
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(mesh);
    const m = { kind, body, origin: { x, y, z }, knock, speed, amplitude, period, phase, limit, cooldown: new Map() };
    body.addEventListener('collide', (e) => this._onMoverHit(m, e));
    this.movers.push(m);
    return m;
  }

  _onMoverHit(m, e) {
    const ch = e.body?.userData?.character;
    if (!ch || ch.mode !== 'controlled' || ch.dead) return;
    const last = m.cooldown.get(ch) ?? -Infinity;
    if (this.time - last < 0.6) return;
    m.cooldown.set(ch, this.time);
    const c = ch.controller.position, b = m.body.position;
    let dx = c.x - b.x, dz = c.z - b.z;
    if (m.kind === 'car') { dx = Math.sign(m.speed) * 2 + dx * 0.3; dz *= 0.6; }
    if (m.kind === 'spin') { // empurra no sentido do giro
      const tx = -dz * Math.sign(m.speed), tz = dx * Math.sign(m.speed);
      dx = dx * 0.4 + tx; dz = dz * 0.4 + tz;
    }
    const len = Math.hypot(dx, dz) || 1;
    this.knocks.push({ character: ch, direction: { x: dx / len, y: 0, z: dz / len }, scale: m.knock });
  }

  /** Antes do passo físico: velocidades dos obstáculos. */
  update(dt) {
    this.time += dt;
    for (const m of this.movers) {
      const b = m.body;
      if (m.kind === 'spin') {
        b.angularVelocity.set(0, m.speed, 0);
      } else if (m.kind === 'slide') {
        const w = (Math.PI * 2) / m.period;
        const target = m.origin.x + Math.sin(this.time * w + m.phase) * m.amplitude;
        b.velocity.set((target - b.position.x) / Math.max(dt, 1e-3), 0, 0);
      } else if (m.kind === 'car') {
        b.velocity.set(m.speed, 0, 0);
        if (m.speed > 0 && b.position.x > m.limit) b.position.x = -m.limit;
        if (m.speed < 0 && b.position.x < -m.limit) b.position.x = m.limit;
      }
    }
  }

  drainKnocks(fn) {
    const k = this.knocks;
    this.knocks = [];
    k.forEach(fn);
  }
}
