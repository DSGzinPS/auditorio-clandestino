// Aplica um "hit" (tiro, soco ou patinho): dano, colete, tranco/ragdoll e kill.
// Quem decide o que a kill significa (dinheiro, fim de round, desempate)
// é o estado atual, via onKill(ctx).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { shotKnockback } from '../physics/ChaosForces.js';

export class DamageSystem {
  constructor(game) {
    this.game = game;
    this.onHit = null;  // (ctx) → HUD: número de dano / hitmarker
    this.onKill = null; // (ctx) → estado atual decide
  }

  /** @param hit { target, attacker, weapon, direction, headshot, kind } */
  apply(hit) {
    const { target, attacker, weapon, direction } = hit;
    const scale = (weapon.knockback ?? 100) / 100;

    if (!this.game.combatActive) return;
    if (target.dead) { // malhar o "cadáver" é permitido (só física, sem pontos)
      shotKnockback(target, direction, scale * 0.6);
      return;
    }
    if (attacker && attacker !== target && attacker.team === target.team) return; // sem fogo amigo

    const damage = Math.round(weapon.damage * (hit.headshot ? weapon.headshotMult : 1) * (hit.damageScale ?? 1));
    if (damage <= 0 && !weapon.ragdoll) return;
    const { killed } = target.takeDamage(damage);

    if (killed) shotKnockback(target, direction, Math.max(scale, 1) * CONFIG.chaos.deathMultiplier);
    else if (weapon.ragdoll) shotKnockback(target, direction, scale);
    else target.addFlinch(direction, weapon.knockback ?? 0);

    const ctx = { ...hit, damage, killed };
    this._sound(ctx);
    this.onHit?.(ctx);
    if (killed) this.onKill?.(ctx);
    return ctx;
  }

  _sound({ target, attacker, weapon, kind, headshot, killed }) {
    const g = this.game;
    const at = target.centerPosition(new THREE.Vector3());
    if (kind === 'melee') g.sfx('punch', at);
    else if (weapon.id === 'duck') g.sfx('duck', at);
    else if (kind !== 'explosion') g.sfx('flesh', at, { headshot });
    if (attacker && attacker !== target) g.sfx('hitmark', null, { headshot, killed, forWho: attacker.index });
    if (killed) {
      if (headshot) g.sfx('oooh', null, { amount: 0.8 });
      g.sfx('cheer', null, { amount: headshot || kind === 'melee' || weapon.id === 'duck' ? 1.2 : 0.8 });
    }
  }
}
