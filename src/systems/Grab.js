// =============================================================
//  Agarrão: aperta E (ou AGARRAR) perto de alguém → ele vira ragdoll e
//  vai junto, pendurado na sua frente. Clique arremessa pra onde você
//  olha; E de novo só solta. O agarrado se debate (pular/socar/atirar)
//  e escapa sozinho depois de alguns segundos.
//
//  Vale no PvP, no desempate na mão e no basquete.
// =============================================================

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class GrabSystem {
  constructor(game) {
    this.game = game;
    this.holds = new Map();    // quem segura → { target, t, struggle, firePrev }
    this.cooldown = new Map(); // quem segura → tempo até poder agarrar de novo
    this._eye = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._v = new CANNON.Vec3();
  }

  allowed() {
    const g = this.game;
    return g.combatActive || g.meleeOnly || !!g.basketball;
  }

  holding(p) {
    return this.holds.get(p)?.target ?? null;
  }

  heldBy(p) {
    for (const [by, h] of this.holds) if (h.target === p) return by;
    return null;
  }

  clear() {
    for (const p of [...this.holds.keys()]) this._release(p, false);
    this.cooldown.clear();
  }

  /** Antes do estado do jogo e da física, com as intenções do frame (pode "comer" o tiro). */
  update(dt, intents) {
    const g = this.game, cfg = CONFIG.grab;
    for (const [p, t] of this.cooldown) this.cooldown.set(p, t - dt);

    // quem está sendo segurado se debate
    for (const [by, h] of this.holds) {
      const it = intents[h.target.index];
      if (it && !h.target.dead && (it.jump || (it.melee && !h.meleePrev) || (it.fire && !h.targetFirePrev))) h.struggle += cfg.struggle;
      if (it) { h.meleePrev = it.melee; h.targetFirePrev = it.fire; }
    }

    for (const p of g.players) {
      const it = intents[p.index];
      if (!it) continue;
      const h = this.holds.get(p);
      if (h) {
        h.t += dt;
        const fireEdge = it.fire && !h.firePrev;
        h.firePrev = it.fire;
        // segurando: o clique é arremesso, nada de tiro/soco/mira
        it.fire = false;
        it.melee = false;
        it.ads = false;
        const lost = !this.allowed() || p.dead || p.mode !== 'controlled' || !g.players.includes(h.target) || h.target.mode !== 'ragdoll';
        if (lost) this._release(p, false);
        else if (fireEdge) this._release(p, true);
        else if (it.grab) this._release(p, false);
        else if (h.t + h.struggle > cfg.maxHold) {
          this._release(p, false);
          g.hud.flash(h.target.index, 'SE SOLTOU!', 'good');
        } else this._carry(p, h);
      } else if (it.grab && this.allowed() && !p.dead && p.mode === 'controlled' && !p.frozen && (this.cooldown.get(p) ?? 0) <= 0) {
        const target = this._candidate(p);
        if (target) this._grab(p, target, it);
      }
    }
  }

  _candidate(p) {
    const g = this.game, cfg = CONFIG.grab;
    const eye = p.getEyePosition(this._eye);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let best = null, bestD = cfg.range;
    for (const o of g.players) {
      if (o === p || this.heldBy(o) || this.holds.has(o)) continue;
      const c = o.centerPosition(this._c);
      const dx = c.x - eye.x, dz = c.z - eye.z;
      const d = Math.hypot(dx, dz, (c.y - eye.y) * 0.5);
      if (d > bestD) continue;
      if ((dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) < 0.35) continue; // tem que estar na frente
      best = o;
      bestD = d;
    }
    return best;
  }

  _grab(p, target, it) {
    const g = this.game;
    target.goRagdoll();
    target.ragdollTimer = 0;
    this.holds.set(p, { target, t: 0, struggle: 0, firePrev: !!it.fire, meleePrev: false, targetFirePrev: true });
    p.carrying = true;
    g.sfx('grab', target.centerPosition(new THREE.Vector3()));
    g.hud.flash(p.index, `SEGURANDO ${target.name} · CLIQUE ARREMESSA`, 'good');
    g.hud.flash(target.index, 'TE AGARRARAM! PULA PRA SE SOLTAR', 'bad');
  }

  /** Puxa o tronco do agarrado pra frente de quem segura (as juntas arrastam o resto). */
  _carry(p, h) {
    const cfg = CONFIG.grab;
    const tgt = h.target;
    tgt.ragdollTimer = 0; // não levanta enquanto está sendo segurado
    const eye = p.getEyePosition(this._eye);
    const cp = Math.cos(p.pitch * 0.6);
    const hx = eye.x - Math.sin(p.yaw) * cfg.holdDistance * cp;
    const hz = eye.z - Math.cos(p.yaw) * cfg.holdDistance * cp;
    const hy = eye.y - 0.35 + Math.sin(p.pitch * 0.6) * cfg.holdDistance;
    const torso = tgt.parts.torso.body;
    const pv = p.controller.velocity;
    const k = 12;
    torso.velocity.set(
      clamp((hx - torso.position.x) * k, -20, 20) + pv.x,
      clamp((hy - torso.position.y) * k, -20, 20),
      clamp((hz - torso.position.z) * k, -20, 20) + pv.z,
    );
    torso.angularVelocity.scale(0.85, torso.angularVelocity);
  }

  _release(p, thrown) {
    const g = this.game, cfg = CONFIG.grab;
    const h = this.holds.get(p);
    if (!h) return;
    this.holds.delete(p);
    p.carrying = false;
    this.cooldown.set(p, cfg.cooldown);
    const tgt = h.target;
    tgt.ragdollTimer = 0; // conta o tempo de levantar a partir de agora
    if (!thrown || tgt.mode !== 'ragdoll') return;
    const cp = Math.cos(p.pitch);
    const pv = p.controller.velocity;
    const vx = -Math.sin(p.yaw) * cp * cfg.throwSpeed + pv.x;
    const vy = Math.sin(p.pitch) * cfg.throwSpeed + cfg.throwUp;
    const vz = -Math.cos(p.yaw) * cp * cfg.throwSpeed + pv.z;
    for (const part of tgt.partList) {
      part.body.velocity.set(vx, vy, vz);
      part.body.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    }
    tgt.thrownBy = p;
    g.sfx('swing', tgt.centerPosition(new THREE.Vector3()));
    g.sfx('oooh', null, { amount: 0.7 });
    g.hud.flash(p.index, `ARREMESSOU ${tgt.name}!`, 'good');
  }
}
