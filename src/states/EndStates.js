// Telas de resumo: fim de round (recompensas) e fim de partida (placar).

import { State } from '../core/StateMachine.js';
import { CONFIG } from '../config.js';

export class RoundEndState extends State {
  enter({ winnerTeam }) {
    const g = this.context;
    const m = g.flow.match;
    this.timer = CONFIG.match.roundEndTime;
    const title = winnerTeam === null ? 'ROUND EMPATADO' : `${m.teamName(winnerTeam)} VENCEU O ROUND`;
    const perPlayer = g.players.map((p, i) => m.takeRewards(i));
    g.hud.setPhase('FIM DO ROUND');
    g.hud.showRoundSummary(m, title, perPlayer);
    g.sfx('cheer', null, { amount: 1 });
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) this.context.flow.afterRoundEnd();
  }

  exit() {
    this.context.hud.hideBanner();
  }
}

/**
 * Fim de partida: NÃO recomeça sozinho. Cada jogador escolhe "Pedir revanche" ou
 * "Sair da sala". Revanche só acontece se TODOS aceitarem; se alguém sair, volta ao menu.
 * Votos chegam por clique (HUD), Enter, bot ou rede (intent.rematch / intent.leave).
 */
export class MatchEndState extends State {
  enter() {
    const g = this.context;
    const m = g.flow.match;
    this.votes = g.players.map(() => null); // null | 'rematch' | 'leave'
    this.leaving = null;
    this.leaveTimer = 0;
    const winners = m.winnerTeams();
    const title = winners.length > 1 ? 'EMPATE NA PARTIDA!' : `${m.teamName(winners[0])} VENCEU A PARTIDA!`;
    g.players.forEach((p) => { p.frozen = true; });
    g.hud.setPhase('FIM DE PARTIDA');
    g.hud.showMatchSummary(m, title);
    g.hud.onVote = (pi, v) => this.vote(pi, v);
    g.hud.updateVotes(this.votes);
    g.input.releaseLock();
    g.schemes.forEach((s) => s.onMatchEnd?.());
    g.sfx('horn');
  }

  vote(pi, v) {
    if (this.leaving !== null || this.votes[pi] === v) return;
    const g = this.context;
    this.votes[pi] = v;
    g.hud.updateVotes(this.votes);
    if (v === 'leave') {
      this.leaving = pi;
      this.leaveTimer = 1.8;
      g.hud.flash(null, `${g.players[pi].name} SAIU DA SALA`, 'bad');
      g.onPlayerLeft?.(pi);
    } else if (this.votes.every((x) => x === 'rematch')) {
      g.hud.flash(null, 'REVANCHE ACEITA!', 'big');
      g.sfx('cheer');
      this.restart = 1.2;
    } else {
      g.sfx('ding');
    }
  }

  update(dt) {
    const g = this.context;
    g.intents.forEach((it, i) => {
      if (it.rematch || it.ready) this.vote(i, 'rematch');
      if (it.leave) this.vote(i, 'leave');
    });
    if (this.restart !== undefined) {
      this.restart -= dt;
      if (this.restart <= 0) { this.restart = undefined; g.flow.newMatch(); }
      return;
    }
    if (this.leaving !== null) {
      this.leaveTimer -= dt;
      if (this.leaveTimer <= 0) {
        const who = g.players[this.leaving]?.name ?? 'Alguém';
        this.leaving = null;
        if (g.quitToMenu) g.quitToMenu(`${who} saiu da sala`); else g.flow.match = null;
      }
    }
  }

  exit() {
    const g = this.context;
    g.hud.hideBanner();
    g.hud.onVote = null;
    this.restart = undefined;
  }
}
