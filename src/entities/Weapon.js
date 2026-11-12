// Arma equipada (dados do catálogo) + soco, que todo mundo sempre tem.

import * as THREE from 'three';
import { WEAPONS, MELEE } from '../data/catalog.js';

const _tmp = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();

export class Weapon {
  constructor(owner, projectiles) {
    this.owner = owner;
    this.projectiles = projectiles;
    this.def = WEAPONS.slingshot;
    this.cooldown = 0;
    this.meleeCooldown = 0;
    this.thrownDuck = null; // projétil do patinho no chão (para pegar de volta)
    this.onFire = null;     // recuo do viewmodel
    this.onMelee = null;    // animação de soco
    this.onChange = null;   // troca de arma (viewmodel/HUD)
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  equip(id) {
    this.def = WEAPONS[id] ?? WEAPONS.none;
    this.cooldown = 0.25;
    this.owner.setWeaponLook(this.def);
    this.onChange?.(this.def);
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
  }

  _canAct() {
    return this.owner.mode === 'controlled' && !this.owner.frozen && !this.owner.dead;
  }

  tryFire() {
    const d = this.def;
    if (d.type === 'none' || this.cooldown > 0 || !this._canAct()) return false;
    this.cooldown = d.cooldown;

    const origin = this.owner.getEyePosition(this._origin);
    const aim = this.owner.getAimDirection(this._dir);
    origin.addScaledVector(aim, 0.75);

    if (d.type === 'throw') {
      const lob = _tmp.copy(aim).add(_up.set(0, 0.12, 0)).normalize(); // arremesso levemente pra cima
      this.thrownDuck = this.projectiles.spawn(this.owner, origin, lob, d, { persistent: true });
      this.equip('none'); // jogou, ficou sem nada (até pegar de volta)
    } else {
      // base ortonormal para espalhar os chumbinhos num cone
      _side.crossVectors(aim, _up.set(0, 1, 0)).normalize();
      _up.crossVectors(_side, aim).normalize();
      for (let i = 0; i < (d.pellets ?? 1); i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (d.spread ?? 0);
        const dir = _tmp.copy(aim).addScaledVector(_side, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
        this.projectiles.spawn(this.owner, origin, dir, d);
      }
    }
    this.onFire?.(d);
    return true;
  }

  /**
   * Soco: acerta o adversário mais centralizado dentro do alcance.
   * @param candidates personagens que podem levar o soco
   * @param sink função que recebe o "hit" (DamageSystem.apply)
   */
  tryMelee(candidates, sink) {
    if (this.meleeCooldown > 0 || !this._canAct()) return false;
    this.meleeCooldown = MELEE.cooldown;
    this.onMelee?.();

    const eye = this.owner.getEyePosition(this._origin);
    const aim = this.owner.getAimDirection(this._dir);
    let best = null, bestDot = 0.55;
    for (const t of candidates) {
      if (t === this.owner || t.team === this.owner.team) continue;
      const c = t.centerPosition(_tmp).sub(eye);
      const dist = c.length();
      if (dist > MELEE.range + 0.4) continue;
      const dot = c.divideScalar(dist).dot(aim);
      if (dot > bestDot) { bestDot = dot; best = t; }
    }
    if (best) {
      const flat = new THREE.Vector3(aim.x, 0, aim.z).normalize();
      sink({ target: best, attacker: this.owner, weapon: MELEE, direction: flat, headshot: false, kind: 'melee' });
    }
    return true;
  }
}
