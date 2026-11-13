// Tiro de FPS: bala instantânea por raio (hitscan) com dispersão, queda de dano
// por distância e headshot pelo ponto de impacto; explosão do RPG com dano por raio.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { GROUP } from '../physics/PhysicsWorld.js';
import { spreadDir } from '../entities/Weapon.js';

const _eye = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

/** Multiplicador de dano pela distância. */
export function falloffMult(def, dist) {
  if (!def.falloff) return 1;
  const [start, end, min] = def.falloff;
  if (dist <= start) return 1;
  if (dist >= end) return min;
  return 1 - (1 - min) * ((dist - start) / (end - start));
}

export class Ballistics {
  constructor(game) {
    this.game = game;
    this.ray = new CANNON.RaycastResult();
    this.from = new CANNON.Vec3();
    this.to = new CANNON.Vec3();
    this.onShot = null; // (shooter, def) → sons/rede
  }

  /** Ponto aproximado do cano (para o traçante sair da arma, não do olho). */
  muzzleOf(shooter, out) {
    shooter.getEyePosition(out);
    const aim = shooter.getAimDirection(_aim);
    _right.set(-aim.z, 0, aim.x).normalize();
    const ads = shooter.weapon?.ads;
    return out.addScaledVector(aim, 0.55).addScaledVector(_right, ads ? 0 : 0.13).add({ x: 0, y: ads ? -0.06 : -0.12, z: 0 });
  }

  fireHitscan(shooter, def, spread) {
    const g = this.game;
    const eye = shooter.getEyePosition(_eye);
    const aim = shooter.getAimDirection(_aim);
    const muzzle = this.muzzleOf(shooter, _muzzle);
    const range = def.range ?? 80;
    const mask = GROUP.ENV | shooter.maskOthers;
    let anyHit = false;

    for (let i = 0; i < (def.pellets ?? 1); i++) {
      const dir = spreadDir(aim, spread, _dir);
      this.from.set(eye.x, eye.y, eye.z);
      this.to.set(eye.x + dir.x * range, eye.y + dir.y * range, eye.z + dir.z * range);
      this.ray.reset();
      const hit = g.physics.world.raycastClosest(this.from, this.to, { collisionFilterMask: mask, skipBackfaces: true }, this.ray);
      const end = hit ? this.ray.hitPointWorld : this.to;
      // traçante: escopeta desenha só alguns chumbos, pra não virar uma vassoura
      if (i < 3) g.effects?.tracer(muzzle, end, def.pellets > 1 ? 0xffd9a0 : 0xfff1a8);
      if (!hit) continue;

      const ch = this.ray.body?.userData?.character;
      if (ch && ch !== shooter) {
        anyHit = true;
        const p = this.ray.hitPointWorld;
        const headshot = ch.mode === 'controlled' && p.y > ch.headY();
        g.damage.apply({
          target: ch, attacker: shooter, weapon: def, kind: 'bullet', headshot,
          direction: new CANNON.Vec3(dir.x, dir.y, dir.z),
          damageScale: falloffMult(def, this.ray.distance) * (CONFIG.weapon.damageMult ?? 1),
        });
      } else {
        g.effects?.impact(this.ray.hitPointWorld, this.ray.hitNormalWorld);
        if (i === 0) g.sfx?.('ricochet', this.ray.hitPointWorld);
      }
    }
    this.onShot?.(shooter, def, anyHit);
    return anyHit;
  }

  /** Explosão com dano (RPG). Dano e empurrão caem com a distância. */
  explode(at, def, attacker) {
    const g = this.game;
    const E = def.explosive;
    g.effects?.explosion(at, E.radius);
    g.sfx?.('explosion', at);
    for (const p of g.players) {
      const t = p.mode === 'controlled' ? p.controller.position : p.parts.torso.body.position;
      const dx = t.x - at.x, dz = t.z - at.z;
      const dist = Math.hypot(dx, t.y - at.y, dz);
      if (dist > E.radius) continue;
      const strength = 1 - dist / E.radius;
      const len = Math.hypot(dx, dz) || 1;
      g.damage.apply({
        target: p, attacker, kind: 'explosion', headshot: false, damageScale: strength,
        weapon: { id: def.id, name: def.name, damage: E.damage, headshotMult: 1, knockback: E.knock * 100 * (0.4 + strength), ragdoll: true },
        direction: new CANNON.Vec3(dx / len, 0, dz / len),
      });
    }
  }
}
