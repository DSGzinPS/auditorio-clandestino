// PvP valendo. Acaba quando sobra um time vivo (ou o tempo estoura).
// Kill → dinheiro com multiplicadores · Vitória do round → dinheiro para o time.

import { State } from '../core/StateMachine.js';
import { CONFIG } from '../config.js';

export class RoundState extends State {
  enter() {
    const g = this.context;
    const m = g.flow.match;
    this.timer = CONFIG.match.roundTimeLimit;
    this.ending = false;
    this.winner = null;
    this.endDelay = 0;

    g.combatActive = true;
    g.damage.onKill = (ctx) => this.onKill(ctx);
    g.players.forEach((p) => { p.frozen = false; });
    g.hud.setCrosshairs(true);
    g.hud.flash(null, `ROUND ${m.roundInStage + 1} · LUTEM!`, 'big');
    g.sfx('horn');
  }

  update(dt) {
    const g = this.context;
    const m = g.flow.match;
    m.time += dt;

    g.players.forEach((p, i) => {
      if (p.dead) return;
      const it = g.intents[i];
      p.weapon.trigger(it, dt);
      if (it.melee) p.weapon.tryMelee(g.players, (hit) => g.damage.apply(hit));
    });
    g.projectiles.drainHits((hit) => g.damage.apply(hit));

    if (this.ending) {
      this.endDelay -= dt;
      if (this.endDelay <= 0) g.flow.finishRound(this.winner);
      return;
    }

    this.timer -= dt;
    g.hud.setPhase(`ROUND ${m.roundInStage + 1}/${g.flow.stage.rounds} · ${Math.max(0, Math.ceil(this.timer))}s`);
    g.hud.setLockHint(!g.input.locked);
    if (this.timer <= 0) {
      // tempo esgotado: vence o time com mais HP somado
      const hpByTeam = {};
      g.players.forEach((p) => { if (!p.dead) hpByTeam[p.team] = (hpByTeam[p.team] ?? 0) + p.hp + p.armor; });
      const entries = Object.entries(hpByTeam).sort((a, b) => b[1] - a[1]);
      const winner = entries.length && (entries.length === 1 || entries[0][1] > entries[1][1]) ? Number(entries[0][0]) : null;
      this._end(winner, 'TEMPO ESGOTADO!');
    }
  }

  onKill(ctx) {
    const g = this.context;
    const m = g.flow.match;
    m.deaths[ctx.target.index]++;
    if (ctx.attacker && ctx.attacker !== ctx.target) {
      const ai = ctx.attacker.index;
      const freed = !!m.restrictions[ai];
      if (freed) m.restrictions[ai] = null; // castigado do minigame matou alguém: volta a comprar
      const r = m.rewardKill(ctx);
      g.hud.flash(ai, `+$${r.amount} ${r.tags.length ? r.tags.join(' · ') : 'KILL'}${freed ? ' · LOJA LIBERADA!' : ''}`, 'good');
      g.hud.killfeed(ctx.attacker, ctx.target, ctx.weapon, r.tags);
    }
    g.hud.flash(ctx.target.index, 'VOCÊ CAIU!', 'bad');

    const alive = m.aliveTeams();
    if (alive.length <= 1 && !this.ending) this._end(alive[0] ?? null, null);
  }

  _end(winner, text) {
    this.ending = true;
    this.winner = winner;
    this.endDelay = 1.6; // deixa o corpo voar um pouco
    if (text) this.context.hud.flash(null, text, 'big');
  }

  exit() {
    const g = this.context;
    g.combatActive = false;
    g.damage.onKill = null;
    g.players.forEach((p) => { p.frozen = true; });
    g.hud.setCrosshairs(false);
    g.hud.setLockHint(false);
    g.input.releaseLock();
  }
}
