// Projéteis físicos (bolinhas, chumbinhos, melancias e o patinho).
// Colisões viram "hits" pendentes, processados FORA do passo físico
// (mudar tipo de corpo dentro do callback de colisão do cannon dá bug).

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { GROUP } from '../physics/PhysicsWorld.js';


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

    const rocket = def.type === 'rocket';
    const mesh = def.id === 'duck' ? buildDuckMesh(def.radius) : rocket ? buildRocketMesh() : new THREE.Mesh(this.sphere, this._material(def.color));
    if (def.id !== 'duck' && !rocket) mesh.scale.setScalar(def.radius);
    mesh.traverse((o) => { o.castShadow = true; });
    this.scene.add(mesh);
    this.physics.addBody(body, mesh);

    const p = { body, mesh, owner, def, age: 0, hitDone: false, persistent, rocket, dir: rocket ? { x: dir.x, y: dir.y, z: dir.z } : null, boom: false };
    if (rocket) {
      body.velocity.set(dir.x * def.speed, dir.y * def.speed, dir.z * def.speed);
      body.linearDamping = 0;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dir.x, dir.y, dir.z).normalize());
      body.quaternion.set(q.x, q.y, q.z, q.w);
      body.fixedRotation = true;
      body.updateMassProperties();
    }
    body.addEventListener('collide', (e) => this._onCollide(p, e));
    this.items.push(p);
    return p;
  }

  _onCollide(p, e) {
    if (p.rocket) { if (e.body?.userData?.character !== p.owner) p.boom = true; return; } // foguete explode no que encostar
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
      headshot = onTarget.y > target.headY(); // topo do tronco + antena/fone (desce agachado)
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
      if (p.rocket) {
        // voo reto (anula a gravidade) e explode ao bater ou depois de 4 s
        const s = p.def.speed;
        p.body.velocity.set(p.dir.x * s, p.dir.y * s, p.dir.z * s);
        if (p.boom || p.age > 4) {
          const at = p.body.position.clone();
          this._remove(p);
          this.onExplode?.(at, p.def, p.owner);
        }
        continue;
      }
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

export function buildRocketMesh() {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x556b2f }));
  head.rotation.x = Math.PI / 2; // cone aponta pra +Z (lookAt mira o +Z do grupo)
  head.position.z = 0.1;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -0.12;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa020 }));
  flame.position.z = -0.3;
  g.add(head, tail, flame);
  return g;
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
