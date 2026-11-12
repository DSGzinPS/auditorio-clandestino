// Bola de basquete: pegar (encostando), carregar na frente do corpo,
// arremessar na direção da mira, derrubar quem leva soco/granada e
// detectar cesta (a bola atravessa o aro descendo).

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { GROUP } from '../physics/PhysicsWorld.js';

export class Basketball {
  constructor(game) {
    this.game = game;
    this.holder = null;
    this.lastThrower = null;
    this.noPickup = new Map(); // quem acabou de arremessar não pega de volta na hora
    this.prevY = 0;
    this.onScore = null; // (hoop, scorer) => void

    const r = CONFIG.basketball.ballRadius;
    this.body = new CANNON.Body({
      mass: 0.6,
      material: game.physics.materials.projectile,
      collisionFilterGroup: GROUP.ENV,
      collisionFilterMask: -1,
      linearDamping: 0.05,
      angularDamping: 0.2,
    });
    this.body.addShape(new CANNON.Sphere(r));
    this.mesh = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7 }));
    const seam = new THREE.Mesh(new THREE.TorusGeometry(r * 1.002, r * 0.05, 4, 24), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    const seam2 = seam.clone();
    seam2.rotation.y = Math.PI / 2;
    this.mesh.add(ball, seam, seam2);
    this.mesh.traverse((o) => { o.castShadow = true; });
    game.scene.add(this.mesh);
    game.physics.addBody(this.body, this.mesh);
    this.reset();
  }

  reset() {
    this._release();
    this.body.type = CANNON.Body.DYNAMIC;
    this.body.updateMassProperties();
    this.body.position.set(0, 1.2, 0);
    this.body.velocity.set(0, 4, 0); // "bola ao alto"
    this.body.angularVelocity.setZero();
    this.lastThrower = null;
    this.prevY = this.body.position.y;
  }

  _release() {
    if (!this.holder) return;
    this.holder = null;
    this.body.type = CANNON.Body.DYNAMIC;
    this.body.collisionResponse = true;
    this.body.updateMassProperties();
    this.body.wakeUp();
  }

  throw(player) {
    if (this.holder !== player || player.mode !== 'controlled') return false;
    const cfg = CONFIG.basketball;
    const eye = player.getEyePosition(new THREE.Vector3());
    const dir = player.getAimDirection(new THREE.Vector3());
    this._release();
    this.body.position.set(eye.x + dir.x * 0.8, eye.y + dir.y * 0.8, eye.z + dir.z * 0.8);
    const v = player.velocity;
    this.body.velocity.set(dir.x * cfg.throwSpeed + v.x * 0.5, dir.y * cfg.throwSpeed, dir.z * cfg.throwSpeed + v.z * 0.5);
    this.body.angularVelocity.set(-8, 0, 0);
    this.lastThrower = player;
    this.noPickup.set(player, 0.7);
    return true;
  }

  /** Empurrão de granada. */
  blast(center, radius, push) {
    if (this.holder) return; // quem segura cai (ragdoll) e solta no update
    const b = this.body.position;
    const dx = b.x - center.x, dy = b.y - center.y, dz = b.z - center.z, d = Math.hypot(dx, dy, dz);
    if (d > radius) return;
    const s = (1 - d / radius) * push;
    this.body.velocity.vadd(new CANNON.Vec3((dx / (d || 1)) * s, s * 0.6 + 2, (dz / (d || 1)) * s), this.body.velocity);
  }

  /** Depois do passo físico. */
  update(dt) {
    for (const [p, t] of this.noPickup) this.noPickup.set(p, t - dt);
    const b = this.body;

    // quem segura e cai (soco/granada) solta a bola
    if (this.holder && (this.holder.mode !== 'controlled' || this.holder.dead)) {
      const v = this.holder.parts.torso.body.velocity;
      this._release();
      b.velocity.set(v.x * 0.6, Math.abs(v.y) * 0.4 + 2, v.z * 0.6);
    }

    if (this.holder) {
      // carrega na frente, um pouco abaixo dos olhos
      const h = this.holder;
      const eye = h.getEyePosition(new THREE.Vector3());
      const fwd = new THREE.Vector3(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
      b.position.set(eye.x + fwd.x * 0.7, eye.y - 0.45, eye.z + fwd.z * 0.7);
      b.velocity.copy(h.controller.velocity);
      this.prevY = b.position.y;
      return;
    }

    // pegar: encostou na bola livre
    for (const p of this.game.players) {
      if (p.mode !== 'controlled' || p.dead || p.frozen || (this.noPickup.get(p) ?? 0) > 0) continue;
      const c = p.controller.position;
      if (Math.hypot(c.x - b.position.x, c.z - b.position.z) < 1.15 && b.position.y < c.y + 1.4) {
        this.holder = p;
        b.type = CANNON.Body.KINEMATIC;
        b.collisionResponse = false;
        b.velocity.setZero();
        b.angularVelocity.setZero();
        return;
      }
    }

    // cesta: cruzou a altura do aro, descendo, por dentro do aro
    const hoops = this.game.arena.extras.hoops ?? [];
    for (const hoop of hoops) {
      const c = hoop.center;
      const crossed = this.prevY > c.y && b.position.y <= c.y && b.velocity.y < 0;
      if (crossed && Math.hypot(b.position.x - c.x, b.position.z - c.z) < hoop.radius * 0.95) {
        this.onScore?.(hoop, this.lastThrower);
        break;
      }
    }
    this.prevY = b.position.y;
  }

  destroy() {
    this._release();
    this.game.physics.removeBody(this.body);
    this.game.scene.remove(this.mesh);
  }
}
