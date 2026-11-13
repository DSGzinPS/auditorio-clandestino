// Estado de UMA partida: dinheiro, restrições do quiz, rounds por time,
// kills e o histórico de recompensas (para o resumo de fim de round).

import { CONFIG } from '../config.js';
import { shopItem } from '../data/catalog.js';

export class Match {
  constructor(players) {
    this.players = players;
    this.money = players.map(() => CONFIG.economy.startMoney);
    this.teams = [...new Set(players.map((p) => p.team))];
    this.roundsWon = Object.fromEntries(this.teams.map((t) => [t, 0]));
    this.restrictions = players.map(() => null); // null | 'weak' | 'duck'
    this.quizCorrect = players.map(() => 0);
    this.kills = players.map(() => 0);
    this.deaths = players.map(() => 0);
    this.lastKillAt = players.map(() => -Infinity);
    this.rewards = players.map(() => []); // [{amount, reason}] desde o último resumo
    this.time = 0;
    this.roundInStage = 0;
    this.totalRounds = 0;
  }

  // ---------------------------------------------------------------- dinheiro
  addMoney(index, amount, reason) {
    if (!amount) return;
    this.money[index] += amount;
    this.rewards[index].push({ amount, reason });
  }

  takeRewards(index) {
    const r = this.rewards[index];
    this.rewards[index] = [];
    return r;
  }

  /** Kill: base × multiplicadores (headshot, soco, patinho, double kill). */
  rewardKill({ attacker, headshot, kind, weapon }) {
    const e = CONFIG.economy;
    const i = attacker.index;
    let mult = 1;
    const tags = [];
    if (headshot) { mult *= e.headshotMult; tags.push('HEADSHOT'); }
    if (kind === 'melee') { mult *= e.meleeMult; tags.push('NO SOCO'); }
    if (weapon.id === 'duck') { mult *= e.duckKillMult; tags.push('COM O PATINHO'); }
    if (this.time - this.lastKillAt[i] < e.multiKillWindow) { mult *= e.doubleKillMult; tags.push('DOUBLE KILL'); }
    this.lastKillAt[i] = this.time;
    this.kills[i]++;
    const amount = Math.round(e.killReward * mult);
    this.addMoney(i, amount, `Kill${tags.length ? ' · ' + tags.join(' · ') : ''}${mult !== 1 ? ` (x${+mult.toFixed(2)})` : ''}`);
    return { amount, tags, mult };
  }

  // ---------------------------------------------------------------- loja
  defaultWeaponFor(index) {
    return this.restrictions[index] === 'duck' ? 'duck' : 'slingshot';
  }

  canShop(index) {
    return this.restrictions[index] === null;
  }

  /** @returns {{ok:boolean, reason?:string}} */
  buy(index, itemId) {
    const item = shopItem(itemId);
    const p = this.players[index];
    if (!item || item.price == null) return { ok: false, reason: 'Item inexistente' };
    if (!this.canShop(index)) return { ok: false, reason: 'Castigado: elimine alguém para liberar a loja' };
    if (this.money[index] < item.price) return { ok: false, reason: 'Dinheiro insuficiente' };
    if (item.kind === 'weapon' && p.weapon.def.id === item.id) return { ok: false, reason: 'Já está com essa arma' };
    if (item.kind === 'armor' && p.armor >= Math.min(item.points, CONFIG.player.maxArmor)) {
      return { ok: false, reason: 'Já tem colete igual ou melhor' };
    }
    this.money[index] -= item.price;
    if (item.kind === 'weapon') p.weapon.equip(item.id);
    else p.armor = Math.min(item.points, CONFIG.player.maxArmor);
    return { ok: true };
  }

  /** Começo de uma etapa de PvP: todo mundo zera arma e colete. */
  resetLoadouts() {
    this.players.forEach((p, i) => {
      p.armor = 0;
      p.weapon.equip(this.defaultWeaponFor(i));
      p.weapon.thrownDuck = null;
    });
  }

  /** Começo de round: morto perde tudo; vivo mantém (modelo CS). Patinho volta todo round. */
  prepareRound() {
    this.players.forEach((p, i) => {
      const survived = !p.dead;
      p.revive(survived);
      if (!survived || p.weapon.def.type === 'none') p.weapon.equip(this.defaultWeaponFor(i));
      if (this.restrictions[i] === 'duck' && p.weapon.def.id !== 'duck') p.weapon.equip('duck');
      p.weapon.thrownDuck = null;
      p.weapon.refill(); // sobreviveu com a arma: pente e reserva cheios de novo
    });
  }

  aliveTeams() {
    return [...new Set(this.players.filter((p) => !p.dead).map((p) => p.team))];
  }

  teamName(team) {
    return this.players.filter((p) => p.team === team).map((p) => p.name).join(' + ');
  }

  winnerTeams() {
    const best = Math.max(...Object.values(this.roundsWon));
    return this.teams.filter((t) => this.roundsWon[t] === best);
  }
}
