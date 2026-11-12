// Empate no quiz → "saem na mão". Só soco. Quem cair primeiro é o perdedor do quiz.
// Estourou o tempo: perde quem tiver menos HP (empate de HP = ninguém perde).

import { State } from '../core/StateMachine.js';
import { CONFIG } from '../config.js';
import { WEAPONS } from '../data/catalog.js';

export class TiebreakState extends State {
  enter({ contenders }) {
    const g = this.context;
    this.contenders = contenders;
    this.losers = null;
    this.endTimer = 0;
    this.timer = CONFIG.match.tiebreakTime;

    g.projectiles.clear();
    g.combatActive = true;
    g.meleeOnly = true;
    g.damage.onKill = (ctx) => this._decide([ctx.target], `${ctx.target.name} APANHOU!`);

    g.players.forEach((p) => {
      p.revive(false);
      const inDuel = contenders.includes(p);
      if (inDuel) {
        const s = g.arena.duelSpawn(contenders.indexOf(p), contenders.length);
        p.teleport(s.position, s.yaw);
      } else {
        p.teleport(p.spawn.position, p.spawn.yaw);
      }
      p.frozen = !inDuel;
      p.setWeaponLook(WEAPONS.none);
    });
    g.views.forEach((v) => { v.forceFists = true; });

    g.hud.setPhase('DESEMPATE NA MÃO');
    g.hud.setCrosshairs(true);
    g.hud.flash(null, 'EMPATE! RESOLVE NA MÃO!', 'big');
  }

  _decide(losers, text) {
    if (this.losers) return;
    this.losers = losers;
    this.endTimer = 2.5;
    this.context.hud.flash(null, text, 'big');
  }

  update(dt) {
    const g = this.context;
    g.projectiles.drainHits(() => {});
    if (this.losers) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) g.flow.finishTiebreak(this.losers);
      return;
    }
    g.players.forEach((p, i) => {
      const it = g.intents[i];
      if ((it.fire || it.melee) && this.contenders.includes(p)) p.weapon.tryMelee(this.contenders, (hit) => g.damage.apply(hit));
    });
    this.timer -= dt;
    g.hud.setPhase(`DESEMPATE NA MÃO · ${Math.max(0, Math.ceil(this.timer))}s`);
    g.hud.setLockHint(!g.input.locked);
    if (this.timer <= 0) {
      const min = Math.min(...this.contenders.map((p) => p.hp));
      const losers = this.contenders.filter((p) => p.hp === min);
      this._decide(losers.length === this.contenders.length ? [] : losers, losers.length === this.contenders.length ? 'NINGUÉM PERDEU!' : 'ACABOU O TEMPO!');
    }
  }

  exit() {
    const g = this.context;
    g.combatActive = false;
    g.meleeOnly = false;
    g.damage.onKill = null;
    g.views.forEach((v) => { v.forceFists = false; });
    g.players.forEach((p) => { p.revive(false); p.setWeaponLook(p.weapon.def); });
    g.hud.setCrosshairs(false);
    g.hud.setLockHint(false);
    g.input.releaseLock();
  }
}
