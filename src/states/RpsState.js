// ETAPA 3 — PEDRA, PAPEL E TESOURA (melhor de 3). Mesma lógica do quiz:
// ganhou a rodada → dinheiro · perdeu → teto. Empate na rodada: joga de novo.
// Quem fizer menos pontos é o "perdedor" e fica restrito no PvP seguinte.

import { State } from '../core/StateMachine.js';
import { CONFIG } from '../config.js';
import { punishLaunch } from '../physics/ChaosForces.js';

export const RPS = ['pedra', 'papel', 'tesoura'];
export const RPS_ICON = ['✊', '✋', '✌️'];
const BEATS = { 0: 2, 1: 0, 2: 1 }; // pedra quebra tesoura, papel embrulha pedra, tesoura corta papel

/** Decide os vencedores de uma rodada com N jogadores. null = não escolheu (perde). */
export function resolveRps(picks) {
  const chosen = picks.map((p, i) => ({ p, i })).filter((x) => x.p !== null);
  const symbols = [...new Set(chosen.map((x) => x.p))];
  if (!chosen.length) return [];
  if (symbols.length === 2) {
    const [a, b] = symbols;
    const win = BEATS[a] === b ? a : b;
    return chosen.filter((x) => x.p === win).map((x) => x.i);
  }
  // só um símbolo (ou os três): empate entre quem escolheu; ganha de quem não escolheu
  const somebodyMissed = chosen.length < picks.length;
  return symbols.length === 1 && somebodyMissed ? chosen.map((x) => x.i) : [];
}

export class RpsState extends State {
  enter({ stage } = {}) {
    const g = this.context;
    this.need = Math.ceil((stage?.bestOf ?? 3) / 2);
    this.wins = g.players.map(() => 0);
    this.throws = 0;
    g.combatActive = false;
    g.projectiles.clear();
    g.input.releaseLock();
    g.hud.setCrosshairs(false);
    g.hud.onRps = (pi, choice) => this.pick(pi, choice);
    this._next();
  }

  _next() {
    const g = this.context;
    g.players.forEach((p) => {
      p.teleport(p.spawn.position, p.spawn.yaw);
      p.frozen = true;
      p.canLook = false;
    });
    this.picks = g.players.map(() => null);
    this.timer = CONFIG.rps.timeLimit;
    this.phase = 'asking';
    this.throws++;
    g.hud.setPhase(`PEDRA, PAPEL E TESOURA · MELHOR DE ${this.need * 2 - 1}`);
    g.hud.showRps({ wins: this.wins, need: this.need, reward: CONFIG.economy.rpsWin, round: this.throws });
    g.schemes.forEach((s) => s.onRpsStart?.());
  }

  pick(pi, choice) {
    if (this.phase !== 'asking' || this.picks[pi] !== null || choice < 0 || choice > 2) return;
    this.picks[pi] = choice;
    this.context.hud.markRps(pi, choice);
  }

  update(dt) {
    const g = this.context;
    g.projectiles.drainHits(() => {});
    if (this.phase === 'asking') {
      g.intents.forEach((it, i) => { if (it.answer !== null) this.pick(i, it.answer); });
      this.timer -= dt;
      g.hud.setQuizTimer(Math.max(0, this.timer));
      if (this.timer <= 0 || this.picks.every((p) => p !== null)) this._resolve();
      return;
    }
    this.revealTimer -= dt;
    if (this.revealTimer > 0) return;
    const done = this.wins.some((w) => w >= this.need) || this.throws >= CONFIG.rps.maxThrows;
    if (done) g.flow.finishMinigame(this.wins, 'rps');
    else this._next();
  }

  _resolve() {
    const g = this.context;
    const m = g.flow.match;
    const winners = resolveRps(this.picks);
    this.phase = 'reveal';
    this.revealTimer = CONFIG.quiz.revealTime;
    let text;
    if (!winners.length) {
      text = 'EMPATE! DE NOVO!';
      g.hud.flash(null, text, 'big');
    } else {
      winners.forEach((i) => {
        this.wins[i]++;
        m.addMoney(i, CONFIG.economy.rpsWin, 'Ganhou no pedra-papel-tesoura');
        g.hud.flash(i, `GANHOU! +$${CONFIG.economy.rpsWin}`, 'good');
      });
      g.players.forEach((p, i) => {
        if (winners.includes(i)) return;
        punishLaunch(p); // perdeu a rodada → teto
        g.hud.flash(i, this.picks[i] === null ? 'NÃO ESCOLHEU! PRO TETO!' : 'PERDEU! PRO TETO!', 'bad');
      });
      text = `${winners.map((i) => g.players[i].name).join(' + ')} venceu a rodada`;
    }
    g.hud.revealRps(this.picks, this.wins, text);
    if (winners.length) {
      // alguém vai pro teto: some com o cartão pra todo mundo assistir
      g.hud.hideRps();
      const icons = ['✊', '✋', '✌️'];
      g.hud.strip(g.players.map((p, i) => `${p.name} ${this.picks[i] === null ? '—' : icons[this.picks[i]]} ${this.wins[i]}`).join('   ×   '));
    }
  }

  exit() {
    const g = this.context;
    g.hud.hideRps();
    g.hud.onRps = null;
    g.players.forEach((p) => g.flow.match.takeRewards(p.index));
  }
}
