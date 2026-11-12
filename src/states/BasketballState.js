// ETAPA 5 — BASQUETE COM GRANADAS (melhor de 3). Ninguém morre: soco empurra,
// granada arremessa, e quem estiver com a bola solta ela ao cair.
// ATIRAR = arremessa a bola (se estiver com ela) ou joga granada. SOCO = empurrão.
// Cesta vale dinheiro. Quem fizer menos cestas fica restrito no PvP final.

import { State } from '../core/StateMachine.js';
import { CONFIG } from '../config.js';
import { WEAPONS } from '../data/catalog.js';
import { Basketball } from '../systems/Basketball.js';
import { shotKnockback } from '../physics/ChaosForces.js';

const PUSH = { id: 'push', name: 'Empurrão', damage: 0, headshotMult: 1, knockback: 90, ragdoll: true };

export class BasketballState extends State {
  enter({ stage } = {}) {
    const g = this.context;
    this.need = Math.ceil((stage?.bestOf ?? 3) / 2);
    this.timer = stage?.timeLimit ?? CONFIG.basketball.timeLimit;
    this.points = Object.fromEntries(g.flow.match.teams.map((t) => [t, 0]));
    this.finished = false;
    this.endTimer = 0;

    g.combatActive = false;
    g.projectiles.clear();
    g.basketball = new Basketball(g);
    g.basketball.onScore = (hoop, scorer) => this._score(hoop, scorer);
    g.players.forEach((p) => p.setWeaponLook(WEAPONS.none));
    g.weaponLabel = (p) => (g.basketball?.holder === p ? 'Bola (ATIRAR arremessa)'
      : g.grenades.ready(p) ? 'Granada pronta' : `Granada em ${g.grenades.cooldownLeft(p).toFixed(1)}s`);
    g.views.forEach((v) => { v.viewOverride = () => (g.basketball?.holder === v.character ? 'ball' : 'grenade'); });
    g.hud.setCrosshairs(true);
    this._kickoff('BASQUETE COM GRANADAS!');
  }

  _kickoff(text) {
    const g = this.context;
    g.grenades.clear();
    g.basketball.reset();
    g.players.forEach((p) => {
      p.teleport(p.spawn.position, p.spawn.yaw);
      p.frozen = true;
      p.canLook = true;
    });
    this.pause = CONFIG.basketball.kickoffPause;
    g.hud.flash(null, text, 'big');
  }

  _score(hoop, scorer) {
    if (this.finished || this.pause > 0 || this._kickoffLater !== undefined) return;
    const g = this.context;
    const m = g.flow.match;
    const team = hoop.forTeam;
    this.points[team]++;
    const own = scorer && scorer.team !== team;
    if (scorer && !own) m.addMoney(scorer.index, CONFIG.economy.basketPoints, 'Cesta no basquete');
    const who = own ? `CESTA CONTRA! (${scorer.name})` : `CESTA DE ${scorer?.name ?? m.teamName(team)}!`;
    g.hud.flash(null, own ? who : `${who} +$${CONFIG.economy.basketPoints}`, 'big');
    if (this.points[team] >= this.need) this._finish();
    else this._kickoffLater = 2.2;
  }

  _finish(text) {
    if (this.finished) return;
    this.finished = true;
    this.endTimer = 2.8;
    if (text) this.context.hud.flash(null, text, 'big');
  }

  update(dt) {
    const g = this.context;
    const m = g.flow.match;
    const score = m.teams.map((t) => `${m.teamName(t)} ${this.points[t]}`).join(' × ');
    g.hud.setPhase(`BASQUETE · ${score} · ${Math.max(0, Math.ceil(this.timer))}s`);

    if (this.finished) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) g.flow.finishMinigame(g.players.map((p) => this.points[p.team]), 'basketball');
      return;
    }
    if (this._kickoffLater !== undefined) {
      this._kickoffLater -= dt;
      if (this._kickoffLater <= 0) { this._kickoffLater = undefined; this._kickoff('BOLA AO ALTO!'); }
      return;
    }
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) g.players.forEach((p) => { p.frozen = false; p.canLook = false; });
      return;
    }

    g.players.forEach((p, i) => {
      const it = g.intents[i];
      if (p.mode !== 'controlled') return;
      if (it.fire) {
        if (g.basketball.holder === p) g.basketball.throw(p);
        else g.grenades.throw(p);
      }
      if (it.melee) p.weapon.tryMelee(g.players, (hit) => shotKnockback(hit.target, hit.direction, PUSH.knockback / 100));
    });

    this.timer -= dt;
    if (this.timer <= 0) this._finish('ACABOU O TEMPO!');
  }

  exit() {
    const g = this.context;
    g.basketball?.destroy();
    g.basketball = null;
    g.grenades.clear();
    g.weaponLabel = null;
    g.views.forEach((v) => { v.viewOverride = null; });
    g.players.forEach((p) => { p.setWeaponLook(p.weapon.def); p.frozen = true; p.canLook = false; });
    g.hud.setCrosshairs(false);
    g.players.forEach((p) => g.flow.match.takeRewards(p.index));
  }
}
