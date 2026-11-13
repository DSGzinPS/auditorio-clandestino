// Arma equipada + soco (que todo mundo sempre tem).
// Balística de FPS: pente/reserva/recarga, semi × automática, aceleração da minigun,
// dispersão (parado, andando, no ar, agachado, mirando) que abre a cada tiro (bloom),
// recuo na mira e zoom (ADS). O tiro em si fica em systems/Ballistics.js.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { WEAPONS, MELEE, cooldownOf } from '../data/catalog.js';

const _tmp = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up = new THREE.Vector3();

export class Weapon {
  constructor(owner, projectiles) {
    this.owner = owner;
    this.projectiles = projectiles;
    this.ballistics = null; // injetado pelo Game
    this.def = WEAPONS.slingshot;
    this.ammo = 0;
    this.reserve = 0;
    this.reloading = 0;     // segundos restantes de recarga
    this.cooldown = 0;
    this.meleeCooldown = 0;
    this.spin = 0;          // minigun: 0 parada … 1 girando
    this.bloom = 0;
    this.ads = false;       // mirando
    this.triggerPrev = false;
    this.thrownDuck = null;
    // ganchos (câmera, sons, rede)
    this.onFire = null;
    this.onMelee = null;
    this.onChange = null;
    this.onReload = null;
    this.onEmpty = null;
    this.sfx = null; // (nome, opções) → Game/AudioSystem
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this.equip('slingshot');
  }

  equip(id) {
    this.def = WEAPONS[id] ?? WEAPONS.none;
    this.ammo = this.def.mag ?? 0;
    this.reserve = this.def.reserve ?? 0;
    this.reloading = 0;
    this.cooldown = 0.25;
    this.spin = 0;
    this.bloom = 0;
    this.ads = false;
    this.owner.setWeaponLook(this.def);
    this.onChange?.(this.def);
  }

  /** Começo de round: munição cheia (pente + reserva). */
  refill() {
    this.ammo = this.def.mag ?? 0;
    this.reserve = this.def.reserve ?? 0;
    this.reloading = 0;
  }

  get reloadProgress() {
    return this.reloading > 0 ? 1 - this.reloading / (this.def.reload || 1) : 0;
  }

  update(dt) {
    // deixa "sobrar" um pouco abaixo de zero: a cadência fica exata mesmo a 30/60 fps
    this.cooldown = Math.max(-1 / 30, this.cooldown - dt);
    this.pressBuffer = Math.max(0, (this.pressBuffer ?? 0) - dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    this.bloom = Math.max(0, this.bloom - (this.def.bloomRecover ?? 0.3) * dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const take = Math.min((this.def.mag ?? 0) - this.ammo, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    }
    if (this.def.spinUp && !this._spinHeld) this.spin = Math.max(0, this.spin - dt / this.def.spinUp);
    this._spinHeld = false;
    if (this.owner.mode !== 'controlled' || this.owner.dead) this.ads = false;
  }

  _canAct() {
    return this.owner.mode === 'controlled' && !this.owner.frozen && !this.owner.dead;
  }

  /**
   * Chamado todo frame no combate com a intenção do jogador.
   * Cuida de semi × automática, recarga, mira e aceleração da minigun.
   */
  trigger(intent, dt = 1 / 60) {
    const held = !!intent.fire;
    const pressed = held && !this.triggerPrev;
    this.triggerPrev = held;
    this.ads = !!intent.ads && this._canAct() && this.reloading <= 0 && this.def.type !== 'none' && this.def.type !== 'throw';
    if (intent.reload) this.startReload();
    if (this.def.spinUp && held && this._canAct()) {
      this._spinHeld = true;
      this.spin = Math.min(1, this.spin + dt / this.def.spinUp);
    }
    if (this.def.auto) return held ? this.tryFire() : false;
    // semi: um clique um pouco antes da arma ficar pronta não se perde
    if (pressed) this.pressBuffer = 0.18;
    if (this.pressBuffer > 0 && this.tryFire()) { this.pressBuffer = 0; return true; }
    return false;
  }

  startReload() {
    const d = this.def;
    if (this.reloading > 0 || !d.mag || this.ammo >= d.mag || this.reserve <= 0 || d.type === 'throw') return false;
    this.reloading = d.reload;
    this.ads = false;
    this.onReload?.(d);
    this.sfx?.('reload');
    return true;
  }

  /** Dispersão atual (rad). */
  currentSpread() {
    const d = this.def;
    const o = this.owner;
    let s = (this.ads ? d.adsSpread ?? d.spread : d.spread) ?? 0;
    const v = o.controller.velocity;
    const speed = Math.hypot(v.x, v.z);
    s += (d.moveSpread ?? 0) * Math.min(1, speed / CONFIG.character.moveSpeed);
    if (!o.grounded) s += 0.04;
    s += this.bloom;
    if (o.crouchT > 0.5) s *= 0.75;
    return s * (CONFIG.weapon.spreadMult ?? 1);
  }

  /** Um disparo (respeita cadência, munição e recarga). */
  tryFire() {
    const d = this.def;
    if (d.type === 'none' || this.cooldown > 0 || this.reloading > 0 || !this._canAct()) return false;
    if (d.spinUp && this.spin < 1) return false;
    if (d.mag && this.ammo <= 0) {
      this.onEmpty?.(d);
      this.sfx?.('empty');
      this.startReload();
      this.cooldown = 0.25;
      return false;
    }
    if (d.mag) this.ammo--;
    this.cooldown = Math.min(0, this.cooldown) + cooldownOf(d);

    const origin = this.owner.getEyePosition(this._origin);
    const aim = this.owner.getAimDirection(this._dir);
    const spread = this.currentSpread();

    if (d.type === 'hitscan') {
      this.ballistics?.fireHitscan(this.owner, d, spread);
    } else if (d.type === 'throw') {
      origin.addScaledVector(aim, 0.75);
      const lob = _tmp.copy(aim).add(_up.set(0, 0.12, 0)).normalize();
      this.thrownDuck = this.projectiles.spawn(this.owner, origin, lob, d, { persistent: true });
      this.equip('none');
    } else {
      origin.addScaledVector(aim, 0.75);
      this.projectiles.spawn(this.owner, origin, spreadDir(aim, spread, new THREE.Vector3()), d);
    }

    this.bloom = Math.min(d.bloomMax ?? 0, this.bloom + (d.bloom ?? 0));
    if (d.recoil) this.owner.applyRecoil(d.recoil[0] * (this.ads ? 0.75 : 1), d.recoil[1]);
    this.onFire?.(d);
    this.sfx?.('shot', { sound: d.sound, wid: d.id });
    if (d.mag && this.ammo <= 0 && this.reserve > 0) this.startReload(); // recarrega sozinho quando esvazia
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
    this.sfx?.('swing');

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

/** Direção com dispersão aleatória dentro de um cone (distribuição uniforme no disco). */
export function spreadDir(aim, spread, out) {
  _side.crossVectors(aim, _up.set(0, 1, 0));
  if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
  _side.normalize();
  _up.crossVectors(_side, aim).normalize();
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
  return out.copy(aim).addScaledVector(_side, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
}
