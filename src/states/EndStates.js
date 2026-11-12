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
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) this.context.flow.afterRoundEnd();
  }

  exit() {
    this.context.hud.hideBanner();
  }
}

export class MatchEndState extends State {
  enter() {
    const g = this.context;
    const m = g.flow.match;
    this.timer = CONFIG.match.matchEndTime;
    const winners = m.winnerTeams();
    const title = winners.length > 1 ? 'EMPATE NA PARTIDA!' : `${m.teamName(winners[0])} VENCEU A PARTIDA!`;
    g.players.forEach((p) => { p.frozen = true; });
    g.hud.setPhase('FIM DE PARTIDA');
    g.hud.showMatchSummary(m, title);
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) this.context.flow.newMatch();
  }

  exit() {
    this.context.hud.hideBanner();
  }
}
