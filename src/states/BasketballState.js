// ETAPA 5 — BASQUETE COM BOLA-BOMBA (melhor de 3). Ninguém morre.
// Cada jogador tem a própria bola: ATIRAR arremessa (volta outra pra mão em instantes).
// Na cesta = ponto. No chão ou num jogador = EXPLODE e arremessa todo mundo perto.
// SOCO empurra. Quem voa levanta sozinho, já com a bola na mão.
// Cesta vale dinheiro. Quem fizer menos cestas fica restrito no PvP final.

import { State } from '../core/StateMachine.js';
import { CONFIG } from '../config.js';
import { WEAPONS } from '../data/catalog.js';
import { Basketball } from '../systems/Basketball.js';
import { shotKnockback } from '../physics/ChaosForces.js';

const PUSH_KNOCK = 0.9;

export class BasketballState extends State {
  enter({ stage } = {}) {
    const g = this.context;
    this.need = Math.ceil((stage?.bestOf ?? 3) / 2);
    this.timer = stage?.timeLimit ?? CONFIG.basketball.timeLimit;
    this.points = Object.fromEntries(g.flow.match.teams.map((t) => [t, 0]));
    this.finished = false;
    this.endTimer = 0;
    this._kickoffLater = undefined;

    g.combatActive = false;
    g.projectiles.clear();
    g.basketball = new Basketball(g);
    g.basketball.onScore = (hoop, thrower) => this._score(hoop, thrower);
    g.players.forEach((p) => {
      p.setWeaponLook(WEAPONS.none);
      p.recoverTime = CONFIG.basketball.recoverTime; // levanta mais rápido aqui
    });
    g.weaponLabel = (p) => (g.basketball?.ready(p) ? 'Bola-bomba pronta (ATIRAR)' : `Bola volta em ${g.basketball.reloadLeft(p).toFixed(1)}s`);
    g.views.forEach((v) => { v.viewOverride = () => (g.basketball?.ready(v.character) && v.character.mode === 'controlled' ? 'ball' : 'none'); });
    g.hud.setCrosshairs(true);
    this._kickoff('BASQUETE COM BOLA-BOMBA!');
  }

  _kickoff(text) {
    const g = this.context;
    g.basketball.clear();
    g.players.forEach((p) => {
      p.teleport(p.spawn.position, p.spawn.yaw);
      p.frozen = true;
      p.canLook = true;
    });
    this.pause = CONFIG.basketball.kickoffPause;
    g.hud.flash(null, text, 'big');
  }

  _score(hoop, thrower) {
    if (this.finished || this.pause > 0 || this._kickoffLater !== undefined) return;
    const g = this.context;
    const m = g.flow.match;
    const team = hoop.forTeam;
    this.points[team]++;
    const own = thrower && thrower.team !== team;
    if (thrower && !own) m.addMoney(thrower.index, CONFIG.economy.basketPoints, 'Cesta no basquete');
    g.hud.flash(null, own ? `CESTA CONTRA! (${thrower.name})` : `CESTA DE ${thrower?.name ?? m.teamName(team)}! +$${CONFIG.economy.basketPoints}`, 'big');
    g.sfx('swish', hoop.center);
    g.sfx(own ? 'laugh' : 'cheer', null, { amount: 1 });
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
      if (this._kickoffLater <= 0) { this._kickoffLater = undefined; this._kickoff('VALENDO!'); }
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
      if (it.fire) g.basketball.throw(p);
      if (it.melee) p.weapon.tryMelee(g.players, (hit) => shotKnockback(hit.target, hit.direction, PUSH_KNOCK));
    });

    this.timer -= dt;
    if (this.timer <= 0) this._finish('ACABOU O TEMPO!');
  }

  exit() {
    const g = this.context;
    g.basketball?.destroy();
    g.basketball = null;
    g.weaponLabel = null;
    g.views.forEach((v) => { v.viewOverride = null; });
    g.players.forEach((p) => {
      p.setWeaponLook(p.weapon.def);
      p.recoverTime = undefined;
      p.frozen = true;
      p.canLook = false;
    });
    g.hud.setCrosshairs(false);
    g.players.forEach((p) => g.flow.match.takeRewards(p.index));
  }
}
