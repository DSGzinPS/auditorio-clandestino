// Granadas de efeito "moral": não tiram vida, só arremessam (ragdoll) quem
// estiver perto e empurram a bola. Usadas no basquete; prontas para outros modos.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { GROUP } from '../physics/PhysicsWorld.js';
import { shotKnockback } from '../physics/ChaosForces.js';

export class Grenades {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.effects = [];
    this.cooldowns = new Map();
    this.geo = new THREE.SphereGeometry(1, 12, 8);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x3a7d2c, roughness: 0.6 });
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.8 });
  }

  ready(player) {
    return (this.cooldowns.get(player) ?? 0) <= 0;
  }

  cooldownLeft(player) {
    return Math.max(0, this.cooldowns.get(player) ?? 0);
  }

  throw(player) {
    const cfg = CONFIG.grenade;
    if (!this.ready(player) || player.mode !== 'controlled' || player.frozen) return false;
    this.cooldowns.set(player, cfg.cooldown);
    const eye = player.getEyePosition(new THREE.Vector3());
    const dir = player.getAimDirection(new THREE.Vector3());
    eye.addScaledVector(dir, 0.8);
    const body = new CANNON.Body({
      mass: 0.4,
      material: this.game.physics.materials.projectile,
      collisionFilterGroup: GROUP.PROJECTILE,
      collisionFilterMask: GROUP.ENV | GROUP.PROJECTILE | player.maskOthers,
      linearDamping: 0.05,
    });
    body.addShape(new CANNON.Sphere(0.14));
    body.position.set(eye.x, eye.y, eye.z);
    const v = player.velocity;
    body.velocity.set(dir.x * cfg.speed + v.x, dir.y * cfg.speed + 2.5, dir.z * cfg.speed + v.z);
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.scale.setScalar(0.14);
    mesh.castShadow = true;
    this.game.scene.add(mesh);
    this.game.physics.addBody(body, mesh);
    this.items.push({ body, mesh, owner: player, fuse: cfg.fuse });
    return true;
  }

  update(dt) {
    for (const [p, t] of this.cooldowns) this.cooldowns.set(p, t - dt);
    for (const g of [...this.items]) {
      g.fuse -= dt;
      if (g.fuse <= 0) this._explode(g);
    }
    for (const e of [...this.effects]) {
      e.t += dt;
      const k = e.t / 0.35;
      e.mesh.scale.setScalar(0.3 + k * CONFIG.grenade.radius);
      e.mesh.material.opacity = Math.max(0, 0.8 * (1 - k));
      if (k >= 1) {
        this.game.scene.remove(e.mesh);
        this.effects.splice(this.effects.indexOf(e), 1);
      }
    }
  }

  _explode(g) {
    const c = g.body.position.clone();
    this._remove(g);
    this.explodeAt(c, CONFIG.grenade.radius, CONFIG.grenade.knock);
  }

  /** Explosão "moral": arremessa (ragdoll) quem estiver no raio, sem dano. */
  explodeAt(c, R, knock) {
    const cfg = { knock };
    for (const p of this.game.players) {
      const t = p.mode === 'controlled' ? p.controller.position : p.parts.torso.body.position;
      const dx = t.x - c.x, dz = t.z - c.z, dist = Math.hypot(dx, t.y - c.y, dz);
      if (dist > R) continue;
      const strength = 1 - dist / R;
      const len = Math.hypot(dx, dz) || 1;
      shotKnockback(p, { x: dx / len, y: 0, z: dz / len }, cfg.knock * (0.35 + strength));
    }
    this.game.sfx?.('explosion', c, { small: true });
    this.game.effects?.explosion(c, R * 0.7); // clarão (também vai pela rede)
  }

  _remove(g) {
    this.game.physics.removeBody(g.body);
    this.game.scene.remove(g.mesh);
    this.items.splice(this.items.indexOf(g), 1);
  }

  clear() {
    [...this.items].forEach((g) => this._remove(g));
    this.effects.forEach((e) => this.game.scene.remove(e.mesh));
    this.effects = [];
    this.cooldowns.clear();
  }
}
