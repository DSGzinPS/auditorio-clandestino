// Projéteis físicos (bolinhas, chumbinhos, melancias e o patinho).
// Colisões viram "hits" pendentes, processados FORA do passo físico
// (mudar tipo de corpo dentro do callback de colisão do cannon dá bug).

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { GROUP } from '../physics/PhysicsWorld.js';

const HEAD_ZONE = 0.42; // acima do centro do controller = cabeça (topo do tronco + antena/fone)

export class ProjectileSystem {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.items = [];
    this.pendingHits = [];
    this.sphere = new THREE.SphereGeometry(1, 14, 10);
    this.materials = new Map();
  }

  _material(color) {
    if (!this.materials.has(color)) {
      this.materials.set(color, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 }));
    }
    return this.materials.get(color);
  }

  /**
   * @param def entrada do catálogo (speed, radius, mass, damage…)
   * @param opts.persistent não some por tempo (patinho no chão)
   */
  spawn(owner, origin, dir, def, { persistent = false } = {}) {
    const cfg = CONFIG.weapon;
    const transient = this.items.filter((p) => !p.persistent);
    if (transient.length >= cfg.maxProjectiles) this._remove(transient[0]);

    const body = new CANNON.Body({
      mass: def.mass,
      material: this.physics.materials.projectile,
      collisionFilterGroup: GROUP.PROJECTILE,
      collisionFilterMask: GROUP.ENV | GROUP.PROJECTILE | owner.maskOthers, // ignora o próprio dono
      linearDamping: 0.01,
      angularDamping: 0.2,
    });
    body.addShape(new CANNON.Sphere(def.radius));
    body.position.set(origin.x, origin.y, origin.z);
    const ov = owner.velocity;
    body.velocity.set(dir.x * def.speed + ov.x, dir.y * def.speed, dir.z * def.speed + ov.z);
    if (def.id === 'duck') body.angularVelocity.set(Math.random() * 8, Math.random() * 8, 0);

    const mesh = def.id === 'duck' ? buildDuckMesh(def.radius) : new THREE.Mesh(this.sphere, this._material(def.color));
    if (def.id !== 'duck') mesh.scale.setScalar(def.radius);
    mesh.traverse((o) => { o.castShadow = true; });
    this.scene.add(mesh);
    this.physics.addBody(body, mesh);

    const p = { body, mesh, owner, def, age: 0, hitDone: false, persistent };
    body.addEventListener('collide', (e) => this._onCollide(p, e));
    this.items.push(p);
    return p;
  }

  _onCollide(p, e) {
    if (p.hitDone) return;
    const target = e.body?.userData?.character;
    if (!target || target === p.owner) return; // parede/chão: pode quicar e acertar depois
    const v = p.body.velocity; // ainda é a velocidade PRÉ-impacto (evento vem antes do solver)
    const speed = v.length();
    if (speed < CONFIG.weapon.minHitSpeed) return;
    p.hitDone = true;

    // ponto de contato no alvo → headshot?
    const c = e.contact;
    let headshot = false;
    if (c && target.mode === 'controlled') {
      const onTarget = c.bi === e.body ? c.bi.position.vadd(c.ri) : c.bj.position.vadd(c.rj);
      headshot = onTarget.y > target.controller.position.y + HEAD_ZONE;
    }

    this.pendingHits.push({
      target,
      attacker: p.owner,
      weapon: p.def,
      kind: p.def.id === 'duck' ? 'duck' : 'projectile',
      headshot,
      direction: new CANNON.Vec3(v.x / speed, v.y / speed, v.z / speed),
    });
  }

  drainHits(fn) {
    const hits = this.pendingHits;
    this.pendingHits = [];
    hits.forEach(fn);
  }

  update(dt) {
    const life = CONFIG.weapon.projectileLifetime;
    for (const p of [...this.items]) {
      p.age += dt;
      if (p.body.position.y < -5 || (!p.persistent && p.age > life)) { this._remove(p); continue; }
      if (p.persistent && p.age > 0.6) this._tryPickup(p);
    }
  }

  /** Patinho no chão: o dono (de mãos vazias) pega de volta encostando nele. */
  _tryPickup(p) {
    const o = p.owner;
    if (o.dead || o.mode !== 'controlled' || o.weapon.def.type !== 'none') return;
    const a = o.controller.position, b = p.body.position;
    if (Math.hypot(a.x - b.x, a.z - b.z) < 1.3 && Math.abs(a.y - b.y) < 1.6) {
      o.weapon.equip(p.def.id);
      o.weapon.thrownDuck = null;
      this._remove(p);
    }
  }

  isAlive(p) {
    return this.items.includes(p);
  }

  clear() {
    [...this.items].forEach((p) => this._remove(p));
    this.pendingHits = [];
  }

  _remove(p) {
    this.physics.removeBody(p.body);
    this.scene.remove(p.mesh);
    const i = this.items.indexOf(p);
    if (i >= 0) this.items.splice(i, 1);
  }
}

export function buildDuckMesh(r = 0.22) {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff8a1f, roughness: 0.5 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), yellow);
  body.scale.set(1, 0.8, 1.15);
  const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 14, 10), yellow);
  head.position.set(0, r * 0.75, -r * 0.55);
  const beak = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 0.18, r * 0.5), orange);
  beak.position.set(0, r * 0.7, -r * 1.1);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 6, 6), black);
  eyeL.position.set(-r * 0.28, r * 0.9, -r * 0.95);
  const eyeR = eyeL.clone();
  eyeR.position.x *= -1;
  g.add(body, head, beak, eyeL, eyeR);
  return g;
}
